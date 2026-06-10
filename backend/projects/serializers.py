from rest_framework import serializers
from django.db import models
from .models import ProjectTemplate, Project, ProjectPhase, Milestone, ProjectTask, TimeEntry, ProjectComment


class ProjectTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectTemplate
        fields = ['id', 'name', 'description', 'phases', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class MilestoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Milestone
        fields = ['id', 'project', 'name', 'description', 'due_date', 'is_completed',
                  'completed_at', 'invoice', 'order', 'created_at']
        # S7C1: is_completed/completed_at/invoice sao gerenciados pela action
        # `complete` (que valida ownership de invoice). PATCH direto burlava
        # essa validacao e permitia operator linkar invoice alheio ou marcar
        # milestone de outro projeto como concluido.
        read_only_fields = ['id', 'created_at', 'is_completed', 'completed_at', 'invoice']


class ProjectCommentSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = ProjectComment
        fields = ['id', 'project', 'task', 'user', 'user_name', 'content', 'created_at']
        # F2.8: user e derivado de request.user em perform_create. Antes era
        # escrivel em update, permitindo reatribuir autoria para terceiro.
        read_only_fields = ['id', 'user', 'created_at']


class ProjectPhaseSerializer(serializers.ModelSerializer):
    tasks_count = serializers.SerializerMethodField()
    completed_tasks_count = serializers.SerializerMethodField()

    class Meta:
        model = ProjectPhase
        fields = ['id', 'project', 'name', 'description', 'order', 'is_completed',
                  'start_date', 'end_date', 'tasks_count', 'completed_tasks_count',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_tasks_count(self, obj):
        return obj.tasks.count()

    def get_completed_tasks_count(self, obj):
        return obj.tasks.filter(status='done').count()


class ProjectTaskSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.CharField(source='assigned_to.username', read_only=True)
    total_hours = serializers.SerializerMethodField()

    class Meta:
        model = ProjectTask
        fields = ['id', 'project', 'phase', 'task_type', 'title', 'description',
                  'assigned_to', 'assigned_to_name', 'status', 'priority',
                  'estimated_hours', 'logged_hours', 'total_hours', 'due_date', 'completed_at',
                  'external_id', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_total_hours(self, obj):
        total = obj.time_entries.aggregate(total=models.Sum('hours'))['total']
        return float(total or 0)


class TimeEntrySerializer(serializers.ModelSerializer):
    task_title = serializers.CharField(source='task.title', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)
    user_name = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = TimeEntry
        fields = ['id', 'task', 'task_title', 'project', 'project_name', 'user', 'user_name',
                  'hours', 'description', 'date', 'is_billable', 'created_at']
        read_only_fields = ['id', 'user', 'created_at']


class ProjectSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.company_name', read_only=True)
    contract_number = serializers.CharField(source='contract.number', read_only=True)
    manager_name = serializers.CharField(source='manager.username', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    phases = ProjectPhaseSerializer(many=True, read_only=True)
    milestones = MilestoneSerializer(many=True, read_only=True)
    total_hours = serializers.SerializerMethodField()
    total_logged = serializers.SerializerMethodField()
    team_names = serializers.SerializerMethodField()

    # v32 F5: parâmetros do Game Plan com as faixas do motor (doc 07 §2) —
    # serializer é a porta de entrada única (doc 08 §8.3).
    prazo_total = serializers.IntegerField(min_value=5, max_value=400, required=False)
    pct_doc = serializers.IntegerField(min_value=0, max_value=40, required=False)
    pct_dev = serializers.IntegerField(min_value=20, max_value=80, required=False)
    pct_aud = serializers.IntegerField(min_value=0, max_value=30, required=False)
    peso_val = serializers.IntegerField(min_value=1, max_value=60, required=False)
    peso_hom = serializers.IntegerField(min_value=1, max_value=60, required=False)
    peso_ent = serializers.IntegerField(min_value=1, max_value=60, required=False)
    reupd_fds = serializers.IntegerField(min_value=0, max_value=8, required=False)

    class Meta:
        model = Project
        fields = ['id', 'name', 'description', 'project_type', 'customer', 'customer_name',
                  'contract', 'contract_number', 'template', 'status', 'billing_type',
                  'start_date', 'end_date', 'deadline', 'progress',
                  'budget_hours', 'budget_value', 'hourly_rate',
                  'team', 'team_names', 'manager', 'manager_name',
                  'github_repo', 'figma_url', 'docs_url', 'notes',
                  'phases', 'milestones', 'total_hours', 'total_logged',
                  # v32 F5 — processo de Produção (doc 04 §2)
                  'tipo', 'etapa_atual', 'recorrencia_tipo', 'situacao',
                  'contrato_assinado_at', 'entrada_paga_at',
                  'onboarding_realizado_at', 'dia_zero',
                  # v32 F5 — parâmetros do Game Plan (doc 07 §2)
                  'prazo_total', 'modo', 'pct_doc', 'pct_dev', 'pct_aud',
                  'peso_val', 'peso_hom', 'peso_ent', 'reupd_fds',
                  'considerar_carnaval', 'considerar_corpus',
                  'data_reuniao_validacao', 'data_reuniao_apresentacao',
                  'data_reuniao_graduacao',
                  'created_by', 'created_by_name', 'created_at', 'updated_at']
        # F5: etapa/situação/recorrência e os 4 campos do gate do Dia 0 só
        # mudam por endpoint de ação (transitions.py) ou automação — PATCH
        # direto não pode forjar critério do gate (STRIDE Tampering).
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at',
                            'etapa_atual', 'recorrencia_tipo', 'situacao',
                            'contrato_assinado_at', 'entrada_paga_at',
                            'onboarding_realizado_at', 'dia_zero']

    def get_total_hours(self, obj):
        return float(obj.budget_hours or 0)

    def get_total_logged(self, obj):
        from django.db.models import Sum
        total = TimeEntry.objects.filter(project=obj).aggregate(total=Sum('hours'))['total']
        return float(total or 0)

    def get_team_names(self, obj):
        return list(obj.team.values_list('username', flat=True))
