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
            "is_active",
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
            "estimated_value",
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


class ContractSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(
        source="customer.company_name", read_only=True
    )
    proposal_title = serializers.CharField(source="proposal.title", read_only=True)
    created_by_name = serializers.CharField(
        source="created_by.username", read_only=True
    )

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
            "notes",
            "terms",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "number", "created_by", "created_by_name", "created_at", "updated_at"]


class ProspectActivitySerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    def get_created_by_name(self, obj):
        return obj.created_by.username if obj.created_by_id else None

    class Meta:
        model = ProspectActivity
        fields = [
            "id",
            "prospect",
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

    def create(self, validated_data):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        # Usuário de sistema para leads do site
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

        # Mapear tamanho do quiz para company_size do Prospect
        tamanho = validated_data.get('tamanho', '')
        if 'grande' in tamanho.lower() or '100' in tamanho:
            company_size = 'large'
        elif 'média' in tamanho.lower() or 'media' in tamanho.lower():
            company_size = 'medium'
        else:
            company_size = 'small'

        # Guardar todos os dados originais do quiz
        quiz_data = {
            'servico': validated_data.get('servico', ''),
            'tamanho': validated_data.get('tamanho', ''),
            'faturamento': validated_data.get('faturamento', ''),
            'budget': validated_data.get('budget', ''),
            'status_quiz': validated_data.get('status', ''),
        }

        # Determinar qualification_level baseado no status do quiz
        status_quiz = validated_data.get('status', '')
        qualification_level = '3' if 'qualificado' in status_quiz.lower() else '2'

        description = validated_data.get('descricao', '') or validated_data.get('servico', '')

        prospect = Prospect.objects.create(
            contact_name=validated_data['nome'],
            company_name=validated_data['empresa'],
            contact_email=validated_data['email'],
            contact_phone=validated_data['whatsapp'],
            source='website',
            status='lead_received',
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
