from django.db import models
from django.conf import settings
from core.validators import validate_template_phases


class ProjectTemplate(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    phases = models.JSONField(default=list, validators=[validate_template_phases])  # [{"name": "", "description": "", "order": 0}]
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'project_templates'
        ordering = ['name']

    def __str__(self):
        return self.name


class Project(models.Model):
    TYPE_CHOICES = [
        ('custom_dev', 'Desenvolvimento Personalizado'),
        ('saas', 'Produto SaaS'),
        ('maintenance', 'Manutenção'),
        ('support', 'Suporte'),
        ('consulting', 'Consultoria'),
        ('internal', 'Projeto Interno'),
    ]

    STATUS_CHOICES = [
        ('planning', 'Planejamento'),
        ('kickoff', 'Kickoff'),
        ('requirements', 'levantamento de Requisitos'),
        ('development', 'Desenvolvimento'),
        ('testing', 'Testes/QA'),
        ('deployment', 'Implantação'),
        ('completed', 'Concluído'),
        ('on_hold', 'Em Espera'),
        ('cancelled', 'Cancelado'),
    ]

    # ── v32 F5 (doc 04 §1): etapa_atual substitui `status` (que vira legado;
    # remoção só na F8). Ordem canônica do fluxo de Produção, com bifurcação
    # por tipo após registro_entrega (fechado → graduação; recorrente →
    # implementação) e convergência em recorrência.
    #
    # v32 ajustes (doc 09 item 08 + doc 10): "agendar" é a NOVA 1ª etapa
    # (crava o Dia 0 provisório). As demais CHAVES são intocadas (produção com
    # dados reais — migração só aditiva): só os LABELS foram atualizados pra
    # bater com a lista de John (Planejamento, Reunião de Apresentação, Janela
    # de teste, Re-Update, Homologação, Concluído, Implementado). As colunas
    # "Janela de teste" e "Re-Update" reusam as chaves legadas `homologacao` e
    # `registro_entrega` como rótulos novos — sem renomear chave.
    ETAPA_CHOICES = [
        ('agendar', 'Agendar'),  # 🆕 1ª etapa — crava o Dia 0 provisório (doc 10 §1)
        ('etapa_3_preparacao', 'Planejamento'),
        ('etapa_4_onboarding', 'Onboarding (Dia 0)'),
        ('etapa_5_documentacao', 'Documentação'),
        ('etapa_6_validacao_doc', 'Validação da doc'),
        ('etapa_7_desenvolvimento', 'Desenvolvimento'),
        ('etapa_8_auditoria', 'Auditoria interna'),
        ('etapa_9_apresentacao', 'Reunião de Apresentação'),
        ('homologacao', 'Janela de teste'),
        ('registro_entrega', 'Re-Update'),
        ('etapa_10_graduacao', 'Homologação'),
        ('implementacao', 'Concluído'),
        ('recorrencia', 'Implementado'),
    ]

    # Trilho linear até a bifurcação (transitions.py usa p/ validar a ordem).
    ETAPA_ORDER = [choice[0] for choice in ETAPA_CHOICES]

    TIPO_CHOICES = [
        ('fechado', 'Fechado'),
        ('recorrente', 'Recorrente'),
    ]

    RECORRENCIA_TIPO_CHOICES = [
        ('suporte_basico', 'Suporte Básico'),
        ('operacao_continua', 'Operação Contínua'),
    ]

    SITUACAO_CHOICES = [
        ('ativo', 'Ativo'),
        ('em_espera', 'Em Espera'),
        ('cancelado', 'Cancelado'),
    ]

    MODO_CHOICES = [
        ('uteis', 'Dias úteis'),
        ('corridos', 'Dias corridos'),
    ]

    BILLING_TYPE_CHOICES = [
        ('hourly', 'Por Hora'),
        ('fixed', 'Preço Fixo'),
        ('monthly', 'Mensal'),
        ('milestone', 'Por Marco'),
        ('not_billed', 'Não Faturado'),
    ]

    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    project_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='custom_dev')

    customer = models.ForeignKey(
        'sales.Customer',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='projects'
    )
    contract = models.ForeignKey(
        'sales.Contract',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='projects'
    )

    template = models.ForeignKey(
        ProjectTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='projects'
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='planning')
    billing_type = models.CharField(max_length=20, choices=BILLING_TYPE_CHOICES, default='hourly')

    # ── v32 F5 (doc 04 §1/§2): processo de Produção — tudo aditivo ──────────
    tipo = models.CharField(
        max_length=12, choices=TIPO_CHOICES, blank=True, default='',
        help_text='Fechado ou Recorrente — vem do Comercial (doc 01)',
    )
    etapa_atual = models.CharField(
        max_length=30, choices=ETAPA_CHOICES, default='agendar',
    )
    recorrencia_tipo = models.CharField(
        max_length=20, choices=RECORRENCIA_TIPO_CHOICES, blank=True, default='',
        help_text='Sub-campo da etapa recorrência (doc 04 §1 item 11)',
    )
    situacao = models.CharField(
        max_length=12, choices=SITUACAO_CHOICES, default='ativo',
        help_text='Estado ortogonal — projeto em espera não perde a etapa',
    )

    # Âncora provisória do cronograma (Visão 2 — doc 09 item 08 §"DECISÃO Visão 2").
    # Data da reunião de Onboarding AGENDADA (na etapa "agendar"): permite o
    # motor calcular o preview do cronograma ANTES do onboarding acontecer
    # (ações de prep datadas de trás pra frente). Distinta de dia_zero, que só
    # é cravado quando o onboarding ACONTECE + os 3 critérios estão ok.
    onboarding_agendado_em = models.DateTimeField(
        null=True, blank=True,
        help_text='Reunião de Onboarding agendada (âncora provisória do cronograma)')

    # Gatilho do Dia 0 (3 critérios — doc 04 §2)
    contrato_assinado_at = models.DateTimeField(
        null=True, blank=True, help_text='Do LegalCase(contrato) assinado')
    entrada_paga_at = models.DateTimeField(
        null=True, blank=True, help_text='Do Invoice da entrada (Financeiro)')
    onboarding_realizado_at = models.DateTimeField(
        null=True, blank=True, help_text='Da Etapa 4')
    dia_zero = models.DateField(
        null=True, blank=True,
        help_text='Data do onboarding — só quando os 3 critérios ok')

    # Parâmetros do Game Plan (Motor — doc 07 §2)
    prazo_total = models.IntegerField(default=45)
    modo = models.CharField(max_length=10, choices=MODO_CHOICES, default='uteis')
    pct_doc = models.IntegerField(default=15)
    pct_dev = models.IntegerField(default=50)
    pct_aud = models.IntegerField(default=8)
    peso_val = models.IntegerField(default=5)
    peso_hom = models.IntegerField(default=17)
    peso_ent = models.IntegerField(default=5)
    reupd_fds = models.IntegerField(default=0)
    considerar_carnaval = models.BooleanField(default=True)
    considerar_corpus = models.BooleanField(default=True)
    data_reuniao_validacao = models.DateField(null=True, blank=True)
    data_reuniao_apresentacao = models.DateField(null=True, blank=True)
    data_reuniao_graduacao = models.DateField(null=True, blank=True)

    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    deadline = models.DateField(null=True, blank=True)

    progress = models.IntegerField(default=0)

    budget_hours = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    budget_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    team = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name='projects',
        blank=True
    )
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='managed_projects'
    )

    github_repo = models.URLField(blank=True)
    figma_url = models.URLField(blank=True)
    docs_url = models.URLField(blank=True)

    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='created_projects')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'projects'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} - {self.customer.company_name if self.customer else 'Sem cliente'}"


