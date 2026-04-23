import logging

from django.db import transaction
from rest_framework import serializers
from core.validators import validate_cpf, validate_cnpj
from .models import (
    Customer, Prospect, Proposal, Contract, ProspectActivity,
    WinLossReason, ProspectMessage, ClientOnboarding,
    Service, ProposalService, ProposalPaymentPlan,
    ContractService, ContractPaymentPlan,
)

logger = logging.getLogger(__name__)


class CustomerSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(
        source="created_by.username", read_only=True
    )

    class Meta:
        model = Customer
        fields = [
            "id",
            "customer_type",
            "segment",
            "company_name",
            "trading_name",
            "name",
            "document",
            "state_registration",
            "municipal_registration",
            "email",
            "phone",
            "website",
            "address",
            "city",
            "state",
            "cep",
            "contacts",
            "contract_value",
            "billing_frequency",
            "is_active",
            "source",
            "notes",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_by_name", "created_at", "updated_at"]


class ProspectSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(
        source="customer.company_name", read_only=True
    )
    assigned_to_name = serializers.CharField(
        source="assigned_to.username", read_only=True
    )
    created_by_name = serializers.CharField(
        source="created_by.username", read_only=True
    )
    referred_by_name = serializers.SerializerMethodField()
    referred_by_partner_id = serializers.SerializerMethodField()
    meets_qualification = serializers.SerializerMethodField()
    days_since_created = serializers.SerializerMethodField()
    service_interest = serializers.ListField(
        child=serializers.ChoiceField(choices=Prospect.VALID_SERVICE_INTERESTS),
        default=list,
        allow_empty=True,
    )

    def get_referred_by_name(self, obj):
        if obj.referred_by_id:
            return obj.referred_by.full_name
        return None

    def get_referred_by_partner_id(self, obj):
        # Só expõe partner_id para admin/manager (proteção de dados do parceiro)
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user.role not in ('admin', 'manager'):
            return None
        if obj.referred_by_id:
            try:
                return obj.referred_by.partner_profile.partner_id
            except Exception:
                return None
        return None

    def get_meets_qualification(self, obj):
        return obj.qualification_score >= 3

    def get_days_since_created(self, obj):
        from django.utils import timezone
        delta = timezone.now() - obj.created_at
        return delta.days

    # Campos considerados sensíveis sob ótica LGPD — ocultados para role=viewer:
    # - quiz_data / meeting_transcript: conteúdo livre digitado pelo lead, pode
    #   conter dados pessoais (endereço, histórico médico, etc.)
    # - payment_*: método e valores de pagamento do lead
    # - pre_meeting_scenario: estratégia comercial privada
    _SENSITIVE_FIELDS = (
        'quiz_data', 'meeting_transcript', 'pre_meeting_scenario',
        'payment_method', 'payment_type', 'payment_split_pct',
        'payment_installments', 'payment_monthly_value', 'payment_due_day',
        'payment_duration_months', 'payment_first_due',
    )

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        # Apenas role=viewer recebe versão reduzida; admin/manager/operator
        # continuam com acesso completo (operador precisa pra tocar o funil).
        if user and getattr(user, 'role', None) == 'viewer':
            for field in self._SENSITIVE_FIELDS:
                data.pop(field, None)
        return data

    class Meta:
        model = Prospect
        fields = [
            "id",
            "customer",
            "customer_name",
            "company_name",
            "contact_name",
            "contact_email",
            "contact_phone",
            "source",
            "status",
            "service_interest",
            "temperature",
            "estimated_value",
            "proposal_value",
            "description",
            "next_action",
            "next_action_date",
            "assigned_to",
            "assigned_to_name",
            # qualificação
            "qualification_level",
            "usage_type",
            "quiz_data",
            "company_size",
            "has_operation",
            "has_budget",
            "is_decision_maker",
            "has_urgency",
            "qualification_score",
            "meets_qualification",
            # agendamento
            "closer_name",
            "meeting_scheduled_at",
            "meeting_link",
            "meeting_attended",
            # pós-agendamento
            "ebook_sent_at",
            "meeting_transcript",
            # follow-up
            "follow_up_reason",
            "follow_up_count",
            "last_follow_up_at",
            # pré-reunião
            "pre_meeting_scenario",
            # última mensagem
            "last_message",
            "last_message_at",
            # pagamento
            "payment_method",
            "payment_type",
            "payment_split_pct",
            "payment_installments",
            "payment_monthly_value",
            "payment_due_day",
            "payment_duration_months",
            "payment_first_due",
            # parceiro
            "referred_by",
            "referred_by_name",
            "referred_by_partner_id",
            # meta
            "created_by",
            "created_by_name",
            "days_since_created",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id", "created_by", "created_at", "updated_at",
            "meets_qualification", "days_since_created",
        ]


class ServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = [
            "id", "code", "name", "description",
            "default_recurrence", "is_active", "display_order",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ProposalServiceSerializer(serializers.ModelSerializer):
    service_code = serializers.CharField(source='service.code', read_only=True)
    service_name = serializers.CharField(source='service.name', read_only=True)
    service_default_recurrence = serializers.CharField(
        source='service.default_recurrence', read_only=True,
    )

    class Meta:
        model = ProposalService
        fields = [
            "id", "service", "service_code", "service_name",
            "service_default_recurrence", "notes", "display_order",
        ]


class ProposalPaymentPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProposalPaymentPlan
        fields = [
            "plan_type",
            "one_time_amount", "one_time_method", "one_time_installments",
            "one_time_first_due", "one_time_notes",
            "recurring_amount", "recurring_method", "recurring_day_of_month",
            "recurring_duration_months", "recurring_first_due", "recurring_notes",
        ]


class ContractServiceSerializer(serializers.ModelSerializer):
    service_code = serializers.CharField(source='service.code', read_only=True)
    service_name = serializers.CharField(source='service.name', read_only=True)
    service_default_recurrence = serializers.CharField(
        source='service.default_recurrence', read_only=True,
    )

    class Meta:
        model = ContractService
        fields = [
            "id", "service", "service_code", "service_name",
            "service_default_recurrence", "notes", "display_order",
        ]


class ContractPaymentPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContractPaymentPlan
        fields = [
            "plan_type",
            "one_time_amount", "one_time_method", "one_time_installments",
            "one_time_first_due", "one_time_notes",
            "recurring_amount", "recurring_method", "recurring_day_of_month",
            "recurring_duration_months", "recurring_first_due", "recurring_notes",
        ]


def _sync_proposal_services(proposal, service_ids):
    """Sincroniza serviços da proposta de forma atômica e segura.

    Usa transaction.atomic — ou deleta e recria todos, ou mantém intocado.
    IDs inexistentes são pulados silenciosamente (logged warning) — sem
    IntegrityError de FK. Faz .get() primeiro para validar o Service existe,
    em vez de depender do DB reclamar da FK depois.
    """
    with transaction.atomic():
        proposal.service_items.all().delete()
        for order, sid in enumerate(service_ids):
            try:
                service = Service.objects.get(id=sid)
            except Service.DoesNotExist:
                logger.warning(
                    f'Service id={sid} não existe — ignorado em proposal {proposal.id}'
                )
                continue
            ProposalService.objects.create(
                proposal=proposal, service=service, display_order=order,
            )


def _sync_contract_services(contract, service_ids):
    """Sincroniza serviços do contrato (mesma estratégia da proposta)."""
    with transaction.atomic():
        contract.service_items.all().delete()
        for order, sid in enumerate(service_ids):
            try:
                service = Service.objects.get(id=sid)
            except Service.DoesNotExist:
                logger.warning(
                    f'Service id={sid} não existe — ignorado em contract {contract.id}'
                )
                continue
            ContractService.objects.create(
                contract=contract, service=service, display_order=order,
            )


class ProposalSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    prospect_company = serializers.SerializerMethodField()
    assigned_to_name = serializers.CharField(
        source="assigned_to.username", read_only=True
    )
    created_by_name = serializers.CharField(
        source="created_by.username", read_only=True
    )
    services = ProposalServiceSerializer(
        many=True, source='service_items', read_only=True,
    )
    payment_plan = ProposalPaymentPlanSerializer(required=False, allow_null=True)
    service_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True, required=False,
    )

    def get_customer_name(self, obj):
        if obj.customer_id:
            return obj.customer.company_name or obj.customer.name or ''
        return ''

    def get_prospect_company(self, obj):
        if obj.prospect_id:
            return obj.prospect.company_name or ''
        return ''

    class Meta:
        model = Proposal
        fields = [
            "id",
            "prospect",
            "prospect_company",
            "customer",
            "customer_name",
            "number",
            "title",
            "proposal_type",
            "billing_type",
            "version",
            "description",
            "scope",
            "deliverables",
            "timeline",
            "requirements",
            "hours_estimated",
            "hourly_rate",
            "total_value",
            "status",
            "valid_until",
            "notes",
            "terms",
            "proposal_file",
            "public_token",
            "view_count",
            "sent_at",
            "viewed_at",
            "assigned_to",
            "assigned_to_name",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
            "services",
            "payment_plan",
            "service_ids",
        ]
        read_only_fields = ["id", "number", "created_by", "created_by_name", "created_at", "updated_at"]

    def validate(self, attrs):
        # Em PATCH/partial update, customer/prospect podem não vir no payload,
        # mas já existem na instância — exigir apenas se o resultado combinado
        # ficaria sem ambos.
        customer = attrs.get('customer') or (self.instance.customer if self.instance else None)
        prospect = attrs.get('prospect') or (self.instance.prospect if self.instance else None)
        if not customer and not prospect:
            raise serializers.ValidationError(
                "É necessário informar um cliente ou um lead do funil."
            )
        return attrs

    @staticmethod
    def _enforce_commercial_total(validated_data, payment_plan_data):
        """Regra de negócio: total_value da proposta = APENAS valor one-time
        (setup/projeto único). A recorrência fica em payment_plan.recurring_*
        e só vira receita quando o contrato for ativado (Contract.monthly_value).

        Se o payload tem payment_plan, sobrescreve total_value com one_time_amount
        (ou 0 quando plan_type=recurring_only). Evita que dashboards do
        pipeline comercial fiquem inflados por projeções de 12 meses.
        """
        if not payment_plan_data:
            return
        plan_type = payment_plan_data.get('plan_type', 'one_time')
        one_time = payment_plan_data.get('one_time_amount') or 0
        if plan_type == 'recurring_only':
            validated_data['total_value'] = 0
        else:
            validated_data['total_value'] = one_time

    def create(self, validated_data):
        service_ids = validated_data.pop('service_ids', None)
        payment_plan_data = validated_data.pop('payment_plan', None)
        self._enforce_commercial_total(validated_data, payment_plan_data)
        proposal = super().create(validated_data)
        if service_ids is not None:
            _sync_proposal_services(proposal, service_ids)
        if payment_plan_data is not None:
            ProposalPaymentPlan.objects.update_or_create(
                proposal=proposal, defaults=payment_plan_data,
            )
        return proposal

    def update(self, instance, validated_data):
        service_ids = validated_data.pop('service_ids', None)
        payment_plan_data = validated_data.pop('payment_plan', None)
        self._enforce_commercial_total(validated_data, payment_plan_data)
        proposal = super().update(instance, validated_data)
        if service_ids is not None:
            _sync_proposal_services(proposal, service_ids)
        if payment_plan_data is not None:
            ProposalPaymentPlan.objects.update_or_create(
                proposal=proposal, defaults=payment_plan_data,
            )
        return proposal


class ContractSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    proposal_title = serializers.CharField(source="proposal.title", read_only=True)
    created_by_name = serializers.CharField(
        source="created_by.username", read_only=True
    )
    services = ContractServiceSerializer(
        many=True, source='service_items', read_only=True,
    )
    payment_plan = ContractPaymentPlanSerializer(required=False, allow_null=True)
    service_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True, required=False,
    )

    def get_customer_name(self, obj):
        if obj.customer_id:
            return obj.customer.company_name or obj.customer.name or ''
        return ''

    class Meta:
        model = Contract
        fields = [
            "id",
            "proposal",
            "proposal_title",
            "customer",
            "customer_name",
            "number",
            "title",
            "service_types",
            "contract_type",
            "billing_type",
            "start_date",
            "end_date",
            "auto_renew",
            "renewal_days",
            "monthly_value",
            "hourly_rate",
            "total_hours_monthly",
            "status",
            "contract_file",
            "notes",
            "terms",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
            "services",
            "payment_plan",
            "service_ids",
        ]
        read_only_fields = ["id", "number", "created_by", "created_by_name", "created_at", "updated_at"]

    def validate_contract_file(self, value):
        if value:
            if value.size > 10 * 1024 * 1024:
                raise serializers.ValidationError('Arquivo muito grande. Máximo 10MB.')
            if not value.name.lower().endswith('.pdf'):
                raise serializers.ValidationError('Apenas arquivos PDF são permitidos.')
        return value

    def create(self, validated_data):
        service_ids = validated_data.pop('service_ids', None)
        payment_plan_data = validated_data.pop('payment_plan', None)
        contract = super().create(validated_data)
        if service_ids is not None:
            _sync_contract_services(contract, service_ids)
        if payment_plan_data is not None:
            ContractPaymentPlan.objects.update_or_create(
                contract=contract, defaults=payment_plan_data,
            )
        return contract

    def update(self, instance, validated_data):
        service_ids = validated_data.pop('service_ids', None)
        payment_plan_data = validated_data.pop('payment_plan', None)
        contract = super().update(instance, validated_data)
        if service_ids is not None:
            _sync_contract_services(contract, service_ids)
        if payment_plan_data is not None:
            ContractPaymentPlan.objects.update_or_create(
                contract=contract, defaults=payment_plan_data,
            )
        return contract


class ProspectActivitySerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    prospect_name = serializers.SerializerMethodField()

    def get_created_by_name(self, obj):
        return obj.created_by.username if obj.created_by_id else None

    def get_prospect_name(self, obj):
        if obj.prospect_id:
            return obj.prospect.company_name or obj.prospect.contact_name or ''
        return ''

    class Meta:
        model = ProspectActivity
        fields = [
            "id",
            "prospect",
            "prospect_name",
            "activity_type",
            "subject",
            "description",
            "outcome",
            "next_action",
            "next_action_date",
            "duration_minutes",
            "date",
            "created_by",
            "created_by_name",
            "created_at",
        ]
        read_only_fields = ["id", "created_by", "created_by_name", "created_at"]


class WebsiteLeadSerializer(serializers.Serializer):
    """Recebe dados do quiz do site e cria um Prospect."""
    VALID_SERVICES = {
        'Aplicação Web', 'Aplicativo Mobile', 'Inteligência Artificial',
        'Automações', 'Ainda não sei',
    }
    VALID_SIZES = {'Solo / MEI', 'Pequena empresa', 'Média empresa', 'Grande empresa'}
    VALID_REVENUE = {
        'Até R$20 mil', 'R$20 mil a R$100 mil',
        'R$100 mil a R$500 mil', 'Acima de R$500 mil',
    }
    VALID_BUDGETS = {
        'Menos de R$3.000', 'R$3.000 a R$10.000',
        'Menos de R$10.000', 'R$10.000 a R$30.000',
        'R$30.000 a R$100.000', 'Acima de R$100.000',
    }

    nome = serializers.CharField(max_length=200)
    empresa = serializers.CharField(max_length=200)
    email = serializers.EmailField()
    whatsapp = serializers.CharField(max_length=20)
    servico = serializers.CharField(max_length=500, required=False, default='')
    tamanho = serializers.CharField(max_length=200, required=False, default='')
    faturamento = serializers.CharField(max_length=200, required=False, default='')
    budget = serializers.CharField(max_length=200, required=False, default='')
    status = serializers.CharField(max_length=200, required=False, default='')
    descricao = serializers.CharField(max_length=500, required=False, default='', allow_blank=True)

    def validate_whatsapp(self, value):
        import re
        if not re.match(r'^[\d\s()+\-]{8,20}$', value):
            raise serializers.ValidationError('Formato de telefone inválido.')
        return value

    def validate_servico(self, value):
        if value:
            services = [s.strip() for s in value.split(',')]
            for s in services:
                if s and s not in self.VALID_SERVICES:
                    raise serializers.ValidationError(f'Serviço inválido: {s}')
        return value

    def validate_tamanho(self, value):
        if value and value not in self.VALID_SIZES:
            raise serializers.ValidationError('Tamanho de empresa inválido.')
        return value

    def validate_faturamento(self, value):
        if value and value not in self.VALID_REVENUE:
            raise serializers.ValidationError('Faixa de faturamento inválida.')
        return value

    def validate_budget(self, value):
        if value and value not in self.VALID_BUDGETS:
            raise serializers.ValidationError('Faixa de orçamento inválida.')
        return value

    def _get_or_create_website_user(self):
        from django.contrib.auth import get_user_model
        from django.db import IntegrityError
        User = get_user_model()
        try:
            with transaction.atomic():
                website_user, _ = User.objects.get_or_create(
                    username='website-bot',
                    defaults={
                        'first_name': 'Website',
                        'last_name': 'Bot',
                        'email': 'website-bot@inovasystems.com.br',
                        'role': 'operator',
                        'is_active': False,
                    },
                )
        except IntegrityError:
            website_user = User.objects.get(username='website-bot')
        return website_user

    def create(self, validated_data):
        import json

        website_user = self._get_or_create_website_user()

        # Mapear tamanho do quiz para company_size do Prospect
        tamanho = validated_data.get('tamanho', '')
        if 'grande' in tamanho.lower() or '100' in tamanho:
            company_size = 'large'
        elif 'média' in tamanho.lower() or 'media' in tamanho.lower():
            company_size = 'medium'
        else:
            company_size = 'small'

        # Guardar todos os dados originais do quiz (com limite de 8KB)
        quiz_data = {
            'servico': validated_data.get('servico', ''),
            'tamanho': validated_data.get('tamanho', ''),
            'faturamento': validated_data.get('faturamento', ''),
            'budget': validated_data.get('budget', ''),
            'status_quiz': validated_data.get('status', ''),
        }
        if len(json.dumps(quiz_data)) > 8192:
            raise serializers.ValidationError('Quiz data too large.')

        # Recalcular qualification_level server-side
        # Nível 2 — Consciente do Problema: escolheu "Ainda não sei" ou budget baixo
        # Nível 3 — Consciente da Solução: escolheu solução específica
        # Nível 4 — Consciente do Produto: solução específica + budget alto + empresa média/grande
        budget = validated_data.get('budget', '')
        servico = validated_data.get('servico', '')
        qualified_budgets = {
            'R$10.000 a R$30.000', 'R$30.000 a R$100.000', 'Acima de R$100.000',
        }
        high_budgets = {'R$30.000 a R$100.000', 'Acima de R$100.000'}
        has_specific_service = servico and 'Ainda não sei' not in servico

        if has_specific_service and budget in high_budgets and company_size in ('medium', 'large'):
            qualification_level = '4'
        elif has_specific_service and budget in qualified_budgets:
            qualification_level = '3'
        else:
            qualification_level = '2'

        description = validated_data.get('descricao', '') or validated_data.get('servico', '')

        prospect = Prospect.objects.create(
            contact_name=validated_data['nome'],
            company_name=validated_data['empresa'],
            contact_email=validated_data['email'],
            contact_phone=validated_data['whatsapp'],
            source='website',
            status='new',
            description=description,
            company_size=company_size,
            qualification_level=qualification_level,
            quiz_data=quiz_data,
            created_by=website_user,
        )
        return prospect


