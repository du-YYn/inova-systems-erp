"""Serializers do CRM Jurídico (v32 F3).

Campos de sistema/webhook são read_only (STRIDE Tampering, doc 08 §8.1):
status, signed_at, autentique_id e autentique_link só mudam pelo endpoint
de ação POST /transition/ — nunca por PATCH direto de campo.
"""
from rest_framework import serializers

from .models import LegalCase, LegalCaseEvent, LegalCaseTask


class LegalCaseEventSerializer(serializers.ModelSerializer):
    """Item da timeline do card (doc 09 item 06) — read-only."""
    event_type_display = serializers.CharField(
        source='get_event_type_display', read_only=True,
    )
    created_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = LegalCaseEvent
        fields = [
            'id', 'event_type', 'event_type_display',
            'from_status', 'to_status', 'from_process_type', 'to_process_type',
            'autentique_link', 'signed_at', 'description', 'metadata',
            'created_by', 'created_by_name', 'created_at',
        ]
        read_only_fields = fields

    def get_created_by_name(self, obj):
        return obj.created_by.full_name if obj.created_by else 'Automação'


class LegalCaseTaskSerializer(serializers.ModelSerializer):
    """Item de checklist do card (workspace). Usado nested (read) e no viewset (write)."""
    done_by_name = serializers.SerializerMethodField(read_only=True)
    stage = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = LegalCaseTask
        fields = [
            'id', 'case', 'stage', 'label', 'done', 'done_at', 'done_by',
            'done_by_name', 'order', 'is_custom', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'done_at', 'done_by', 'done_by_name', 'order', 'is_custom',
            'created_at', 'updated_at',
        ]

    def get_done_by_name(self, obj):
        return obj.done_by.full_name if obj.done_by else ''


class LegalCaseSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField(read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True, default=None)
    process_type_display = serializers.CharField(source='get_process_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.SerializerMethodField(read_only=True)
    # Painéis read-only do card (doc 09 item 05): dados do cliente (onboarding)
    # + termos da proposta. Timeline de movimentação (item 06).
    onboarding_data = serializers.SerializerMethodField(read_only=True)
    proposal_data = serializers.SerializerMethodField(read_only=True)
    events = LegalCaseEventSerializer(many=True, read_only=True)
    tasks = LegalCaseTaskSerializer(many=True, read_only=True)

    class Meta:
        model = LegalCase
        fields = [
            'id', 'customer', 'customer_name', 'project', 'project_name',
            'onboarding', 'onboarding_data', 'proposal', 'proposal_data',
            'process_type', 'process_type_display', 'status', 'status_display',
            'source', 'autentique_id', 'autentique_link', 'signed_at',
            'notes', 'attachment', 'created_by', 'created_by_name',
            'events', 'tasks', 'created_at', 'updated_at',
        ]
        # status muda apenas via POST /transition/ (validação de ordem +
        # auditoria). Campos Autentique/assinatura são definidos pelo fluxo
        # de transição (e pelo webhook HMAC na F7) — nunca por PATCH. Os
        # vínculos onboarding/proposal são setados pela automação/produtor.
        read_only_fields = [
            'id', 'status', 'autentique_id', 'autentique_link', 'signed_at',
            'onboarding', 'proposal', 'created_by', 'created_at', 'updated_at',
        ]

    def get_customer_name(self, obj):
        if not obj.customer:
            return None
        return obj.customer.company_name or obj.customer.name

    def get_created_by_name(self, obj):
        return obj.created_by.full_name if obj.created_by else 'Automação'

    def get_onboarding_data(self, obj):
        """📋 Dados do Cliente (do onboarding) — painel read-only do card."""
        ob = obj.onboarding
        if ob is None:
            return None
        return {
            'id': ob.id,
            'status': ob.status,
            'company_legal_name': ob.company_legal_name,
            'company_cnpj': ob.company_cnpj,
            'company_city': ob.company_city,
            'company_state': ob.company_state,
            'rep_full_name': ob.rep_full_name,
            'rep_cpf': ob.rep_cpf,
            'rep_marital_status': ob.rep_marital_status,
            'rep_profession': ob.rep_profession,
            'finance_contact_name': ob.finance_contact_name,
            'finance_contact_email': ob.finance_contact_email,
            'finance_contact_phone': ob.finance_contact_phone,
            'submitted_at': ob.submitted_at,
        }

    def get_proposal_data(self, obj):
        """📄 Proposta fechada (da proposal) — painel read-only do card.

        Inclui o plano de pagamento completo (setup + mensal) e os serviços
        do escopo, lidos por referência da proposta aprovada vinculada.
        """
        p = obj.proposal
        if p is None:
            return None
        from sales.models import ProposalPaymentPlan
        # OneToOne reverso (p.payment_plan) levanta se ausente — usar filter().
        plan = ProposalPaymentPlan.objects.filter(proposal=p).first()
        plan_data = None
        if plan is not None:
            plan_data = {
                'plan_type': plan.plan_type,
                'plan_type_display': plan.get_plan_type_display(),
                'one_time_amount': str(plan.one_time_amount),
                'one_time_method': plan.one_time_method,
                'one_time_method_display': (
                    plan.get_one_time_method_display() if plan.one_time_method else ''
                ),
                'one_time_installments': plan.one_time_installments,
                'one_time_first_due': plan.one_time_first_due,
                'recurring_amount': str(plan.recurring_amount),
                'recurring_method': plan.recurring_method,
                'recurring_method_display': (
                    plan.get_recurring_method_display() if plan.recurring_method else ''
                ),
                'recurring_day_of_month': plan.recurring_day_of_month,
                'recurring_duration_months': plan.recurring_duration_months,
                'recurring_first_due': plan.recurring_first_due,
            }
        services = [
            {'name': si.service.name, 'notes': si.notes}
            for si in p.service_items.select_related('service').order_by('display_order', 'id')
        ]
        return {
            'id': p.id,
            'number': p.number,
            'title': p.title,
            'status': p.status,
            'total_value': str(p.total_value),
            'billing_type': p.billing_type,
            'proposal_file': p.proposal_file.url if p.proposal_file else None,
            'public_token': str(p.public_token) if p.public_token else None,
            'payment_plan': plan_data,
            'services': services,
        }


class LegalCaseTransitionSerializer(serializers.Serializer):
    """Input do POST /transition/ — avança exatamente 1 macro-etapa.

    autentique_id/autentique_link são aceitos aqui (o upload no Autentique
    acontece na transição Preparação → Envio, doc 02 §2) — é a única porta
    de escrita desses campos até o webhook da F7.
    """
    status = serializers.ChoiceField(choices=LegalCase.STATUS_CHOICES)
    autentique_id = serializers.CharField(max_length=100, required=False, allow_blank=True)
    autentique_link = serializers.URLField(required=False, allow_blank=True)
