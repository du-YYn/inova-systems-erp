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

from .models import Prospect
from .serializers import ProspectSerializer
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

        if not phone and not email:
            return Response(
                {'error': 'Informe phone ou email'},
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

    # Mapeamento de status do n8n para status do ERP
    STATUS_MAP = {
        'qualifying': 'qualifying',
        'qualified': 'qualified',
        'not_qualified': 'disqualified',
        'scheduled': 'discovery',
        'pre_meeting': 'discovery',
        'no_show': 'follow_up',
        'meeting_done': 'proposal',
        'proposal_sent': 'proposal',
        'proposal_draft': 'proposal',
        'closed': 'won',
        'not_closed': 'follow_up',
        'follow_up': 'follow_up',
    }

    ALLOWED_FIELDS = {
        'status', 'has_operation', 'has_budget', 'is_decision_maker',
        'has_urgency', 'qualification_score', 'closer_name',
        'meeting_scheduled_at', 'meeting_transcript', 'meeting_attended',
        'last_message', 'last_message_at', 'temperature',
        'qualification_level', 'usage_type', 'description',
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

            # Campos extras que nao existem no model — registrar como atividade
            if field in ('last_message', 'last_message_at'):
                continue

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
    - Cenario 3: reuniao realizada mas nao fechou
    """

    def get(self, request):
        now = timezone.now()

        # Cenario 1: qualificados sem agendamento (qualified ha mais de 24h)
        cenario_1 = Prospect.objects.filter(
            status='qualified',
            meeting_scheduled_at__isnull=True,
            updated_at__lte=now - timezone.timedelta(hours=24),
        ).values_list('id', flat=True)

        # Cenario 2: no-show detectado (agendamento passou e meeting_attended is null)
        cenario_2_detectado = Prospect.objects.filter(
            status='discovery',
            meeting_scheduled_at__lt=now - timezone.timedelta(hours=1),
            meeting_attended__isnull=True,
        ).values_list('id', flat=True)

        # Cenario 2: ja marcados como no-show
        cenario_2_marcado = Prospect.objects.filter(
            status='follow_up',
            meeting_attended=False,
        ).values_list('id', flat=True)

        # Cenario 3: reuniao realizada mas nao fechou (follow_up com meeting_attended=True)
        cenario_3 = Prospect.objects.filter(
            status='follow_up',
            meeting_attended=True,
        ).values_list('id', flat=True)

        all_ids = set(cenario_1) | set(cenario_2_detectado) | set(cenario_2_marcado) | set(cenario_3)
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
            elif lead.id in cenario_3:
                lead_data['cenario'] = 'cenario_3_nao_fechou'
            results.append(lead_data)

        return Response({
            'count': len(results),
            'leads': results,
        })


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
            logger.info(f"n8n email sent to {to_email}: {subject}")
            return Response({'success': True})
        except Exception as e:
            logger.error(f"n8n email failed to {to_email}: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
