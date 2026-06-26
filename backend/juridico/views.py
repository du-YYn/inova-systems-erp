"""ViewSets do CRM Jurídico (v32 F3, doc processo-v32/02-juridico.md)."""
import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from accounts.permissions import HasSectorAccess
from core.audit import log_audit
from core.validators import validate_file_extension, validate_file_size
from sales.views import DynamicPageSizePagination

from .models import LegalCase, LegalCaseTask
from .serializers import (
    LegalCaseSerializer, LegalCaseTaskSerializer, LegalCaseTransitionSerializer,
)

logger = logging.getLogger('juridico')


@extend_schema(tags=['juridico'])
class LegalCaseViewSet(viewsets.ModelViewSet):
    queryset = (
        LegalCase.objects
        .select_related('customer', 'project', 'created_by', 'onboarding', 'proposal')
        .prefetch_related('events', 'events__created_by', 'tasks', 'tasks__done_by')
    )
    serializer_class = LegalCaseSerializer
    permission_classes = [HasSectorAccess('juridico')]
    pagination_class = DynamicPageSizePagination

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get('process_type'):
            qs = qs.filter(process_type=params['process_type'])
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('customer'):
            qs = qs.filter(customer_id=params['customer'])
        return qs

    def perform_create(self, serializer):
        case = serializer.save(created_by=self.request.user)
        log_audit(
            self.request.user, 'legal_case_create', 'legal_case', case.id,
            new_value={
                'customer': case.customer_id,
                'process_type': case.process_type,
                'status': case.status,
                'source': case.source,
            },
            request=self.request,
        )
        logger.info(
            'LegalCase %s criado (%s) para customer %s por %s',
            case.id, case.process_type, case.customer_id, self.request.user.username,
        )

    def _allowed_targets(self, case):
        """Status válidos a partir do atual, conforme a modalidade do caso.

        Avança exatamente 1 macro-etapa (doc 02 §2). No Aditivo, a etapa
        `aguardando_assinatura` tem DOIS desfechos terminais (doc 09 item 07):
        `assinado` (próximo na ordem) ou `recusado` (ramo de recusa).
        """
        order = LegalCase.status_order_for(case.process_type)
        if case.status not in order:
            return []
        idx = order.index(case.status)
        targets = []
        if idx + 1 < len(order):
            targets.append(order[idx + 1])
        if case.process_type == 'aditivo' and case.status == 'aguardando_assinatura':
            targets.append('recusado')
        return targets

    @action(detail=True, methods=['post'])
    def transition(self, request, pk=None):
        """Avança o caso exatamente 1 macro-etapa da SUA modalidade (doc 02 §2).

        Body: {"status": "<próximo status>", "autentique_id"?, "autentique_link"?}
        Transição inválida (pular etapa, voltar, repetir) retorna 400 sem
        mudar estado. Toda transição gera log_audit com old/new + um
        LegalCaseEvent na timeline do card (doc 09 item 06).
        """
        case = self.get_object()
        input_serializer = LegalCaseTransitionSerializer(data=request.data)
        if not input_serializer.is_valid():
            return Response(input_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        new_status = input_serializer.validated_data['status']

        # Terminalidade é POR MODALIDADE: um caso é terminal quando NÃO há mais
        # alvo permitido na sua ordem (ex.: `assinado` é fim do Contrato, mas na
        # Validação ainda avança p/ `aprovado_dev`). Não usar o set global
        # TERMINAL_STATUSES como short-circuit — ele trava `assinado` para todas
        # as modalidades e mata a 5ª coluna da Validação (doc 06).
        allowed = self._allowed_targets(case)
        if not allowed:
            return Response(
                {'error': (
                    f'Caso em estado terminal ({case.get_status_display()}) — '
                    'não há transição possível.'
                )},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if new_status not in allowed:
            return Response(
                {'error': (
                    f'Transição inválida: {case.status} → {new_status}. '
                    f'Próxima(s) etapa(s) permitida(s): {", ".join(allowed) or "-"}.'
                )},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_value = {
            'status': case.status,
            'autentique_id': case.autentique_id,
            'autentique_link': case.autentique_link,
            'signed_at': case.signed_at.isoformat() if case.signed_at else None,
        }
        old_status = case.status

        case.status = new_status
        # Upload no Autentique acontece na transição de preparação → envio
        # (doc 02 §2): única porta de escrita desses campos até a F7.
        if input_serializer.validated_data.get('autentique_id'):
            case.autentique_id = input_serializer.validated_data['autentique_id']
        if input_serializer.validated_data.get('autentique_link'):
            case.autentique_link = input_serializer.validated_data['autentique_link']
        if new_status == 'assinado':
            case.signed_at = timezone.now()
        case.save()

        new_value = {
            'status': case.status,
            'autentique_id': case.autentique_id,
            'autentique_link': case.autentique_link,
            'signed_at': case.signed_at.isoformat() if case.signed_at else None,
        }
        log_audit(
            request.user, 'legal_case_transition', 'legal_case', case.id,
            details=(
                f'{old_status} -> {new_status} '
                f'(process_type={case.process_type}, autentique_id={case.autentique_id or "-"})'
            ),
            old_value=old_value, new_value=new_value, request=request,
        )

        # Timeline do card (doc 09 item 06): preserva cada passagem, com o
        # documento assinado (link Autentique + data) quando houver.
        if new_status == 'assinado':
            event_type = 'signed'
        elif new_status == 'recusado':
            event_type = 'rejected'
        else:
            event_type = 'status_change'
        case.record_event(
            event_type,
            from_status=old_status, to_status=new_status,
            autentique_link=case.autentique_link,
            signed_at=case.signed_at if new_status == 'assinado' else None,
            created_by=request.user,
        )

        # Semeia o checklist da nova etapa (idempotente).
        from .checklists import seed_stage_tasks
        try:
            seed_stage_tasks(case, new_status)
        except Exception as exc:  # noqa: BLE001 — não derruba a transição
            logger.exception(
                'Falha ao semear tarefas (LegalCase %s, etapa %s): %s',
                case.id, new_status, exc,
            )

        # SAÍDAS por modalidade (doc 02 §3 + doc 09 item 07).
        self._handle_transition_outputs(request, case, new_status)

        return Response(LegalCaseSerializer(case).data)

    def _handle_transition_outputs(self, request, case, new_status):
        """Saídas (automação) das transições, por modalidade.

        - contrato/validacao assinado: log + audit (consumidores reais já
          existem em finance/signals e projects/receivers atrás das suas flags).
        - aditivo assinado: Financeiro ATIVA a cobrança pré-cadastrada.
        - aditivo recusado: Financeiro CANCELA o pré-cadastro.
        Tudo isolado (try/except) p/ não derrubar a transição (CLAUDE.md).
        """
        if new_status == 'assinado' and case.process_type in ('contrato', 'validacao_documento'):
            outcome = (
                'financeiro_liberar_cobranca' if case.process_type == 'contrato'
                else 'producao_liberar_baseline'
            )
            logger.info(
                'SAIDA juridico: LegalCase %s (%s) assinado — consumidor %s '
                '(finance/signals + projects/receivers atras das flags).',
                case.id, case.process_type, outcome,
            )
            log_audit(
                request.user, 'legal_case_signed_output', 'legal_case', case.id,
                details=(
                    f'Saída {outcome} registrada (consumidores em F4/F5 atrás '
                    'das próprias flags de automação).'
                ),
                new_value={'process_type': case.process_type, 'outcome': outcome},
                request=request,
            )

        if case.process_type == 'aditivo' and new_status in ('assinado', 'recusado'):
            from .services import notify_finance_aditivo_outcome
            try:
                notify_finance_aditivo_outcome(case, new_status, user=request.user)
            except Exception as exc:  # noqa: BLE001 — isolamento (CLAUDE.md)
                logger.exception(
                    'Falha na saída do Aditivo p/ Financeiro (LegalCase %s, '
                    'status %s): %s', case.id, new_status, exc,
                )

        # P1.5: Aditivo assinado fecha o loop pro Dev — marca o ChangeRequest
        # vinculado como "Mudança Aprovada" (approved + approved_at/by sistema).
        if case.process_type == 'aditivo' and new_status == 'assinado':
            from .services import approve_change_request_for_aditivo
            try:
                approve_change_request_for_aditivo(case, user=request.user)
            except Exception as exc:  # noqa: BLE001 — isolamento (CLAUDE.md)
                logger.exception(
                    'Falha ao aprovar ChangeRequest do Aditivo (LegalCase %s): %s',
                    case.id, exc,
                )

    @action(
        detail=True, methods=['post'], url_path='upload-attachment',
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_attachment(self, request, pk=None):
        """Anexa/troca a minuta no card (campo attachment). Grava evento + audit."""
        case = self.get_object()
        file = request.FILES.get('attachment')
        if not file:
            return Response(
                {'error': 'Arquivo (attachment) é obrigatório.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            validate_file_extension(file)
            validate_file_size(file)
        except DjangoValidationError as exc:
            return Response({'error': exc.messages}, status=status.HTTP_400_BAD_REQUEST)
        case.attachment = file
        case.save(update_fields=['attachment', 'updated_at'])
        case.record_event(
            'document',
            description=f'Documento anexado: {case.attachment.name}',
            created_by=request.user,
        )
        log_audit(
            request.user, 'legal_case_attachment', 'legal_case', case.id,
            details=f'Anexo {case.attachment.name}', request=request,
        )
        return Response(LegalCaseSerializer(case, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def notes(self, request, pk=None):
        """Atualiza as notas do jurídico no card."""
        case = self.get_object()
        old = case.notes
        case.notes = request.data.get('notes', '')
        case.save(update_fields=['notes', 'updated_at'])
        log_audit(
            request.user, 'legal_case_notes', 'legal_case', case.id,
            old_value={'notes': old}, new_value={'notes': case.notes}, request=request,
        )
        return Response(LegalCaseSerializer(case, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def autentique(self, request, pk=None):
        """Informa/corrige o id + link do Autentique fora da transição."""
        case = self.get_object()
        case.autentique_id = request.data.get('autentique_id', case.autentique_id)
        case.autentique_link = request.data.get('autentique_link', case.autentique_link)
        case.save(update_fields=['autentique_id', 'autentique_link', 'updated_at'])
        case.record_event(
            'document', autentique_link=case.autentique_link,
            description='Link do Autentique atualizado', created_by=request.user,
        )
        log_audit(
            request.user, 'legal_case_autentique', 'legal_case', case.id,
            new_value={
                'autentique_id': case.autentique_id,
                'autentique_link': case.autentique_link,
            },
            request=request,
        )
        return Response(LegalCaseSerializer(case, context={'request': request}).data)


@extend_schema(tags=['juridico'])
class LegalCaseTaskViewSet(viewsets.ModelViewSet):
    """Checklist por etapa do card (workspace). Itens criados via POST são avulsos."""
    queryset = LegalCaseTask.objects.select_related('case', 'done_by')
    serializer_class = LegalCaseTaskSerializer
    permission_classes = [HasSectorAccess('juridico')]
    pagination_class = None  # lista plana — o front consome direto

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get('case'):
            qs = qs.filter(case_id=params['case'])
        if params.get('stage'):
            qs = qs.filter(stage=params['stage'])
        return qs

    def perform_create(self, serializer):
        case = serializer.validated_data['case']
        stage = serializer.validated_data.get('stage') or case.status
        last = case.tasks.filter(stage=stage).order_by('-order').first()
        order = (last.order + 1) if last else 0
        serializer.save(is_custom=True, stage=stage, order=order)

    def perform_update(self, serializer):
        serializer.validated_data.pop('case', None)  # case é imutável após criar (sem re-parent)
        was_done = serializer.instance.done
        task = serializer.save()
        if task.done and not was_done:
            task.done_at = timezone.now()
            task.done_by = self.request.user
            task.save(update_fields=['done_at', 'done_by', 'updated_at'])
        elif not task.done and was_done:
            task.done_at = None
            task.done_by = None
            task.save(update_fields=['done_at', 'done_by', 'updated_at'])
