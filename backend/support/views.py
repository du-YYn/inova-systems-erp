import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, SAFE_METHODS
from django.utils import timezone
from drf_spectacular.utils import extend_schema

from accounts.permissions import IsAdminOrManagerOrOperator, IsAdminOrManager
from core.audit import log_audit
from .models import (
    SLAPolicy, SupportCategory, SupportTicket, TicketComment,
    KnowledgeBaseArticle, PedidoUpdate,
)
from .serializers import (
    SLAPolicySerializer, SupportCategorySerializer, SupportTicketSerializer,
    TicketCommentSerializer, TicketCommentAdminSerializer,
    KnowledgeBaseArticleSerializer, PedidoUpdateSerializer,
    TicketAnalyzeSerializer, TicketTransitionSerializer,
)
from .services import escalate_inconclusive, promote_pedido_update

logger = logging.getLogger('support')


def _generate_ticket_number():
    """Gera número sequencial TKT-00001."""
    from django.db import transaction
    with transaction.atomic():
        last = SupportTicket.objects.select_for_update().order_by('-id').first()
        seq = (last.id if last else 0) + 1
        return f"TKT-{seq:05d}"


def _calculate_sla_deadlines(ticket):
    """Calcula deadlines de SLA baseado na política e prioridade."""
    if not ticket.sla_policy:
        return
    policy = ticket.sla_policy
    now = timezone.now()
    priority = ticket.priority

    response_hours = float(getattr(policy, f'response_time_{priority}', 8))
    resolution_hours = float(getattr(policy, f'resolution_time_{priority}', 24))

    from datetime import timedelta
    ticket.sla_response_deadline = now + timedelta(hours=response_hours)
    ticket.sla_resolution_deadline = now + timedelta(hours=resolution_hours)


@extend_schema(tags=['support'])
class SLAPolicyViewSet(viewsets.ModelViewSet):
    """S7B.10: config compartilhada — leitura para todos autenticados,
    escrita só admin/manager (antes IsAdminOrManagerOrOperator permitia
    operator alterar política de SLA do tenant inteiro).
    """
    queryset = SLAPolicy.objects.all()
    serializer_class = SLAPolicySerializer

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsAuthenticated()]
        return [IsAdminOrManager()]


@extend_schema(tags=['support'])
class SupportCategoryViewSet(viewsets.ModelViewSet):
    """S7B.10: config compartilhada — escrita só admin/manager."""
    queryset = SupportCategory.objects.all()
    serializer_class = SupportCategorySerializer

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsAuthenticated()]
        return [IsAdminOrManager()]


