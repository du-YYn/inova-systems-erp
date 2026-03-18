from rest_framework import serializers
from .models import SLAPolicy, SupportCategory, SupportTicket, TicketComment, TicketAttachment, KnowledgeBaseArticle


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
        read_only_fields = ['id', 'user', 'user_name', 'created_at', 'updated_at']

    def get_user_name(self, obj):
        return obj.user.get_full_name() or obj.user.username


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

    class Meta:
        model = SupportTicket
        fields = [
            'id', 'number', 'title', 'description', 'customer', 'customer_name',
            'contract', 'project', 'category', 'sla_policy', 'sla_policy_name',
            'ticket_type', 'priority', 'status', 'assigned_to', 'assigned_to_name',
            'sla_response_deadline', 'sla_resolution_deadline',
            'first_response_at', 'resolved_at', 'closed_at',
            'contact_name', 'contact_email', 'tags',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
            'comments_count', 'is_sla_breached',
        ]
        read_only_fields = ['id', 'number', 'created_by', 'created_by_name', 'created_at', 'updated_at']

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
        if obj.status in ('resolved', 'closed'):
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