class ProjectPhase(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='phases')
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    order = models.IntegerField(default=0)
    is_completed = models.BooleanField(default=False)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'project_phases'
        ordering = ['order']

    def __str__(self):
        return f"{self.project.name} - {self.name}"


class Milestone(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='milestones')
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    due_date = models.DateField()
    is_completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    invoice = models.ForeignKey(
        'finance.Invoice',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='milestones'
    )
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_milestones'
        ordering = ['order']

    def __str__(self):
        return f"{self.project.name} - {self.name}"


class Sprint(models.Model):
    STATUS_CHOICES = [
        ('planning', 'Planejamento'),
        ('active', 'Ativo'),
        ('review', 'Em Revisão'),
        ('done', 'Concluído'),
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='sprints')
    name = models.CharField(max_length=100)
    goal = models.TextField(blank=True)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='planning')
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'sprints'
        ordering = ['project', 'order']

    def __str__(self):
        return f"{self.project.name} - {self.name}"


class ProjectTask(models.Model):
    STATUS_CHOICES = [
        ('todo', 'A Fazer'),
        ('in_progress', 'Em Andamento'),
        ('review', 'Em Revisão'),
        ('done', 'Concluído'),
    ]

    PRIORITY_CHOICES = [
        ('low', 'Baixa'),
        ('medium', 'Média'),
        ('high', 'Alta'),
        ('urgent', 'Urgente'),
    ]

    TYPE_CHOICES = [
        ('task', 'Tarefa'),
        ('bug', 'Bug'),
        ('feature', 'Feature'),
        ('research', 'Pesquisa'),
        ('meeting', 'Reunião'),
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='tasks')
    phase = models.ForeignKey(ProjectPhase, on_delete=models.SET_NULL, null=True, blank=True, related_name='tasks')
    sprint = models.ForeignKey('Sprint', on_delete=models.SET_NULL, null=True, blank=True, related_name='tasks')
    depends_on = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='dependent_tasks')

    task_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='task')
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_tasks'
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='todo')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')

    estimated_hours = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    logged_hours = models.DecimalField(max_digits=8, decimal_places=2, default=0)

    due_date = models.DateField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    external_id = models.CharField(max_length=50, blank=True)  # ID do Jira/GitHub

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'project_tasks'
        ordering = ['-priority', 'due_date']

    def __str__(self):
        return self.title