@extend_schema(tags=['support'])
class SupportTicketViewSet(viewsets.ModelViewSet):
    queryset = SupportTicket.objects.select_related(
        'customer', 'contract', 'project', 'category', 'sla_policy', 'assigned_to', 'created_by'
    ).prefetch_related('comments')
    serializer_class = SupportTicketSerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('priority'):
            qs = qs.filter(priority=params['priority'])
        if params.get('customer'):
            qs = qs.filter(customer_id=params['customer'])
        if params.get('assigned_to'):
            qs = qs.filter(assigned_to_id=params['assigned_to'])
        if params.get('search'):
            from django.db.models import Q
            q = params['search']
            qs = qs.filter(Q(title__icontains=q) | Q(number__icontains=q) | Q(description__icontains=q))
        return qs

    def perform_create(self, serializer):
        ticket = serializer.save(
            created_by=self.request.user,
            number=_generate_ticket_number(),
        )
        _calculate_sla_deadlines(ticket)
        ticket.save(update_fields=['sla_response_deadline', 'sla_resolution_deadline'])
        logger.info(f"Ticket criado: #{ticket.number}")

    @action(detail=True, methods=['post'])
    def assign(self, request, pk=None):
        ticket = self.get_object()
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'error': 'user_id é obrigatório'}, status=status.HTTP_400_BAD_REQUEST)
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'error': 'Usuário não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        ticket.assigned_to = user
        # F6: fluxo novo — chamado aberto vai para triagem ao ser atribuído.
        # 'open' legado segue o mesmo caminho (convivência de release).
        if ticket.status in ('aberto', 'open'):
            ticket.status = 'triagem'
        ticket.save(update_fields=['assigned_to', 'status'])
        return Response(SupportTicketSerializer(ticket).data)

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        ticket = self.get_object()
        old_status = ticket.status
        ticket.status = 'resolvido'
        ticket.resolved_at = timezone.now()
        ticket.save(update_fields=['status', 'resolved_at'])
        log_audit(
            request.user, 'support_ticket_resolve', 'support_ticket', ticket.id,
            old_value={'status': old_status},
            new_value={'status': 'resolvido'},
            request=request,
        )
        return Response(SupportTicketSerializer(ticket).data)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        ticket = self.get_object()
        old_status = ticket.status
        ticket.status = 'fechado'
        ticket.closed_at = timezone.now()
        ticket.save(update_fields=['status', 'closed_at'])
        log_audit(
            request.user, 'support_ticket_close', 'support_ticket', ticket.id,
            old_value={'status': old_status},
            new_value={'status': 'fechado'},
            request=request,
        )
        return Response(SupportTicketSerializer(ticket).data)

    @action(detail=True, methods=['post'])
    def transition(self, request, pk=None):
        """Move o chamado no board do Suporte (v32 F6, doc 05 §2).

        Body: {"status": "aberto|triagem|analise|correcao|resolvido|fechado"}.
        Só aceita statuses do fluxo NOVO. Toda transição gera log_audit.
        """
        ticket = self.get_object()
        input_serializer = TicketTransitionSerializer(data=request.data)
        if not input_serializer.is_valid():
            return Response(input_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        new_status = input_serializer.validated_data['status']
        if new_status == ticket.status:
            return Response(
                {'error': 'O chamado já está neste status.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = ticket.status
        ticket.status = new_status
        update_fields = ['status', 'updated_at']
        if new_status == 'resolvido' and not ticket.resolved_at:
            ticket.resolved_at = timezone.now()
            update_fields.append('resolved_at')
        if new_status == 'fechado' and not ticket.closed_at:
            ticket.closed_at = timezone.now()
            update_fields.append('closed_at')
        ticket.save(update_fields=update_fields)

        log_audit(
            request.user, 'support_ticket_transition', 'support_ticket', ticket.id,
            details=f'{old_status} -> {new_status}',
            old_value={'status': old_status},
            new_value={'status': new_status},
            request=request,
        )
        return Response(SupportTicketSerializer(ticket).data)

    @action(detail=True, methods=['post'])
    def analyze(self, request, pk=None):
        """Conclusão da Análise (v32 F6, doc 05 §3/§4).

        Body: {"conclusao": "garantia|orcamento|inconclusivo|recorrente_corrige"}.
        Lógica condicional por tipo de projeto:
        - Project.tipo == recorrente → força recorrente_corrige (contrato
          mensal sempre corrige, sem orçamento).
        - inconclusivo → escala para a Diretoria (flag AUTOMATION_SUP_ESCALA,
          default dry_run) + Notification para admins; chamado fica em análise.
        - garantia/orcamento/recorrente_corrige → segue para correção.
        """
        ticket = self.get_object()
        if ticket.status not in ('analise', 'in_progress'):
            return Response(
                {'error': 'A conclusão só pode ser registrada com o chamado em análise.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        input_serializer = TicketAnalyzeSerializer(data=request.data)
        if not input_serializer.is_valid():
            return Response(input_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        conclusao = input_serializer.validated_data['conclusao']
        forced = False
        if ticket.project and ticket.project.tipo == 'recorrente':
            # doc 05 §4: projeto recorrente SEMPRE corrige (sem orçamento).
            if conclusao != 'recorrente_corrige':
                forced = True
            conclusao = 'recorrente_corrige'

        old_value = {'status': ticket.status, 'conclusao': ticket.conclusao}
        ticket.conclusao = conclusao
        update_fields = ['conclusao', 'updated_at']
        if conclusao != 'inconclusivo':
            # Análise fechada → correção (garantia/recorrente) ou orçamento.
            ticket.status = 'correcao'
            update_fields.append('status')
        ticket.save(update_fields=update_fields)

        log_audit(
            request.user, 'support_ticket_analyze', 'support_ticket', ticket.id,
            details=(
                f'Conclusão: {conclusao}'
                + (' (forçada — projeto recorrente)' if forced else '')
            ),
            old_value=old_value,
            new_value={'status': ticket.status, 'conclusao': conclusao},
            request=request,
        )

        if conclusao == 'inconclusivo':
            escalate_inconclusive(ticket, request.user, request=request)

        data = SupportTicketSerializer(ticket).data
        data['conclusao_forcada'] = forced
        return Response(data)

    @action(detail=True, methods=['post'], url_path='pedido-update')
    def pedido_update(self, request, pk=None):
        """Triagem `mudanca` → cria PedidoUpdate (v32 F6, doc 05 §6).

        A promoção para Prospect (tech_analysis) acontece depois, na action
        promote do PedidoUpdateViewSet (flag AUTOMATION_SUP_PEDIDO_UPDATE).
        """
        ticket = self.get_object()
        if ticket.ticket_type not in ('mudanca', 'feature'):
            return Response(
                {'error': 'Apenas chamados de mudança geram pedido de update.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not ticket.customer_id:
            return Response(
                {'error': 'O chamado precisa de um cliente vinculado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if PedidoUpdate.objects.filter(
            originating_ticket=ticket, status='opened',
        ).exists():
            return Response(
                {'error': 'Este chamado já tem um pedido de update aberto.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        description = (request.data.get('description') or '').strip() or ticket.description
        pedido = PedidoUpdate.objects.create(
            originating_ticket=ticket,
            customer=ticket.customer,
            description=description,
            created_by=request.user,
        )
        log_audit(
            request.user, 'pedido_update_create', 'pedido_update', pedido.id,
            details=f'Criado a partir do chamado {ticket.number}.',
            new_value={
                'originating_ticket': ticket.id,
                'customer': ticket.customer_id,
                'status': 'opened',
            },
            request=request,
        )
        logger.info(
            'PedidoUpdate %s criado a partir do ticket %s por %s',
            pedido.id, ticket.number, request.user.username,
        )
        return Response(
            PedidoUpdateSerializer(pedido).data, status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        from django.db.models import Count
        qs = self.get_queryset()
        now = timezone.now()
        # F6: agrupa novo + legado (convivência de release até a data
        # migration 0003 rodar em produção).
        open_statuses = [
            'aberto', 'triagem', 'analise', 'correcao',
            'open', 'in_progress', 'pending_client',
        ]
        return Response({
            'total': qs.count(),
            'aberto': qs.filter(status__in=['aberto', 'open']).count(),
            'triagem': qs.filter(status='triagem').count(),
            'analise': qs.filter(status__in=['analise', 'in_progress']).count(),
            'correcao': qs.filter(status='correcao').count(),
            'resolvido': qs.filter(status__in=['resolvido', 'resolved', 'pending_client']).count(),
            'fechado': qs.filter(status__in=['fechado', 'closed']).count(),
            # chaves legadas mantidas para o frontend antigo (remoção F8)
            'open': qs.filter(status__in=['aberto', 'open']).count(),
            'in_progress': qs.filter(status__in=['analise', 'in_progress']).count(),
            'pending_client': qs.filter(status='pending_client').count(),
            'resolved': qs.filter(status__in=['resolvido', 'resolved']).count(),
            'sla_breached': qs.filter(
                sla_resolution_deadline__lt=now,
                status__in=open_statuses,
            ).count(),
            'by_priority': list(qs.values('priority').annotate(count=Count('id'))),
            'by_type': list(qs.values('ticket_type').annotate(count=Count('id'))),
        })


@extend_schema(tags=['support'])
class TicketCommentViewSet(viewsets.ModelViewSet):
    queryset = TicketComment.objects.select_related('user', 'ticket')
    serializer_class = TicketCommentSerializer
    permission_classes = [IsAdminOrManagerOrOperator]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_serializer_class(self):
        """S7B.5: admin/manager usam serializer com is_internal writable."""
        user = getattr(self.request, 'user', None)
        if user and getattr(user, 'role', None) in ('admin', 'manager'):
            return TicketCommentAdminSerializer
        return TicketCommentSerializer

    def get_queryset(self):
        """S7B.5: viewer SEMPRE filtrado em is_internal=False — antes só
        filtrava em LIST mas retrieve(pk) sequencial entregava o comment
        interno (drift LIST vs DETAIL = vetor de enumeração trivial).
        """
        qs = super().get_queryset()
        if ticket_id := self.request.query_params.get('ticket'):
            qs = qs.filter(ticket_id=ticket_id)
        user = getattr(self.request, 'user', None)
        if user and getattr(user, 'role', None) == 'viewer':
            qs = qs.filter(is_internal=False)
        return qs

    def perform_create(self, serializer):
        # S7B.5: operator não escolhe is_internal (read_only no serializer
        # padrão). Default fica do model — comment público.
        comment = serializer.save(user=self.request.user)
        # Marca primeira resposta do ticket
        ticket = comment.ticket
        if not ticket.first_response_at and self.request.user != ticket.created_by:
            ticket.first_response_at = timezone.now()
            ticket.save(update_fields=['first_response_at'])

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrManager])
    def set_internal(self, request, pk=None):
        """S7B.5: admin/manager marca/desmarca comment como interno.

        Endpoint dedicado em vez de aceitar no PATCH genérico — força audit
        trail e separa intenção (mudar conteúdo vs mudar visibilidade).
        Permission class `IsAdminOrManager` já barra operator/viewer.
        """
        comment = self.get_object()
        value = request.data.get('is_internal')
        if value is None:
            return Response(
                {'error': 'is_internal é obrigatório (true/false).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if isinstance(value, str):
            value = value.lower() in ('true', '1', 'yes')
        comment.is_internal = bool(value)
        comment.save(update_fields=['is_internal', 'updated_at'])
        return Response(TicketCommentAdminSerializer(comment).data)


@extend_schema(tags=['support'])
class KnowledgeBaseArticleViewSet(viewsets.ModelViewSet):
    queryset = KnowledgeBaseArticle.objects.select_related('category', 'project', 'created_by')
    serializer_class = KnowledgeBaseArticleSerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('category'):
            qs = qs.filter(category_id=params['category'])
        if params.get('search'):
            from django.db.models import Q
            qs = qs.filter(Q(title__icontains=params['search']) | Q(content__icontains=params['search']))
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        article = self.get_object()
        article.status = 'published'
        article.save(update_fields=['status'])
        return Response(KnowledgeBaseArticleSerializer(article).data)

    @action(detail=True, methods=['post'])
    def helpful(self, request, pk=None):
        article = self.get_object()
        vote = request.data.get('vote')  # 'helpful' or 'not_helpful'
        if vote == 'helpful':
            article.helpful_count += 1
        elif vote == 'not_helpful':
            article.not_helpful_count += 1
        article.save(update_fields=['helpful_count', 'not_helpful_count'])
        return Response({'helpful': article.helpful_count, 'not_helpful': article.not_helpful_count})


@extend_schema(tags=['support'])
class PedidoUpdateViewSet(viewsets.ModelViewSet):
    """Ponte Suporte → Comercial (v32 F6, doc 05 §6).

    Criação normalmente acontece pela action pedido-update do ticket; o
    CRUD direto existe para ajustes. promote/decline são as únicas portas
    de mudança de status (read_only no serializer).
    """
    queryset = PedidoUpdate.objects.select_related(
        'originating_ticket', 'customer', 'prospect', 'created_by',
    )
    serializer_class = PedidoUpdateSerializer
    permission_classes = [IsAdminOrManagerOrOperator]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('customer'):
            qs = qs.filter(customer_id=params['customer'])
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def promote(self, request, pk=None):
        """Promove o pedido → Prospect novo em tech_analysis (doc 05 §6).

        Atrás da flag AUTOMATION_SUP_PEDIDO_UPDATE (off | dry_run | on,
        default dry_run). Em dry_run loga o que faria sem criar Prospect
        nem mudar o pedido.
        """
        pedido = self.get_object()
        if pedido.status != 'opened':
            return Response(
                {'error': 'Apenas pedidos abertos podem ser promovidos.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        flag, prospect = promote_pedido_update(pedido, request.user, request=request)
        if flag != 'on':
            return Response(
                {
                    'promoted': False,
                    'flag': flag,
                    'message': (
                        'Automação em dry_run: a promoção foi simulada e '
                        'registrada na auditoria, sem efeito.'
                        if flag == 'dry_run'
                        else 'Automação desligada (AUTOMATION_SUP_PEDIDO_UPDATE=off).'
                    ),
                },
                status=status.HTTP_202_ACCEPTED,
            )
        return Response(PedidoUpdateSerializer(pedido).data)

    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        """Recusa o pedido de update (não vira Prospect)."""
        pedido = self.get_object()
        if pedido.status != 'opened':
            return Response(
                {'error': 'Apenas pedidos abertos podem ser recusados.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pedido.status = 'declined'
        pedido.save(update_fields=['status'])
        log_audit(
            request.user, 'pedido_update_decline', 'pedido_update', pedido.id,
            old_value={'status': 'opened'},
            new_value={'status': 'declined'},
            request=request,
        )
        return Response(PedidoUpdateSerializer(pedido).data)
