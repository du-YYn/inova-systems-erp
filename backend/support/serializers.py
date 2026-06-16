from rest_framework import serializers
from .models import (
    SLAPolicy, SupportCategory, SupportTicket, TicketComment, TicketAttachment,
    KnowledgeBaseArticle, PedidoUpdate,
)


class SLAPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = SLAPolicy
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class SupportCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportCategory
        fields = '__all__'
        read_only_fields = ['id']


class TicketCommentSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = TicketComment
        fields = ['id', 'ticket', 'user', 'user_name', 'content', 'is_internal', 'created_at', 'updated_at']
        # S7B.5: is_internal é read_only no serializer padrão — só admin/manager
        # alteram, via método explícito no ViewSet (set_internal). Antes:
        # operator marcava own comment como internal e escondia do viewer/cliente.
        read_only_fields = ['id', 'user', 'user_name', 'is_internal', 'created_at', 'updated_at']

    def get_user_name(self, obj):
        return obj.user.get_full_name() or obj.user.username


class TicketCommentAdminSerializer(TicketCommentSerializer):
    """S7B.5: variante para admin/manager que permite setar/alterar is_internal."""

    class Meta(TicketCommentSerializer.Meta):
        read_only_fields = ['id', 'user', 'user_name', 'created_at', 'updated_at']


class TicketAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketAttachment
        fields = ['id', 'ticket', 'comment', 'file', 'filename', 'file_size', 'uploaded_by', 'created_at']
        read_only_fields = ['id', 'uploaded_by', 'created_at']


class SupportTicketSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    sla_policy_name = serializers.SerializerMethodField()
    comments_count = serializers.SerializerMethodField()
    is_sla_breached = serializers.SerializerMethodField()

    project_tipo = serializers.CharField(source='project.tipo', read_only=True, default=None)

    class Meta:
        model = SupportTicket
        fields = [
            'id', 'number', 'title', 'description', 'customer', 'customer_name',
            'contract', 'project', 'project_tipo', 'category', 'sla_policy', 'sla_policy_name',
            'ticket_type', 'priority', 'status', 'assigned_to', 'assigned_to_name',
            'conclusao', 'contexto', 'originating_proposal',
            'sla_response_deadline', 'sla_resolution_deadline',
            'first_response_at', 'resolved_at', 'closed_at',
            'contact_name', 'contact_email', 'tags',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
            'comments_count', 'is_sla_breached',
        ]
        # S7C1: status/resolved_at/closed_at/first_response_at e sla_*_deadline
        # sao gerenciados pelas actions assign/resolve/close. PATCH direto
        # burlava transicoes e zerava breach do SLA dashboard (KPIs adulterados).
        # F6: conclusao so muda via POST /analyze/ (logica por tipo de projeto
        # + escalacao); originating_proposal e' preenchido pelo fluxo do
        # orcamento — ambos read_only (STRIDE Tampering, doc 08 §8.1).
        read_only_fields = [
            'id', 'number', 'created_by', 'created_by_name',
            'created_at', 'updated_at',
            'status', 'resolved_at', 'closed_at', 'first_response_at',
            'sla_response_deadline', 'sla_resolution_deadline',
            'conclusao', 'originating_proposal',
        ]

    def get_customer_name(self, obj):
        if obj.customer:
            return obj.customer.company_name or obj.customer.name
        return None

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return obj.assigned_to.get_full_name() or obj.assigned_to.username
        return None

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return None

    def get_sla_policy_name(self, obj):
        return obj.sla_policy.name if obj.sla_policy else None

    def get_comments_count(self, obj):
        return obj.comments.count()

    def get_is_sla_breached(self, obj):
        from django.utils import timezone
        now = timezone.now()
        # F6: statuses terminais novos + legados (convivência de release)
        if obj.status in ('resolvido', 'fechado', 'resolved', 'closed'):
            return False
        if obj.sla_resolution_deadline and now > obj.sla_resolution_deadline:
            return True
        return False


class KnowledgeBaseArticleSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    category_name = serializers.SerializerMethodField()

    class Meta:
        model = KnowledgeBaseArticle
        fields = [
            'id', 'title', 'slug', 'content', 'summary', 'category', 'category_name',
            'project', 'status', 'is_public', 'views_count', 'helpful_count',
            'not_helpful_count', 'tags', 'created_by', 'created_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'slug', 'views_count', 'helpful_count', 'not_helpful_count',
            'created_by', 'created_at', 'updated_at',
        ]

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username

    def get_category_name(self, obj):
        return obj.category.name if obj.category else None


# ─── v32 F6 (doc 05) ─────────────────────────────────────────────────────────

class TicketTransitionSerializer(serializers.Serializer):
    """Input do POST /tickets/{id}/transition/ — board do Suporte.

    Aceita apenas os statuses do fluxo NOVO (aberto → triagem → analise →
    correcao → resolvido → fechado). Statuses legados não são alvos válidos.
    """
    status = serializers.ChoiceField(
        choices=[(s, s) for s in SupportTicket.STATUS_FLOW],
    )


class TicketAnalyzeSerializer(serializers.Serializer):
    """Input do POST /tickets/{id}/analyze/ — conclusão da Análise (doc 05 §3)."""
    conclusao = serializers.ChoiceField(choices=SupportTicket.CONCLUSAO_CHOICES)


class PedidoUpdateSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    ticket_number = serializers.CharField(
        source='originating_ticket.number', read_only=True, default=None,
    )
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    prospect_status = serializers.CharField(
        source='prospect.status', read_only=True, default=None,
    )

    class Meta:
        model = PedidoUpdate
        fields = [
            'id', 'originating_ticket', 'ticket_number', 'customer',
            'customer_name', 'description', 'status', 'status_display',
            'prospect', 'prospect_status', 'requested_at', 'promoted_at',
            'created_by',
        ]
        # status/prospect/promoted_at mudam apenas via actions promote/decline
        # (flag AUTOMATION_SUP_PEDIDO_UPDATE + auditoria).
        read_only_fields = [
            'id', 'status', 'prospect', 'requested_at', 'promoted_at',
            'created_by',
        ]

    def get_customer_name(self, obj):
        if not obj.customer:
            return None
        return obj.customer.company_name or obj.customer.name


class PublicTicketCreateSerializer(serializers.Serializer):
    """Input do canal público de chamados (doc 05 §9) — POST sem login.

    Payload mínimo: título + descrição + contato opcional + anexo opcional
    (texto/imagem/vídeo/áudio). Nenhum campo de sistema é aceito.
    """
    title = serializers.CharField(max_length=300)
    description = serializers.CharField()
    contact_name = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    contact_email = serializers.EmailField(required=False, allow_blank=True, default='')
    attachment = serializers.FileField(required=False, allow_null=True, default=None)
