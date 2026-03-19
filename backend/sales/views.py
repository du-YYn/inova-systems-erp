import logging
import io
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema
from django.db import models, transaction
from django.db.models import Sum, Count, Q
from django.http import HttpResponse
from django.utils import timezone
from datetime import timedelta

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.units import cm

from django.conf import settings as django_settings
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework.throttling import AnonRateThrottle

from .models import Customer, Prospect, Proposal, Contract, ProspectActivity, WinLossReason
from .serializers import (
    CustomerSerializer, ProspectSerializer,
    ProposalSerializer, ContractSerializer,
    ProspectActivitySerializer, WinLossReasonSerializer,
    WebsiteLeadSerializer,
)
from accounts.permissions import IsAdminOrManager, IsAdminOrManagerOrOperator, IsAdminOrManagerOrOperatorStrict

logger = logging.getLogger('sales')


@extend_schema(tags=['sales'])
class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.select_related('created_by')
    serializer_class = CustomerSerializer
    permission_classes = [IsAdminOrManagerOrOperatorStrict]

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                models.Q(name__icontains=search) |
                models.Q(company_name__icontains=search) |
                models.Q(document__icontains=search) |
                models.Q(email__icontains=search)
            )
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


@extend_schema(tags=['sales'])
class ProspectViewSet(viewsets.ModelViewSet):
    queryset = Prospect.objects.select_related('customer', 'assigned_to', 'created_by')
    serializer_class = ProspectSerializer
    permission_classes = [IsAdminOrManagerOrOperatorStrict]

    def get_queryset(self):
        queryset = super().get_queryset()
        prospect_status = self.request.query_params.get('status', None)
        if prospect_status:
            queryset = queryset.filter(status=prospect_status)
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['get'])
    def pipeline(self, request):
        STATUS_ORDER = [
            'lead_received', 'qualifying', 'qualified', 'not_qualified',
            'scheduled', 'pre_meeting', 'no_show', 'meeting_done',
            'proposal_sent', 'closed', 'not_closed', 'follow_up',
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
        prospect.status = 'qualified' if score >= 3 else 'not_qualified'
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
        prospect.save()
        logger.info(f"Prospect {prospect.id} agendado para {meeting_scheduled_at} por {request.user.username}")
        return Response(ProspectSerializer(prospect).data)

    @action(detail=True, methods=['post'])
    def mark_no_show(self, request, pk=None):
        """Lead não compareceu à reunião."""
        prospect = self.get_object()
        prospect.meeting_attended = False
        prospect.status = 'no_show'
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
        if prospect.status == 'scheduled':
            prospect.status = 'pre_meeting'
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
            serializer.save(number=next_number, created_by=self.request.user)

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
        logger.info(f"Proposta {proposal.id} enviada por {request.user.username}")
        return Response(ProposalSerializer(proposal).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        proposal = self.get_object()
        if proposal.status not in ('sent', 'draft'):
            return Response(
                {'error': f'Proposta não pode ser aprovada (status atual: {proposal.status})'},
                status=status.HTTP_400_BAD_REQUEST
            )
        proposal.status = 'approved'
        proposal.save()
        logger.info(f"Proposta {proposal.id} aprovada por {request.user.username}")
        return Response(ProposalSerializer(proposal).data)

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
        story.append(Paragraph(
            f'<b>Cliente:</b> {proposal.customer.company_name or proposal.customer.name}',
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

            contract = Contract.objects.create(
                proposal=proposal,
                customer=proposal.customer,
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

            proposal.save()

        logger.info(f"Proposta {proposal.id} convertida em contrato {contract.id} por {request.user.username}")
        return Response(ContractSerializer(contract).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=['sales'])
class ContractViewSet(viewsets.ModelViewSet):
    queryset = Contract.objects.select_related('customer', 'proposal', 'created_by')
    serializer_class = ContractSerializer
    permission_classes = [IsAdminOrManager]

    def get_queryset(self):
        queryset = super().get_queryset()
        contract_status = self.request.query_params.get('status', None)
        if contract_status:
            queryset = queryset.filter(status=contract_status)
        return queryset

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
        if contract.status == 'cancelled':
            return Response(
                {'error': 'Contrato já está cancelado'},
                status=status.HTTP_400_BAD_REQUEST
            )
        contract.status = 'cancelled'
        contract.save()
        logger.info(f"Contrato {contract.id} cancelado por {request.user.username}")
        return Response(ContractSerializer(contract).data)

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        qs = self.get_queryset()
        stats = qs.aggregate(
            total=Count('id'),
            active_count=Count('id', filter=Q(status='active')),
            mrr=Sum('monthly_value', filter=Q(status='active')),
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
        if prospect_id:
            queryset = queryset.filter(prospect_id=prospect_id)
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

    def post(self, request):
        api_key = request.headers.get('X-API-Key', '')
        expected_key = getattr(django_settings, 'WEBSITE_API_KEY', '')
        if not expected_key or api_key != expected_key:
            return Response(
                {'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED
            )

        serializer = WebsiteLeadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        prospect = serializer.save()
        logger.info(
            f"Lead recebido do site: {prospect.contact_name} ({prospect.contact_email})"
        )
        return Response(
            {'success': True, 'id': prospect.id}, status=status.HTTP_201_CREATED
        )
