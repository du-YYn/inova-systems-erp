"""API do Portal do Parceiro."""
import logging
import secrets
import string

from django.conf import settings
from django.db.models import Sum, Count, Q
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsAdmin, IsPartner
from .models import Prospect, PartnerCommission

logger = logging.getLogger('sales')


def _generate_password(length=12):
    """Gera senha aleatória segura."""
    alphabet = string.ascii_letters + string.digits + '!@#$%'
    return ''.join(secrets.choice(alphabet) for _ in range(length))


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


# ── Admin: Registrar Parceiro ─────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAdmin])
def register_partner(request):
    """Admin cria parceiro: gera senha, cria profile, envia email boas-vindas."""
    from django.contrib.auth import get_user_model
    from accounts.models import PartnerProfile
    from notifications.email_renderer import send_template_email

    User = get_user_model()

    first_name = request.data.get('first_name', '').strip()
    last_name = request.data.get('last_name', '').strip()
    email = request.data.get('email', '').strip()
    phone = request.data.get('phone', '').strip()
    company_name = request.data.get('company_name', '').strip()

    if not first_name or not email:
        return Response(
            {'error': 'Nome e e-mail são obrigatórios.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(email=email).exists():
        return Response(
            {'error': 'Já existe um usuário com este e-mail.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Gerar senha aleatória
    password = _generate_password()

    # Criar user
    user = User.objects.create_user(
        username=email,
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
        phone=phone,
        role='partner',
        is_active=True,
    )

    # Criar PartnerProfile (ID auto-gerado PRC-XXXXX)
    profile = PartnerProfile(user=user, company_name=company_name, phone=phone)
    profile.save()

    # Enviar email de boas-vindas com credenciais
    portal_url = 'https://parceiro.inovasystemssolutions.com'
    send_template_email.delay('welcome_partner', email, {
        'nome': user.get_full_name() or first_name,
        'email': email,
        'senha': password,
        'link_portal': portal_url,
    })

    logger.info(f"Parceiro {profile.partner_id} ({email}) criado por {request.user.username}")

    return Response({
        'id': user.id,
        'partner_id': profile.partner_id,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'email': user.email,
        'message': f'Parceiro {profile.partner_id} criado. Email de boas-vindas enviado para {email}.',
    }, status=status.HTTP_201_CREATED)


@api_view(['PATCH'])
@permission_classes([IsAdmin])
def update_partner(request, pk):
    """Admin ativa/desativa parceiro."""
    from django.contrib.auth import get_user_model
    User = get_user_model()

    try:
        user = User.objects.get(pk=pk, role='partner')
    except User.DoesNotExist:
        return Response({'error': 'Parceiro não encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    if 'is_active' in request.data:
        user.is_active = request.data['is_active']
        user.save(update_fields=['is_active'])
        action = 'ativado' if user.is_active else 'desativado'
        logger.info(f"Parceiro {user.email} {action} por {request.user.username}")

    return Response({
        'id': user.id,
        'is_active': user.is_active,
        'message': f'Parceiro {action}.',
    })


@api_view(['DELETE'])
@permission_classes([IsAdmin])
def delete_partner(request, pk):
    """Admin exclui parceiro."""
    from django.contrib.auth import get_user_model
    User = get_user_model()

    try:
        user = User.objects.get(pk=pk, role='partner')
    except User.DoesNotExist:
        return Response({'error': 'Parceiro não encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    email = user.email
    # Reatribuir prospects para não quebrar FK PROTECT
    Prospect.objects.filter(created_by=user).update(created_by=request.user)
    user.delete()
    logger.info(f"Parceiro {email} excluído por {request.user.username}")

    return Response({'message': f'Parceiro {email} excluído.'})


# ── Views do Parceiro ─────────────────────────────────────────────────────────

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

    # Notificar equipe por email
    from notifications.email_renderer import send_template_email
    from django.contrib.auth import get_user_model
    User = get_user_model()
    partner_id = ''
    try:
        partner_id = request.user.partner_profile.partner_id
    except Exception:
        pass
    team_emails = User.objects.filter(
        role__in=['admin', 'manager'], is_active=True,
    ).values_list('email', flat=True)
    for email in team_emails:
        if email:
            send_template_email.delay('lead_received', email, {
                'nome_parceiro': request.user.full_name,
                'partner_id': partner_id,
                'empresa_lead': prospect.company_name,
            })

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
