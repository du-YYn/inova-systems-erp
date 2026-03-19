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