class ProspectMessageSerializer(serializers.ModelSerializer):
    content = serializers.CharField(max_length=5000)

    def validate_metadata(self, value):
        import json
        if value is not None and len(json.dumps(value)) > 4096:
            raise serializers.ValidationError('metadata excede 4KB.')
        return value

    class Meta:
        model = ProspectMessage
        fields = ['id', 'prospect', 'direction', 'content', 'channel', 'sent_at', 'metadata', 'created_at']
        read_only_fields = ['id', 'created_at']


class WinLossReasonSerializer(serializers.ModelSerializer):
    class Meta:
        model = WinLossReason
        fields = [
            "id",
            "prospect",
            "result",
            "reason",
            "competitor",
            "actual_value",
            "notes",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


# ── Client Onboarding ────────────────────────────────────────────────────────

class ClientOnboardingPublicSerializer(serializers.ModelSerializer):
    """Serializer público para o formulário de cadastro do cliente."""
    prospect_company_name = serializers.CharField(
        source='prospect.company_name', read_only=True,
    )

    class Meta:
        model = ClientOnboarding
        fields = [
            'public_token', 'status', 'prospect_company_name',
            # empresa
            'company_legal_name', 'company_cnpj',
            'company_street', 'company_number', 'company_complement',
            'company_neighborhood', 'company_city', 'company_state', 'company_cep',
            # representante
            'rep_full_name', 'rep_marital_status', 'rep_profession', 'rep_cpf',
            'rep_street', 'rep_number', 'rep_complement',
            'rep_neighborhood', 'rep_city', 'rep_state', 'rep_cep',
            # financeiro
            'finance_contact_name', 'finance_contact_phone', 'finance_contact_email',
        ]
        read_only_fields = ['public_token', 'status', 'prospect_company_name']

    def validate_company_cnpj(self, value):
        if value:
            validate_cnpj(value)
        return value

    def validate_rep_cpf(self, value):
        if value:
            validate_cpf(value)
        return value

    def validate(self, attrs):
        required_fields = {
            'company_legal_name': 'Razão Social',
            'company_cnpj': 'CNPJ',
            'company_street': 'Rua da empresa',
            'company_number': 'Número da empresa',
            'company_complement': 'Complemento da empresa',
            'company_neighborhood': 'Bairro da empresa',
            'company_city': 'Cidade da empresa',
            'company_state': 'Estado da empresa',
            'company_cep': 'CEP da empresa',
            'rep_full_name': 'Nome do representante',
            'rep_marital_status': 'Estado civil',
            'rep_profession': 'Profissão',
            'rep_cpf': 'CPF do representante',
            'rep_street': 'Rua do representante',
            'rep_number': 'Número do representante',
            'rep_complement': 'Complemento do representante',
            'rep_neighborhood': 'Bairro do representante',
            'rep_city': 'Cidade do representante',
            'rep_state': 'Estado do representante',
            'rep_cep': 'CEP do representante',
            'finance_contact_name': 'Nome do contato financeiro',
            'finance_contact_phone': 'Telefone do financeiro',
            'finance_contact_email': 'E-mail do financeiro',
        }
        errors = {}
        for field, label in required_fields.items():
            if not attrs.get(field, '').strip():
                errors[field] = f'{label} é obrigatório.'
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class ClientOnboardingInternalSerializer(serializers.ModelSerializer):
    """Serializer interno para visualização e gestão dos cadastros."""
    prospect_company_name = serializers.CharField(
        source='prospect.company_name', read_only=True,
    )
    customer_name = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(
        source='created_by.username', read_only=True,
    )

    def get_customer_name(self, obj):
        if obj.customer_id:
            return obj.customer.company_name or obj.customer.name or ''
        return ''

    class Meta:
        model = ClientOnboarding
        fields = [
            'id', 'prospect', 'prospect_company_name',
            'customer', 'customer_name', 'public_token', 'status',
            # empresa
            'company_legal_name', 'company_cnpj',
            'company_street', 'company_number', 'company_complement',
            'company_neighborhood', 'company_city', 'company_state', 'company_cep',
            # representante
            'rep_full_name', 'rep_marital_status', 'rep_profession', 'rep_cpf',
            'rep_street', 'rep_number', 'rep_complement',
            'rep_neighborhood', 'rep_city', 'rep_state', 'rep_cep',
            # financeiro
            'finance_contact_name', 'finance_contact_phone', 'finance_contact_email',
            # rastreamento
            'submitted_at', 'ip_address', 'user_agent',
            # auditoria
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'public_token', 'submitted_at',
            'ip_address', 'user_agent',
            'created_by', 'created_by_name',
            'created_at', 'updated_at',
        ]
