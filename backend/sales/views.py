import hmac
import io
import logging
from datetime import timedelta

from django.conf import settings as django_settings
from django.db import models, transaction
from django.db.models import Count, Q, Sum
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrManagerOrOperator, IsAdminOrManagerOrOperatorStrict
from .models import Customer, Prospect, Proposal, Contract, ProspectActivity, WinLossReason
from .serializers import (
    CustomerSerializer, ProspectSerializer,
    ProposalSerializer, ContractSerializer,
    ProspectActivitySerializer, WinLossReasonSerializer,
    WebsiteLeadSerializer,
)

logger = logging.getLogger('sales')


class DynamicPageSizePagination(PageNumberPagination):
    """Permite que o cliente controle o tamanho da página via ?page_size=N."""
    page_size_query_param = 'page_size'
    max_page_size = 500


@extend_schema(tags=['sales'])
class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.select_related('created_by')
    serializer_class = CustomerSerializer
    permission_classes = [IsAdminOrManagerOrOperatorStrict]
    pagination_class = DynamicPageSizePagination

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get('search', None)
        customer_type = self.request.query_params.get('customer_type', None)
        if search:
            queryset = queryset.filter(
                models.Q(name__icontains=search) |
                models.Q(company_name__icontains=search) |
                models.Q(document__icontains=search) |
                models.Q(email__icontains=search)
            )
        if customer_type:
            queryset = queryset.filter(customer_type=customer_type)
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


@extend_schema(tags=['sales'])
class ProspectViewSet(viewsets.ModelViewSet):
    queryset = Prospect.objects.select_related('customer', 'assigned_to', 'created_by')
    serializer_class = ProspectSerializer
    permission_classes = [IsAdminOrManagerOrOperatorStrict]
    pagination_class = DynamicPageSizePagination

    def get_queryset(self):
        queryset = super().get_queryset()
        prospect_status = self.request.query_params.get('status', None)
        if prospect_status:
            queryset = queryset.filter(status=prospect_status)
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        instance = serializer.save()
        hot_statuses = ('scheduled', 'pre_meeting', 'meeting_done', 'proposal', 'won')
        if instance.status in hot_statuses and instance.temperature != 'hot':
            instance.temperature = 'hot'
            instance.save(update_fields=['temperature'])

    @action(detail=False, methods=['get'])
    def pipeline(self, request):
        STATUS_ORDER = [
            'new', 'qualifying', 'qualified', 'disqualified',
            'scheduled', 'pre_meeting', 'no_show', 'meeting_done',
            'proposal', 'won', 'not_closed', 'lost', 'follow_up',
        ]
        pipeline = self.get_queryset().values('status').annotate(
            count=Count('id'),
            total_value=Sum('estimated_value')
        )
        pipeline_dict = {row['status']: row for row in pipeline}
        ordered = [
            pipeline_dict.get(s, {'status': s, 'count': 0, 'total_value': 0})
            for s in STATUS_ORDER
        ]
        return Response(ordered)

    @action(detail=True, methods=['post'])
    def qualify(self, request, pk=None):
        """Registra os critérios de qualificação e avança o status."""
        prospect = self.get_object()
        data = request.data
        has_operation   = data.get('has_operation')
        has_budget      = data.get('has_budget')
        is_decision_maker = data.get('is_decision_maker')
        has_urgency     = data.get('has_urgency')
        score = sum([
            bool(has_operation), bool(has_budget),
            bool(is_decision_maker), bool(has_urgency),
        ])
        prospect.has_operation    = has_operation
        prospect.has_budget       = has_budget
        prospect.is_decision_maker = is_decision_maker
        prospect.has_urgency      = has_urgency
        prospect.qualification_score = score
        prospect.status = 'qualified' if score >= 3 else 'disqualified'
        prospect.save()
        logger.info(f"Prospect {prospect.id} qualificado (score {score}/4) por {request.user.username}")
        return Response(ProspectSerializer(prospect).data)

    @action(detail=True, methods=['post'])
    def schedule_meeting(self, request, pk=None):
        """Registra o agendamento da reunião via Calendly."""
        prospect = self.get_object()
        closer_name = request.data.get('closer_name', '')
        meeting_scheduled_at = request.data.get('meeting_scheduled_at')
        meeting_link = request.data.get('meeting_link', '')
        if not meeting_scheduled_at:
            return Response({'error': 'meeting_scheduled_at é obrigatório'}, status=status.HTTP_400_BAD_REQUEST)
        prospect.closer_name = closer_name
        prospect.meeting_scheduled_at = meeting_scheduled_at
        prospect.meeting_link = meeting_link
        prospect.status = 'scheduled'
        prospect.temperature = 'hot'
        prospect.save()
        logger.info(f"Prospect {prospect.id} agendado para {meeting_scheduled_at} por {request.user.username}")
        return Response(ProspectSerializer(prospect).data)

    @action(detail=True, methods=['post'])
    def mark_no_show(self, request, pk=None):
        """Lead não compareceu à reunião."""
        prospect = self.get_object()
        prospect.meeting_attended = False
        prospect.status = 'no_show'
        prospect.follow_up_reason = 'nao_compareceu'
        prospect.save()
        logger.info(f"Prospect {prospect.id} marcado como no-show por {request.user.username}")
        return Response(ProspectSerializer(prospect).data)

    @action(detail=True, methods=['post'])
    def mark_attended(self, request, pk=None):
        """Lead compareceu à reunião."""
        prospect = self.get_object()
        prospect.meeting_attended = True
        prospect.status = 'meeting_done'
        prospect.save()
        logger.info(f"Prospect {prospect.id} marcado como reunião realizada por {request.user.username}")
        return Response(ProspectSerializer(prospect).data)

    @action(detail=True, methods=['post'])
    def mark_ebook_sent(self, request, pk=None):
        """Registra que o e-book personalizado foi enviado ao lead."""
        prospect = self.get_object()
        prospect.ebook_sent_at = timezone.now()
        prospect.save()
        logger.info(f"E-book enviado para prospect {prospect.id} por {request.user.username}")
        return Response(ProspectSerializer(prospect).data)


