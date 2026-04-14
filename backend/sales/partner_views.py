"""API do Portal do Parceiro — endpoints restritos a role=partner."""
import logging

from django.db.models import Sum, Count, Q
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsPartner
from .models import Prospect, PartnerCommission

logger = logging.getLogger('sales')


# ── Serializers ──────────────────────────────────────────────────────────────

class PartnerLeadCreateSerializer(serializers.Serializer):
    """Serializer para parceiro cadastrar um lead."""
    company_name = serializers.CharField(max_length=200)
    contact_name = serializers.CharField(max_length=200)
    contact_email = serializers.EmailField()
    contact_phone = serializers.CharField(max_length=20, required=False, default='')
    description = serializers.CharField(max_length=2000, required=False, default='')
    service_interest = serializers.ListField(
        child=serializers.ChoiceField(choices=Prospect.VALID_SERVICE_INTERESTS),
        default=list, allow_empty=True,
    )


class PartnerLeadListSerializer(serializers.ModelSerializer):
    """Serializer com visão limitada para o parceiro (sem dados pessoais)."""
    status_label = serializers.SerializerMethodField()

    # Mapeamento de status interno → status simplificado para o parceiro
    STATUS_MAP = {
        'new': 'Em análise',
        'qualifying': 'Em análise',
        'qualified': 'Em análise',
        'scheduled': 'Em negociação',
        'pre_meeting': 'Em negociação',
        'meeting_done': 'Em negociação',
        'proposal': 'Em negociação',
        'won': 'Fechado',
        'production': 'Fechado',
        'concluded': 'Concluído',
        'lost': 'Não fechou',
        'not_closed': 'Não fechou',
        'disqualified': 'Não fechou',
        'follow_up': 'Acompanhamento',
        'no_show': 'Acompanhamento',
    }

    def get_status_label(self, obj):
        return self.STATUS_MAP.get(obj.status, obj.status)

    class Meta:
        model = Prospect
        fields = [
            'id', 'company_name', 'status', 'status_label',
            'estimated_value', 'created_at',
        ]


class PartnerCommissionSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='prospect.company_name', read_only=True)

    class Meta:
        model = PartnerCommission
        fields = [
            'id', 'company_name', 'project_value',
            'commission_pct', 'commission_value',
            'status', 'paid_at', 'created_at',
        ]


# ── Views ────────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsPartner])
def partner_leads(request):
    """GET: lista leads do parceiro. POST: cria novo lead."""
    if request.method == 'GET':
        leads = Prospect.objects.filter(
            referred_by=request.user,
        ).order_by('-created_at')
        serializer = PartnerLeadListSerializer(leads, many=True)
        return Response(serializer.data)

    # POST — criar lead
    serializer = PartnerLeadCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    data = serializer.validated_data
    prospect = Prospect.objects.create(
        company_name=data['company_name'],
        contact_name=data['contact_name'],
        contact_email=data['contact_email'],
        contact_phone=data.get('contact_phone', ''),
        description=data.get('description', ''),
        service_interest=data.get('service_interest', []),
        source='referral',
        status='new',
        referred_by=request.user,
        created_by=request.user,
    )
    logger.info(
        f"Lead indicado por parceiro {request.user.username}: "
        f"{prospect.company_name} (prospect {prospect.id})"
    )
    return Response(
        PartnerLeadListSerializer(prospect).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['GET'])
@permission_classes([IsPartner])
def partner_commissions(request):
    """Lista comissões do parceiro."""
    commissions = PartnerCommission.objects.filter(
        partner=request.user,
    ).select_related('prospect').order_by('-created_at')
    serializer = PartnerCommissionSerializer(commissions, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsPartner])
def partner_dashboard(request):
    """Dashboard do parceiro com KPIs."""
    leads = Prospect.objects.filter(referred_by=request.user)
    commissions = PartnerCommission.objects.filter(partner=request.user)

    won_statuses = ('won', 'production', 'concluded')
    stats = leads.aggregate(
        total_leads=Count('id'),
        leads_fechados=Count('id', filter=Q(status__in=won_statuses)),
    )
    commission_stats = commissions.aggregate(
        total_comissao=Sum('commission_value'),
        comissao_pendente=Sum('commission_value', filter=Q(status='pending')),
        comissao_paga=Sum('commission_value', filter=Q(status='paid')),
    )

    # Últimos 5 leads
    recent = PartnerLeadListSerializer(
        leads.order_by('-created_at')[:5], many=True,
    ).data

    return Response({
        'total_leads': stats['total_leads'] or 0,
        'leads_fechados': stats['leads_fechados'] or 0,
        'total_comissao': float(commission_stats['total_comissao'] or 0),
        'comissao_pendente': float(commission_stats['comissao_pendente'] or 0),
        'comissao_paga': float(commission_stats['comissao_paga'] or 0),
        'ultimos_leads': recent,
    })
