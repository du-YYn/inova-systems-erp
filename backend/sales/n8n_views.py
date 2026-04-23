import logging
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import SimpleRateThrottle
from django.core.mail import send_mail
from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from .models import Prospect, Proposal, Customer
from .serializers import ProspectSerializer, ProposalSerializer, ProspectMessageSerializer
from .n8n_auth import N8NApiKeyAuthentication

logger = logging.getLogger('sales')


class N8NRateThrottle(SimpleRateThrottle):
    scope = 'n8n'
    rate = '300/hour'

    def get_cache_key(self, request, view):
        return self.cache_format % {
            'scope': self.scope,
            'ident': request.META.get('REMOTE_ADDR', 'unknown'),
        }


class N8NBaseView(APIView):
    """View base para todos os endpoints n8n."""
    authentication_classes = [N8NApiKeyAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [N8NRateThrottle]


class NewLeadsView(N8NBaseView):
    """
    GET /api/v1/sales/n8n/new-leads/
    Retorna prospects com status='new' (aguardando abordagem do SDR).
    Usado pelo workflow 'SDR - Polling ERP Leads' a cada 2 minutos.
    """

    def get(self, request):
        leads = Prospect.objects.filter(status='new').order_by('created_at')
        data = ProspectSerializer(leads, many=True).data
        return Response({
            'count': len(data),
            'leads': data,
        })


class LeadSearchView(N8NBaseView):
    """
    GET /api/v1/sales/n8n/leads/search/?phone=X&email=X
    Busca prospect por telefone ou email.
    Usado pelo SDR para identificar leads em conversas WhatsApp.
    """

    def get(self, request):
        phone = request.query_params.get('phone', '').strip()
        email = request.query_params.get('email', '').strip()
        name = request.query_params.get('name', '').strip()

        if not phone and not email and not name:
            return Response(
                {'error': 'Informe phone, email ou name'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        filters = Q()
        if phone:
            # Busca flexivel: remove caracteres nao-numericos para comparacao
            clean_phone = ''.join(c for c in phone if c.isdigit())
            if clean_phone:
                filters |= Q(contact_phone__icontains=clean_phone[-8:])
        if email:
            filters |= Q(contact_email__iexact=email)

        leads = Prospect.objects.filter(filters).order_by('-updated_at')[:10]

        # Fallback: se nao encontrou por phone/email e name foi informado, busca por nome
        if not leads.exists() and name:
            leads = Prospect.objects.filter(
                contact_name__icontains=name.split()[0]
            ).order_by('-updated_at')[:10]
        data = ProspectSerializer(leads, many=True).data
        return Response({
            'count': len(data),
            'leads': data,
        })


class LeadUpdateView(N8NBaseView):
    """
    PATCH /api/v1/sales/n8n/leads/<id>/update/
    Atualiza campos do prospect. Aceita campos parciais.
    Usado pelo SDR para registrar qualificacao, agendamento, transcricao, etc.
    """

    # Mapeamento 1:1 de status do n8n para status do ERP
    STATUS_MAP = {
        'qualifying': 'qualifying',
        'qualified': 'qualified',
        'not_qualified': 'disqualified',
        'scheduled': 'scheduled',
        'pre_meeting': 'pre_meeting',
        'no_show': 'no_show',
        'meeting_done': 'meeting_done',
        'proposal_sent': 'proposal',
        'closed': 'won',
        'not_closed': 'not_closed',
        'follow_up': 'follow_up',
    }

    ALLOWED_FIELDS = {
        'status', 'has_operation', 'has_budget', 'is_decision_maker',
        'has_urgency', 'qualification_score', 'closer_name',
        'meeting_scheduled_at', 'meeting_link', 'meeting_transcript',
        'meeting_attended', 'ebook_sent_at',
        'last_message', 'last_message_at', 'temperature',
        'qualification_level', 'usage_type', 'description',
        'follow_up_reason', 'pre_meeting_scenario',
        'follow_up_count', 'last_follow_up_at',
    }

    def patch(self, request, pk):
        try:
            prospect = Prospect.objects.get(pk=pk)
        except Prospect.DoesNotExist:
            return Response(
                {'error': 'Prospect not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = request.data
        updated_fields = []

        for field in self.ALLOWED_FIELDS:
            if field not in data:
                continue
            value = data[field]

            # Tratar status com mapeamento
            if field == 'status':
                value = self.STATUS_MAP.get(value, value)
                # Validar contra choices do model
                valid_statuses = {s[0] for s in Prospect.STATUS_CHOICES}
                if value not in valid_statuses:
                    continue

            # Tratar booleans que vem como string
            if field in ('has_operation', 'has_budget', 'is_decision_maker',
                         'has_urgency', 'meeting_attended'):
                if isinstance(value, str):
                    if value.lower() in ('true', '1'):
                        value = True
                    elif value.lower() in ('false', '0'):
                        value = False
                    elif value.lower() in ('null', 'none', ''):
                        value = None

            if hasattr(prospect, field):
                setattr(prospect, field, value)
                updated_fields.append(field)

        # Recalcular qualification_score se criterios individuais foram atualizados
        criteria_fields = {'has_operation', 'has_budget', 'is_decision_maker', 'has_urgency'}
        if criteria_fields & set(updated_fields):
            prospect.qualification_score = sum([
                bool(prospect.has_operation),
                bool(prospect.has_budget),
                bool(prospect.is_decision_maker),
                bool(prospect.has_urgency),
            ])
            updated_fields.append('qualification_score')

        if updated_fields:
            prospect.save(update_fields=updated_fields + ['updated_at'])
            logger.info(
                f"n8n updated prospect {pk}: {', '.join(updated_fields)}"
            )

        return Response(ProspectSerializer(prospect).data)


class FollowUpLeadsView(N8NBaseView):
    """
    GET /api/v1/sales/n8n/leads/follow-up/
    Retorna leads que precisam de follow-up:
    - Cenario 1: qualificados mas sem reuniao agendada
    - Cenario 2: agendaram mas nao compareceram (no-show)
    Controles:
    - Maximo 2 follow-ups por lead
    - Minimo 48h entre follow-ups
    """

    MAX_FOLLOW_UPS = 2
    MIN_INTERVAL_HOURS = 48

    def get(self, request):
        now = timezone.now()
        min_interval = now - timezone.timedelta(hours=self.MIN_INTERVAL_HOURS)

        # Filtro base: max 2 follow-ups e respeitar intervalo minimo
        base_filter = Q(follow_up_count__lt=self.MAX_FOLLOW_UPS) & (
            Q(last_follow_up_at__isnull=True) | Q(last_follow_up_at__lte=min_interval)
        )

        # Cenario 1: qualificados sem agendamento (qualified ha mais de 24h)
        cenario_1 = Prospect.objects.filter(
            base_filter,
            status='qualified',
            meeting_scheduled_at__isnull=True,
            updated_at__lte=now - timezone.timedelta(hours=24),
        ).values_list('id', flat=True)

        # Cenario 2: no-show detectado (agendamento passou e meeting_attended is null)
        cenario_2_detectado = Prospect.objects.filter(
            base_filter,
            status__in=['scheduled', 'pre_meeting'],
            meeting_scheduled_at__lt=now - timezone.timedelta(hours=1),
            meeting_attended__isnull=True,
        ).values_list('id', flat=True)

        # Cenario 2: ja marcados como no-show
        cenario_2_marcado = Prospect.objects.filter(
            base_filter,
            status='no_show',
        ).values_list('id', flat=True)

        all_ids = set(cenario_1) | set(cenario_2_detectado) | set(cenario_2_marcado)
        leads = Prospect.objects.filter(id__in=all_ids)
        results = []

        for lead in leads:
            lead_data = ProspectSerializer(lead).data
            if lead.id in cenario_1:
                lead_data['cenario'] = 'cenario_1_nao_agendou'
            elif lead.id in cenario_2_detectado:
                lead_data['cenario'] = 'detectado_no_show'
            elif lead.id in cenario_2_marcado:
                lead_data['cenario'] = 'cenario_2_nao_compareceu'
            results.append(lead_data)

        return Response({
            'count': len(results),
            'leads': results,
        })


class ProposalCreateView(N8NBaseView):
    """
    POST /api/v1/sales/n8n/proposals/create/
    Cria uma proposta a partir dos dados do lead.
    Usado pelo Agente de Proposta após agendamento confirmado.
    """

    def post(self, request):
        prospect_id = request.data.get('prospect_id')
        if not prospect_id:
            return Response(
                {'error': 'prospect_id é obrigatório'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            prospect = Prospect.objects.get(pk=prospect_id)
        except Prospect.DoesNotExist:
            return Response(
                {'error': 'Prospect não encontrado'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Buscar ou criar Customer vinculado ao prospect
        if not prospect.customer:
            customer, _ = Customer.objects.get_or_create(
                email=prospect.contact_email,
                defaults={
                    'company_name': prospect.company_name,
                    'name': prospect.contact_name,
                    'phone': prospect.contact_phone,
                    'created_by': request.user,
                },
            )
            prospect.customer = customer
            prospect.save(update_fields=['customer', 'updated_at'])
        else:
            customer = prospect.customer

        # Gerar número sequencial
        from django.db import transaction as db_transaction
        with db_transaction.atomic():
            last_proposal = Proposal.objects.select_for_update().order_by('-id').first()
            if last_proposal:
                try:
                    last_seq = int(last_proposal.number.split('-')[1])
                except (IndexError, ValueError):
                    last_seq = 0
            else:
                last_seq = 0
            next_number = f"PROP-{last_seq + 1:05d}"

            proposal = Proposal.objects.create(
                prospect=prospect,
                customer=customer,
                number=next_number,
                title=request.data.get('title', f'Proposta - {prospect.company_name}'),
                proposal_type=request.data.get('proposal_type', 'mixed'),
                billing_type=request.data.get('billing_type', 'fixed'),
                description=request.data.get('description', prospect.description),
                scope=request.data.get('scope', []),
                deliverables=request.data.get('deliverables', []),
                total_value=request.data.get('total_value', 0),
                valid_until=request.data.get('valid_until', (timezone.now() + timezone.timedelta(days=30)).date()),
                notes=request.data.get('notes', ''),
                status='draft',
                created_by=request.user,
            )

        logger.info(f"n8n created proposal {proposal.number} for prospect {prospect_id}")
        return Response(ProposalSerializer(proposal).data, status=status.HTTP_201_CREATED)


class SendEmailView(N8NBaseView):
    """
    POST /api/v1/sales/n8n/send-email/
    Envia email via backend do Django (SMTP configurado em settings).
    Usado pelo Agente de Email para follow-up.
    """

    def post(self, request):
        to_email = request.data.get('to', '').strip()
        subject = request.data.get('subject', '').strip()
        body = request.data.get('body', '').strip()
        from_email = request.data.get('from', settings.DEFAULT_FROM_EMAIL)

        if not to_email or not subject or not body:
            return Response(
                {'error': 'to, subject e body sao obrigatorios'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            send_mail(
                subject=subject,
                message='',  # texto plano vazio — usamos html_message
                from_email=from_email,
                recipient_list=[to_email],
                html_message=body,
                fail_silently=False,
            )
            from core.logging_utils import mask_email
            logger.info(f"n8n email sent to {mask_email(to_email)}: {subject}")
            return Response({'success': True})
        except Exception as e:
            from core.logging_utils import mask_email
            logger.error(f"n8n email failed to {mask_email(to_email)}: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class MessageCreateView(N8NBaseView):
    """
    POST /api/v1/sales/n8n/messages/
    Registra uma mensagem trocada entre a Beatriz (SDR) e o lead.
    Chamado pelo n8n após cada mensagem enviada/recebida no WhatsApp.
    """

    def post(self, request):
        prospect_id = request.data.get('prospect_id')
        if not prospect_id:
            return Response(
                {'error': 'prospect_id é obrigatório'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            prospect = Prospect.objects.get(pk=prospect_id)
        except Prospect.DoesNotExist:
            return Response(
                {'error': 'Prospect não encontrado'},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ProspectMessageSerializer(data={
            'prospect': prospect.id,
            'direction': request.data.get('direction'),
            'content': request.data.get('content', ''),
            'channel': request.data.get('channel', 'whatsapp'),
            'sent_at': request.data.get('sent_at'),
            'metadata': request.data.get('metadata'),
        })

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        message = serializer.save()

        # Atualizar last_message do prospect para compatibilidade
        if message.direction == 'inbound':
            prospect.last_message = message.content[:500]
            prospect.last_message_at = message.sent_at
            prospect.save(update_fields=['last_message', 'last_message_at', 'updated_at'])

        logger.info(f"n8n message recorded for prospect {prospect_id}: {message.direction}")
        return Response(ProspectMessageSerializer(message).data, status=status.HTTP_201_CREATED)
