"""v32 F5 (Produção) — serializers das entidades novas (doc 04 §3).

Padrão do repo: campos de sistema/auto-gerados read_only; created_by setado
em perform_create. Assinatura (status signed/baseline/signed_at) só muda por
endpoint de ação ou pelo receiver do Jurídico — nunca por PATCH direto
(STRIDE Tampering, doc 08 §8.1).
"""
from rest_framework import serializers

from .models_v32 import (
    PROJECT_DOCUMENT_SECTIONS,
    OnboardingMappingForm,
    ProjectAudit,
    ProjectDocument,
    RecurrenceContract,
    ReUpdateCycle,
    ScheduleVersion,
    WeeklyUpdate,
)


class OnboardingMappingFormSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)

    class Meta:
        model = OnboardingMappingForm
        fields = [
            'id', 'project', 'project_name',
            'contexto_negocio', 'processos_atuais', 'dores_objetivos',
            'sistemas_integracoes', 'usuarios_acessos', 'dados_migracao',
            'criterios_sucesso', 'extra_answers', 'completed_at',
            'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']


class ProjectDocumentSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    sections = serializers.SerializerMethodField()

    class Meta:
        model = ProjectDocument
        fields = [
            'id', 'project', 'project_name', 'version', 'status',
            'content', 'content_url', 'sections',
            'autentique_id', 'signed_at', 'is_current_baseline',
            'created_by', 'created_at', 'updated_at',
        ]
        # Assinatura/baseline só via receiver do Jurídico ou ação dedicada —
        # PATCH direto não pode forjar doc assinada (gate da Etapa 7).
        read_only_fields = [
            'id', 'status', 'autentique_id', 'signed_at',
            'is_current_baseline', 'created_by', 'created_at', 'updated_at',
        ]

    def get_sections(self, obj):
        """As 12 seções canônicas (chaves esperadas em `content`)."""
        return PROJECT_DOCUMENT_SECTIONS

    def validate_content(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError(
                'content deve ser um objeto {secao: conteudo}.')
        unknown = set(value) - set(PROJECT_DOCUMENT_SECTIONS)
        if unknown:
            raise serializers.ValidationError(
                f'Seções desconhecidas: {", ".join(sorted(unknown))}. '
                f'Válidas: {", ".join(PROJECT_DOCUMENT_SECTIONS)}.'
            )
        return value


class ProjectAuditSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    approved_by_name = serializers.CharField(
        source='approved_by.username', read_only=True)

    class Meta:
        model = ProjectAudit
        fields = [
            'id', 'project', 'project_name', 'checklist', 'findings',
            'started_at', 'approved_at', 'approved_by', 'approved_by_name',
            'created_by', 'created_at', 'updated_at',
        ]
        # Aprovação (marco que destrava a Etapa 9) só pela ação `approve`.
        read_only_fields = [
            'id', 'approved_at', 'approved_by',
            'created_by', 'created_at', 'updated_at',
        ]


class ReUpdateCycleSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)

    class Meta:
        model = ReUpdateCycle
        fields = [
            'id', 'project', 'project_name', 'cycle_number', 'client_notes',
            'started_at', 'delivered_at', 'approved_at', 'worked_weekends',
            'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']


class WeeklyUpdateSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    created_by_name = serializers.CharField(
        source='created_by.username', read_only=True)

    class Meta:
        model = WeeklyUpdate
        fields = [
            'id', 'project', 'project_name', 'week_start', 'summary',
            'pending_client_items', 'sent_at', 'sent_via',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']


class ScheduleVersionSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(
        source='created_by.username', read_only=True)

    class Meta:
        model = ScheduleVersion
        fields = [
            'id', 'project', 'params', 'game_plan',
            'created_by', 'created_by_name', 'created_at',
        ]
        # Snapshot imutável: só nasce pelo endpoint de geração do cronograma.
        read_only_fields = fields


class RecurrenceContractSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(
        source='customer.company_name', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)

    class Meta:
        model = RecurrenceContract
        fields = [
            'id', 'customer', 'customer_name', 'project', 'project_name',
            'kind', 'status', 'monthly_value', 'started_at',
            'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']