@extend_schema(tags=['sales'])
class ProposalViewSet(viewsets.ModelViewSet):
    queryset = Proposal.objects.select_related('customer', 'prospect', 'assigned_to', 'created_by')
    serializer_class = ProposalSerializer
    permission_classes = [IsAdminOrManagerOrOperatorStrict]

    def get_queryset(self):
        queryset = super().get_queryset()
        prop_status = self.request.query_params.get('status', None)
        if prop_status:
            queryset = queryset.filter(status=prop_status)
        return queryset

    def perform_create(self, serializer):
        with transaction.atomic():
            last_proposal = Proposal.objects.select_for_update().order_by('-id').first()
            if last_proposal:
                try:
                    last_seq = int(last_proposal.number.split('-')[1])
                except (IndexError, ValueError):
                    last_seq = 0
            else:
                last_seq = 0
            next_number = f"PROP-{last_seq + 1:05d}"
            proposal = serializer.save(
                number=next_number,
                status='sent',
                sent_at=timezone.now(),
                created_by=self.request.user,
            )
            if proposal.prospect_id:
                Prospect.objects.filter(pk=proposal.prospect_id).exclude(
                    status__in=['won', 'lost', 'not_closed'],
                ).update(status='proposal')

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        proposal = self.get_object()
        if proposal.status != 'draft':
            return Response(
                {'error': f'Apenas propostas em rascunho podem ser enviadas (status atual: {proposal.status})'},
                status=status.HTTP_400_BAD_REQUEST
            )
        proposal.status = 'sent'
        proposal.sent_at = timezone.now()
        proposal.save()
        # Mover lead para "Proposta Enviada" ao enviar
        if proposal.prospect_id:
            Prospect.objects.filter(pk=proposal.prospect_id).exclude(
                status__in=['won', 'lost', 'not_closed'],
            ).update(status='proposal')
        logger.info(f"Proposta {proposal.id} enviada por {request.user.username}")
        return Response(ProposalSerializer(proposal).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        proposal = self.get_object()
        if proposal.status not in ('sent', 'draft', 'negotiation', 'viewed'):
            return Response(
                {'error': f'Proposta não pode ser aprovada (status atual: {proposal.status})'},
                status=status.HTTP_400_BAD_REQUEST
            )
        proposal.status = 'approved'
        proposal.save()
        if proposal.prospect_id:
            Prospect.objects.filter(pk=proposal.prospect_id).update(status='won')

        # Gerar comissões automaticamente
        self._generate_commissions(proposal, request.user)

        logger.info(f"Proposta {proposal.id} aprovada por {request.user.username}")
        return Response(ProposalSerializer(proposal).data)

    @staticmethod
    def _generate_commissions(proposal, user):
        """Gera ClientCost de comissão Closer/SDR ao aprovar proposta."""
        from finance.models import ClientCost

        total = float(proposal.total_value or 0)
        if total <= 0:
            return

        customer = proposal.customer
        if not customer and proposal.prospect_id:
            # Busca customer vinculado ao prospect
            customer = Customer.objects.filter(
                company_name=proposal.prospect.company_name
            ).first() if proposal.prospect else None

        if not customer:
            return

        ref_month = timezone.now().date().replace(day=1)
        CLOSER_PCT = 10  # 10% para Closer
        SDR_PCT = 5      # 5% para SDR

        for cost_type, pct in [('commission_closer', CLOSER_PCT), ('commission_sdr', SDR_PCT)]:
            ClientCost.objects.create(
                customer=customer,
                cost_type=cost_type,
                value=round(total * pct / 100, 2),
                reference_month=ref_month,
                notes=f'Comissão automática — Proposta #{proposal.number} ({pct}% de R${total:.2f})',
                created_by=user,
            )

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        proposal = self.get_object()
        if proposal.status in ('approved', 'rejected'):
            return Response(
                {'error': f'Proposta não pode ser rejeitada (status atual: {proposal.status})'},
                status=status.HTTP_400_BAD_REQUEST
            )
        proposal.status = 'rejected'
        proposal.save()
        logger.info(f"Proposta {proposal.id} rejeitada por {request.user.username}")
        return Response(ProposalSerializer(proposal).data)

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        proposal = self.get_object()
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer, pagesize=A4,
            rightMargin=2*cm, leftMargin=2*cm,
            topMargin=2*cm, bottomMargin=2*cm,
        )
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'title', parent=styles['Title'],
            textColor=colors.HexColor('#A6864A'), fontSize=20,
        )
        story = []
        story.append(Paragraph('INOVA SYSTEMS', title_style))
        story.append(Paragraph(f'Proposta Comercial #{proposal.number}', styles['Title']))
        story.append(Spacer(1, 0.5*cm))
        story.append(Paragraph(f'<b>Título:</b> {proposal.title}', styles['Normal']))
        if proposal.customer:
            client_name = proposal.customer.company_name or proposal.customer.name
        elif proposal.prospect:
            client_name = proposal.prospect.company_name
        else:
            client_name = '—'
        story.append(Paragraph(f'<b>Cliente:</b> {client_name}', styles['Normal']))
        if proposal.prospect and not proposal.customer:
            story.append(Paragraph(
                f'<b>Contato:</b> {proposal.prospect.contact_name} — {proposal.prospect.contact_email}',
                styles['Normal'],
            ))
        story.append(Paragraph(f'<b>Tipo:</b> {proposal.get_proposal_type_display()}', styles['Normal']))
        story.append(Paragraph(f'<b>Modalidade:</b> {proposal.get_billing_type_display()}', styles['Normal']))
        story.append(Paragraph(
            f'<b>Válida até:</b> {proposal.valid_until.strftime("%d/%m/%Y")}',
            styles['Normal'],
        ))
        story.append(Spacer(1, 0.5*cm))
        if proposal.description:
            story.append(Paragraph('<b>Descrição:</b>', styles['Heading2']))
            story.append(Paragraph(proposal.description, styles['Normal']))
            story.append(Spacer(1, 0.3*cm))
        data = [
            ['Item', 'Valor'],
            ['Horas Estimadas', f'{proposal.hours_estimated}h'],
            ['Taxa Horária', f'R$ {proposal.hourly_rate}'],
            ['Valor Total', f'R$ {proposal.total_value}'],
        ]
        table = Table(data, colWidths=[12*cm, 5*cm])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#A6864A')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')]),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('PADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(table)
        if proposal.notes:
            story.append(Spacer(1, 0.5*cm))
            story.append(Paragraph('<b>Observações:</b>', styles['Heading2']))
            story.append(Paragraph(proposal.notes, styles['Normal']))
        if proposal.terms:
            story.append(Spacer(1, 0.5*cm))
            story.append(Paragraph('<b>Termos e Condições:</b>', styles['Heading2']))
            story.append(Paragraph(proposal.terms, styles['Normal']))
        doc.build(story)
        buffer.seek(0)
        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="proposta-{proposal.number}.pdf"'
        return response

    @action(detail=True, methods=['post'])
    def convert_to_contract(self, request, pk=None):
        proposal = self.get_object()
        if proposal.status != 'approved':
            return Response(
                {'error': 'Apenas propostas aprovadas podem ser convertidas em contrato'},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            last_contract = Contract.objects.select_for_update().order_by('-id').first()
            if last_contract:
                try:
                    last_seq = int(last_contract.number.split('-')[1])
                except (IndexError, ValueError):
                    last_seq = 0
            else:
                last_seq = 0
            next_number = f"CTR-{last_seq + 1:05d}"

            # Resolve customer — auto-create from prospect data if no customer linked
            customer = proposal.customer
            if not customer and proposal.prospect:
                customer, _ = Customer.objects.get_or_create(
                    email=proposal.prospect.contact_email,
                    defaults={
                        'customer_type': 'PJ',
                        'company_name': proposal.prospect.company_name,
                        'name': proposal.prospect.contact_name,
                        'phone': proposal.prospect.contact_phone,
                        'source': 'crm',
                        'created_by': request.user,
                    }
                )
                Prospect.objects.filter(pk=proposal.prospect_id).update(customer=customer)
                Proposal.objects.filter(pk=proposal.pk).update(customer=customer)

            if not customer:
                return Response(
                    {'error': 'Não foi possível determinar o cliente para o contrato.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            contract = Contract.objects.create(
                proposal=proposal,
                customer=customer,
                number=next_number,
                title=proposal.title,
                contract_type=proposal.proposal_type,
                billing_type=proposal.billing_type,
                start_date=timezone.now().date(),
                monthly_value=proposal.total_value,
                hourly_rate=proposal.hourly_rate,
                status='pending_signature',
                notes=proposal.notes,
                terms=proposal.terms,
                created_by=request.user
            )

        logger.info(f"Proposta {proposal.id} convertida em contrato {contract.id} por {request.user.username}")
        return Response(ContractSerializer(contract).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        pipeline_statuses = ['sent', 'viewed', 'negotiation', 'approved']
        qs = Proposal.objects.all()
        stats = qs.aggregate(
            pipeline_count=Count('id', filter=Q(status__in=pipeline_statuses)),
            pipeline_value=Sum('total_value', filter=Q(status__in=pipeline_statuses)),
            approved_count=Count('id', filter=Q(status='approved')),
            approved_value=Sum('total_value', filter=Q(status='approved')),
        )
        return Response({
            'sent_count':     stats['pipeline_count'] or 0,
            'sent_value':     float(stats['pipeline_value'] or 0),
            'approved_count': stats['approved_count'] or 0,
            'approved_value': float(stats['approved_value'] or 0),
        })


@extend_schema(tags=['sales'])
class ContractViewSet(viewsets.ModelViewSet):
    queryset = Contract.objects.select_related('customer', 'proposal', 'created_by')
    serializer_class = ContractSerializer
    permission_classes = [IsAdminOrManagerOrOperatorStrict]

    def get_queryset(self):
        queryset = super().get_queryset()
        contract_status = self.request.query_params.get('status', None)
        search = self.request.query_params.get('search', None)
        if contract_status:
            queryset = queryset.filter(status=contract_status)
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) |
                Q(number__icontains=search) |
                Q(customer__company_name__icontains=search) |
                Q(customer__name__icontains=search)
            )
        return queryset

    def destroy(self, request, *args, **kwargs):
        contract = self.get_object()
        if contract.status in ('active', 'pending_signature', 'renewed'):
            return Response(
                {'error': 'Contratos ativos, em assinatura ou renovados não podem ser excluídos. Cancele-o primeiro.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        with transaction.atomic():
            last_contract = Contract.objects.select_for_update().order_by('-id').first()
            if last_contract:
                try:
                    last_seq = int(last_contract.number.split('-')[1])
                except (IndexError, ValueError):
                    last_seq = 0
            else:
                last_seq = 0
            next_number = f"CTR-{last_seq + 1:05d}"
            serializer.save(number=next_number, created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        contract = self.get_object()
        if contract.status != 'draft':
            return Response(
                {'error': f'Apenas contratos em rascunho podem ser enviados para assinatura (status atual: {contract.status})'},
                status=status.HTTP_400_BAD_REQUEST
            )
        contract.status = 'pending_signature'
        contract.save()
        logger.info(f"Contrato {contract.id} enviado para assinatura por {request.user.username}")
        return Response(ContractSerializer(contract).data)

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        contract = self.get_object()
        if contract.status != 'pending_signature':
            return Response(
                {'error': f'Contrato não pode ser ativado (status atual: {contract.status})'},
                status=status.HTTP_400_BAD_REQUEST
            )
        contract.status = 'active'
        contract.save()
        logger.info(f"Contrato {contract.id} ativado por {request.user.username}")
        return Response(ContractSerializer(contract).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        contract = self.get_object()
        if contract.status not in ('pending_signature', 'active'):
            return Response(
                {'error': f'Contrato não pode ser cancelado (status atual: {contract.status})'},
                status=status.HTTP_400_BAD_REQUEST
            )
        contract.status = 'cancelled'
        contract.save()
        logger.info(f"Contrato {contract.id} cancelado por {request.user.username}")
        return Response(ContractSerializer(contract).data)

    @action(detail=True, methods=['post'])
    def renew(self, request, pk=None):
        contract = self.get_object()
        if contract.status not in ('expired', 'active'):
            return Response(
                {'error': f'Contrato não pode ser renovado (status atual: {contract.status})'},
                status=status.HTTP_400_BAD_REQUEST
            )
        with transaction.atomic():
            contract.status = 'renewed'
            contract.save()

            # Calculate new dates based on original duration
            start_date = timezone.now().date()
            if contract.start_date and contract.end_date:
                duration = contract.end_date - contract.start_date
                end_date = start_date + duration
            else:
                end_date = None

            last = Contract.objects.select_for_update().order_by('-id').first()
            try:
                last_seq = int(last.number.split('-')[1])
            except (IndexError, ValueError, AttributeError):
                last_seq = 0

            new_contract = Contract.objects.create(
                proposal=contract.proposal,
                customer=contract.customer,
                number=f"CTR-{last_seq + 1:05d}",
                title=contract.title,
                contract_type=contract.contract_type,
                billing_type=contract.billing_type,
                start_date=start_date,
                end_date=end_date,
                auto_renew=contract.auto_renew,
                renewal_days=contract.renewal_days,
                monthly_value=contract.monthly_value,
                hourly_rate=contract.hourly_rate,
                total_hours_monthly=contract.total_hours_monthly,
                status='draft',
                notes=contract.notes,
                terms=contract.terms,
                created_by=request.user,
            )
        logger.info(f"Contrato {contract.id} renovado → novo contrato {new_contract.id} por {request.user.username}")
        return Response(ContractSerializer(new_contract).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        # Auto-expire contracts (runs only on dashboard, not every list call)
        try:
            today = timezone.now().date()
            Contract.objects.filter(
                status='active', end_date__isnull=False, end_date__lt=today
            ).update(status='expired')
        except Exception:
            logger.warning("Falha ao auto-expirar contratos", exc_info=True)

        qs = self.get_queryset()
        active_statuses = Q(status='active') | Q(status='renewed')
        stats = qs.aggregate(
            total=Count('id'),
            active_count=Count('id', filter=Q(status='active') | Q(status='renewed')),
            mrr=Sum('monthly_value', filter=active_statuses),
            expiring_count=Count(
                'id',
                filter=Q(status='active', end_date__lte=timezone.now().date() + timedelta(days=30))
            )
        )
        return Response({
            'total_contracts': stats['total'],
            'active_contracts': stats['active_count'],
            'mrr': float(stats['mrr'] or 0),
            'expiring_contracts': stats['expiring_count'],
        })


@extend_schema(tags=['sales'])
class ProspectActivityViewSet(viewsets.ModelViewSet):
    queryset = ProspectActivity.objects.select_related('prospect', 'created_by')
    serializer_class = ProspectActivitySerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    def get_queryset(self):
        queryset = super().get_queryset()
        prospect_id = self.request.query_params.get('prospect', None)
        activity_type = self.request.query_params.get('activity_type', None)
        search = self.request.query_params.get('search', None)
        if prospect_id:
            queryset = queryset.filter(prospect_id=prospect_id)
        if activity_type:
            queryset = queryset.filter(activity_type=activity_type)
        if search:
            queryset = queryset.filter(
                Q(subject__icontains=search) |
                Q(description__icontains=search) |
                Q(prospect__company_name__icontains=search)
            )
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


@extend_schema(tags=['sales'])
class WinLossReasonViewSet(viewsets.ModelViewSet):
    queryset = WinLossReason.objects.select_related('prospect')
    serializer_class = WinLossReasonSerializer
    permission_classes = [IsAdminOrManagerOrOperator]
    http_method_names = ['get', 'post', 'head', 'options']


class WebsiteLeadThrottle(AnonRateThrottle):
    rate = '10/hour'


@extend_schema(tags=['sales'])
class WebsiteLeadCreateView(APIView):
    """Endpoint público para receber leads do site. Protegido por API Key."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [WebsiteLeadThrottle]

    MAX_BODY_SIZE = 16 * 1024  # 16 KB

    def post(self, request):
        client_ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() \
            or request.META.get('REMOTE_ADDR', 'unknown')

        # Rejeitar payloads grandes (proteção DoS)
        if len(request.body) > self.MAX_BODY_SIZE:
            logger.warning(f"Payload too large from {client_ip} ({len(request.body)} bytes)")
            return Response(
                {'error': 'Payload too large'}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
            )

        # Validação timing-safe da API Key
        api_key = request.headers.get('X-API-Key', '')
        expected_key = getattr(django_settings, 'WEBSITE_API_KEY', '')
        if not expected_key or not hmac.compare_digest(api_key, expected_key):
            logger.warning(f"Unauthorized lead submission attempt from {client_ip}")
            return Response(
                {'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED
            )

        serializer = WebsiteLeadSerializer(data=request.data)
        if not serializer.is_valid():
            logger.warning(f"Invalid lead data from {client_ip}: {serializer.errors}")
            return Response(
                {'error': 'Invalid data'}, status=status.HTTP_400_BAD_REQUEST
            )

        prospect = serializer.save()
        logger.info(
            f"Lead recebido do site: {prospect.contact_name} ({prospect.contact_email}) from {client_ip}"
        )
        return Response(
            {'success': True, 'id': prospect.id}, status=status.HTTP_201_CREATED
        )
