from rest_framework import serializers
from .models import Notification, EmailTemplate


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            'id', 'notification_type', 'title', 'message',
            'object_type', 'object_id', 'is_read', 'read_at', 'created_at'
        ]
        read_only_fields = ['id', 'notification_type', 'title', 'message', 'object_type', 'object_id', 'read_at', 'created_at']


class EmailTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailTemplate
        fields = [
            'id', 'slug', 'name', 'subject', 'body_html',
            'variables', 'recipient_type', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'slug', 'variables', 'recipient_type', 'created_at', 'updated_at']
