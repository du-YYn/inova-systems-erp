"""Serializers do CRM Jurídico (v32 F3).

Campos de sistema/webhook são read_only (STRIDE Tampering, doc 08 §8.1):
status, signed_at, autentique_id e autentique_link só mudam pelo endpoint
de ação POST /transition/ — nunca por PATCH direto de campo.
"""
from rest_framework import serializers

from .models import LegalCase


class LegalCaseSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField(read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True, default=None)
    process_type_display = serializers.CharField(source='get_process_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = LegalCase
        fields = [
            'id', 'customer', 'customer_name', 'project', 'project_name',
            'process_type', 'process_type_display', 'status', 'status_display',
            'source', 'autentique_id', 'autentique_link', 'signed_at',
            'notes', 'attachment', 'created_by', 'created_by_name',
            'created_at', 'updated_at',
        ]
        # status muda apenas via POST /transition/ (validação de ordem +
        # auditoria). Campos Autentique/assinatura são definidos pelo fluxo
        # de transição (e pelo webhook HMAC na F7) — nunca por PATCH.
        read_only_fields = [
            'id', 'status', 'autentique_id', 'autentique_link', 'signed_at',
            'created_by', 'created_at', 'updated_at',
        ]

    def get_customer_name(self, obj):
        if not obj.customer:
            return None
        return obj.customer.company_name or obj.customer.name

    def get_created_by_name(self, obj):
        return obj.created_by.full_name if obj.created_by else 'Automação'


class LegalCaseTransitionSerializer(serializers.Serializer):
    """Input do POST /transition/ — avança exatamente 1 macro-etapa.

    autentique_id/autentique_link são aceitos aqui (o upload no Autentique
    acontece na transição Preparação → Envio, doc 02 §2) — é a única porta
    de escrita desses campos até o webhook da F7.
    """
    status = serializers.ChoiceField(choices=LegalCase.STATUS_CHOICES)
    autentique_id = serializers.CharField(max_length=100, required=False, allow_blank=True)
    autentique_link = serializers.URLField(required=False, allow_blank=True)
