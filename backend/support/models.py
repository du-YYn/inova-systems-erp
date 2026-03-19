from django.db import models
from django.conf import settings
from core.validators import validate_file_extension, validate_file_size, validate_tags_list


class SLAPolicy(models.Model):
    """Política de SLA vinculada a contratos de suporte/manutenção."""
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    # Tempos em horas (tempo útil)
    response_time_low = models.DecimalField(max_digits=5, decimal_places=2, default=24)
    response_time_medium = models.DecimalField(max_digits=5, decimal_places=2, default=8)
    response_time_high = models.DecimalField(max_digits=5, decimal_places=2, default=4)
    response_time_critical = models.DecimalField(max_digits=5, decimal_places=2, default=1)

    resolution_time_low = models.DecimalField(max_digits=5, decimal_places=2, default=72)
    resolution_time_medium = models.DecimalField(max_digits=5, decimal_places=2, default=24)
    resolution_time_high = models.DecimalField(max_digits=5, decimal_places=2, default=8)
    resolution_time_critical = models.DecimalField(max_digits=5, decimal_places=2, default=4)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'sla_policies'
        ordering = ['name']

    def __str__(self):
        return self.name


class SupportCategory(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'support_categories'
        ordering = ['name']
        verbose_name_plural = 'support categories'

    def __str__(self):
        return self.name


class SupportTicket(models.Model):
    PRIORITY_CHOICES = [
        ('low', 'Baixa'),
        ('medium', 'Média'),
        ('high', 'Alta'),
        ('critical', 'Crítica'),
    ]

    STATUS_CHOICES = [
        ('open', 'Aberto'),
        ('in_progress', 'Em Atendimento'),
        ('pending_client', 'Aguardando Cliente'),
        ('resolved', 'Resolvido'),
        ('closed', 'Fechado'),
    ]

    TYPE_CHOICES = [
        ('bug', 'Bug'),
        ('feature', 'Solicitação de Feature'),
        ('question', 'Dúvida'),
        ('performance', 'Performance'),
        ('integration', 'Integração'),
        ('other', 'Outro'),
    ]

    number = models.CharField(max_length=20, unique=True)  # TKT-00001
    title = models.CharField(max_length=300)
    description = models.TextField()

    customer = models.ForeignKey(
        'sales.Customer', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='support_tickets'
    )
    contract = models.ForeignKey(
        'sales.Contract', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='support_tickets'
    )
    project = models.ForeignKey(
        'projects.Project', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='support_tickets'
    )
    category = models.ForeignKey(
        SupportCategory, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='tickets'
    )
    sla_policy = models.ForeignKey(
        SLAPolicy, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='tickets'
    )

    ticket_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='bug')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')

    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='assigned_tickets'
    )

    # SLA tracking
    sla_response_deadline = models.DateTimeField(null=True, blank=True)
    sla_resolution_deadline = models.DateTimeField(null=True, blank=True)
    first_response_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    # Contato do cliente
    contact_name = models.CharField(max_length=200, blank=True)
    contact_email = models.EmailField(blank=True)

    tags = models.JSONField(default=list, validators=[validate_tags_list])

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='created_tickets'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'support_tickets'
        ordering = ['-created_at']

    def __str__(self):
        return f"#{self.number} - {self.title}"


class TicketComment(models.Model):
    ticket = models.ForeignKey(SupportTicket, on_delete=models.CASCADE, related_name='comments')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    content = models.TextField()
    is_internal = models.BooleanField(default=False)  # Comentário interno (não visível ao cliente)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'ticket_comments'
        ordering = ['created_at']

    def __str__(self):
        return f"Comentário em #{self.ticket.number} por {self.user.username}"


class TicketAttachment(models.Model):
    ticket = models.ForeignKey(SupportTicket, on_delete=models.CASCADE, related_name='attachments')
    comment = models.ForeignKey(
        TicketComment, on_delete=models.CASCADE, null=True, blank=True,
        related_name='attachments'
    )
    file = models.FileField(upload_to='ticket_attachments/%Y/%m/', validators=[validate_file_extension, validate_file_size])
    filename = models.CharField(max_length=255)
    file_size = models.IntegerField(default=0)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'ticket_attachments'

    def __str__(self):
        return self.filename


class KnowledgeBaseArticle(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Rascunho'),
        ('published', 'Publicado'),
        ('archived', 'Arquivado'),
    ]

    title = models.CharField(max_length=300)
    slug = models.SlugField(max_length=300, unique=True, blank=True)
    content = models.TextField()
    summary = models.TextField(blank=True)

    category = models.ForeignKey(
        SupportCategory, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='kb_articles'
    )
    project = models.ForeignKey(
        'projects.Project', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='kb_articles'
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    is_public = models.BooleanField(default=False)  # Visível ao cliente

    views_count = models.IntegerField(default=0)
    helpful_count = models.IntegerField(default=0)
    not_helpful_count = models.IntegerField(default=0)

    tags = models.JSONField(default=list, validators=[validate_tags_list])

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='kb_articles'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'kb_articles'
        ordering = ['-created_at']

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            from django.utils.text import slugify
            import uuid
            self.slug = slugify(self.title)[:250] + '-' + str(uuid.uuid4())[:8]
        super().save(*args, **kwargs)