class TimeEntry(models.Model):
    task = models.ForeignKey(ProjectTask, on_delete=models.CASCADE, related_name='time_entries', null=True, blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='time_entries')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='time_entries')
    hours = models.DecimalField(max_digits=5, decimal_places=2)
    description = models.TextField(blank=True)
    date = models.DateField()
    is_billable = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'time_entries'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.user.username} - {self.hours}h em {self.project.name}"


class ProjectComment(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='comments')
    task = models.ForeignKey(ProjectTask, on_delete=models.CASCADE, null=True, blank=True, related_name='comments')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_comments'
        ordering = ['-created_at']


class ChangeRequest(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pendente'),
        ('approved', 'Aprovado'),
        ('rejected', 'Rejeitado'),
        ('implemented', 'Implementado'),
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='change_requests')
    title = models.CharField(max_length=200)
    description = models.TextField()
    impact_hours = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    impact_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='change_requests_requested'
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='change_requests_approved'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='created_change_requests'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'change_requests'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.project.name} - {self.title}"


class ProjectEnvironment(models.Model):
    STATUS_CHOICES = [
        ('operational', 'Operacional'),
        ('degraded', 'Degradado'),
        ('down', 'Fora do Ar'),
        ('maintenance', 'Manutenção'),
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='environments')
    name = models.CharField(max_length=50)
    url = models.URLField(blank=True)
    current_version = models.CharField(max_length=50, blank=True)
    last_deploy_at = models.DateTimeField(null=True, blank=True)
    last_deploy_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='deployments'
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='operational')
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'project_environments'

    def __str__(self):
        return f"{self.project.name} - {self.name}"


class DeliveryApproval(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pendente'),
        ('approved', 'Aprovado'),
        ('revision_requested', 'Revisão Solicitada'),
    ]

    milestone = models.ForeignKey(Milestone, on_delete=models.CASCADE, related_name='approvals')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='delivery_approvals')
    token = models.CharField(max_length=64, unique=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    client_name = models.CharField(max_length=200, blank=True)
    client_email = models.EmailField(blank=True)
    feedback = models.TextField(blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='delivery_approvals'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'delivery_approvals'

    def __str__(self):
        return f"{self.project.name} - {self.milestone.name} ({self.status})"


# v32 F5: entidades novas do processo de Produção (import p/ descoberta do
# Django — definidas em models_v32.py para não inchar este arquivo).
from .models_v32 import (  # noqa: E402,F401
    ETAPA_ACTIONS_SEED,
    ONBOARDING_FORM_BLOCKS,
    PROJECT_DOCUMENT_SECTIONS,
    OnboardingMappingForm,
    ProjectAudit,
    ProjectDocument,
    ProjectEtapaAction,
    RecurrenceContract,
    ReUpdateCycle,
    ScheduleVersion,
    WeeklyUpdate,
)
