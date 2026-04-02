from django.db import transaction
from rest_framework import serializers
from .models import Customer, Prospect, Proposal, Contract, ProspectActivity, WinLossReason


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
    meets_qualification = serializers.SerializerMethodField()
    days_since_created = serializers.SerializerMethodField()
    service_interest = serializers.ListField(
        child=serializers.ChoiceField(choices=Prospect.VALID_SERVICE_INTERESTS),
        default=list,
        allow_empty=True,
    )

    def get_meets_qualification(self, obj):
        return obj.qualification_score >= 3

    def get_days_since_created(self, obj):
        from django.utils import timezone
        delta = timezone.now() - obj.created_at
        return delta.days

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


class ProposalSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(
        source="customer.company_name", read_only=True
    )
    prospect_company = serializers.CharField(
        source="prospect.company_name", read_only=True
    )
    assigned_to_name = serializers.CharField(
        source="assigned_to.username", read_only=True
    )
    created_by_name = serializers.CharField(
        source="created_by.username", read_only=True
    )

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
            "sent_at",
            "viewed_at",
            "assigned_to",
            "assigned_to_name",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "number", "created_by", "created_by_name", "created_at", "updated_at"]

    def validate(self, attrs):
        if not attrs.get('customer') and not attrs.get('prospect'):
            raise serializers.ValidationError(
                "É necessário informar um cliente ou um lead do funil."
            )
        return attrs


class ContractSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    proposal_title = serializers.CharField(source="proposal.title", read_only=True)
    created_by_name = serializers.CharField(
        source="created_by.username", read_only=True
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
        ]
        read_only_fields = ["id", "number", "created_by", "created_by_name", "created_at", "updated_at"]

    def validate_contract_file(self, value):
        if value:
            if value.size > 10 * 1024 * 1024:
                raise serializers.ValidationError('Arquivo muito grande. Máximo 10MB.')
            if not value.name.lower().endswith('.pdf'):
                raise serializers.ValidationError('Apenas arquivos PDF são permitidos.')
        return value


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
