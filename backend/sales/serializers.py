from rest_framework import serializers
from .models import Customer, Prospect, Proposal, Contract


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
        read_only_fields = ["id", "created_at", "updated_at"]


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
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]


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
        read_only_fields = ["id", "number", "created_at", "updated_at"]


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
        read_only_fields = ["id", "number", "created_at", "updated_at"]
