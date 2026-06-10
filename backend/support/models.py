from django.db import models
from django.conf import settings
from core.validators import (
    validate_file_extension, validate_file_magic_bytes, validate_file_size,
    validate_tags_list,
)


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

    # ── v32 F6 (doc 05 §2): fluxo novo aberto → triagem → analise → correcao
    # → resolvido → fechado. Valores legados (open/in_progress/pending_client/
    # resolved/closed) PERMANECEM no enum (expand-only; remoção só na F8) —
    # a data migration 0003 realinha os registros existentes.
    STATUS_CHOICES = [
        # ── Fluxo v32 ────────────────────────────────────────────────────────
        ('aberto', 'Aberto'),
        ('triagem', 'Triagem'),
        ('analise', 'Análise'),
        ('correcao', 'Correção'),
        ('resolvido', 'Resolvido'),
        ('fechado', 'Fechado'),
        # ── Legados (deprecados na v32; mantidos para convivência de release) ─
        ('open', 'Aberto (legado)'),
        ('in_progress', 'Em Atendimento (legado)'),
        ('pending_client', 'Aguardando Cliente (legado)'),
        ('resolved', 'Resolvido (legado)'),
        ('closed', 'Fechado (legado)'),
    ]

    # Ordem canônica do fluxo novo (board do Suporte usa como colunas).
    STATUS_FLOW = ['aberto', 'triagem', 'analise', 'correcao', 'resolvido', 'fechado']
    LEGACY_STATUSES = ['open', 'in_progress', 'pending_client', 'resolved', 'closed']

    # ── v32 F6 (doc 05 §1): triagem classifica em bug | duvida | mudanca.
    # Valores legados permanecem (data migration 0003 mapeia: question→duvida,
    # feature→mudanca, performance/integration/other→bug).
    TYPE_CHOICES = [
        ('bug', 'Bug'),
        ('duvida', 'Dúvida'),
        ('mudanca', 'Mudança'),
        # ── Legados (deprecados na v32) ──────────────────────────────────────
        ('feature', 'Solicitação de Feature (legado)'),
        ('question', 'Dúvida (legado)'),
        ('performance', 'Performance (legado)'),
        ('integration', 'Integração (legado)'),
        ('other', 'Outro (legado)'),
    ]

    # ── v32 F6 (doc 05 §3): conclusão da Análise ─────────────────────────────
    CONCLUSAO_CHOICES = [
        ('garantia', 'Garantia'),                      # defeito de produção → corrige sem custo
        ('orcamento', 'Orçamento'),                    # fora de escopo → vira orçamento
        ('inconclusivo', 'Inconclusivo'),              # escala para a Diretoria
        ('recorrente_corrige', 'Recorrente — Corrige'),  # contrato mensal → sempre corrige
    ]

    # ── v32 F6 (doc 05 §5): contexto da triagem (2 velocidades) ──────────────
    CONTEXTO_CHOICES = [
        ('homologacao', 'Homologação'),  # projeto em homologação → lote no prazo
        ('suporte', 'Suporte'),          # projeto entregue/recorrente → SLA do plano
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
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='aberto')

    # ── v32 F6 (doc 05 §3/§4): conclusão da Análise por tipo de projeto ─────
    conclusao = models.CharField(
        max_length=20, choices=CONCLUSAO_CHOICES, blank=True, default='',
        help_text='Resultado da Análise: garantia, orçamento, inconclusivo ou recorrente corrige',
    )
    # ── v32 F6 (doc 05 §5): velocidade do atendimento ────────────────────────
    contexto = models.CharField(
        max_length=15, choices=CONTEXTO_CHOICES, default='suporte',
        help_text='Homologação (lote no prazo) ou Suporte (SLA do plano)',
    )
    # ── v32 F6 (doc 05 §4): conclusão=orcamento gera Proposal no Comercial ──
    originating_proposal = models.ForeignKey(
        'sales.Proposal', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='originated_from_tickets',
        help_text='Proposta criada a partir deste chamado (conclusão=orçamento)',
    )

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

    # v32 F6: nullable para o canal público (chamado aberto pelo cliente via
    # token, sem usuário interno — doc 05 §9). Expand-only: DROP NOT NULL.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='created_tickets',
        help_text='Null quando aberto pelo cliente via canal público',
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
    # v32 F6 (doc 05 §9 + doc 08 item 7): além de extensão+tamanho, valida
    # magic bytes (anti-spoofing de tipo) — inclui áudio (.mp3/.ogg/.m4a/.wav).
    file = models.FileField(
        upload_to='ticket_attachments/%Y/%m/',
        validators=[validate_file_extension, validate_file_size, validate_file_magic_bytes],
    )
    filename = models.CharField(max_length=255)
    file_size = models.IntegerField(default=0)
    # v32 F6: nullable para anexos do canal público (sem usuário interno).
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        null=True, blank=True,
        help_text='Null quando enviado pelo cliente via canal público',
    )
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


class PedidoUpdate(models.Model):
    """Ponte Suporte → Comercial (v32 F6, doc 05 §6).

    Triagem classifica o chamado como `mudanca` → cria PedidoUpdate. Ao
    promover (flag AUTOMATION_SUP_PEDIDO_UPDATE), abre Prospect novo direto
    em `tech_analysis` (cliente existente pula Lead/qualificação/Reunião 1).
    """

    STATUS_CHOICES = [
        ('opened', 'Aberto'),
        ('promoted', 'Promovido'),
        ('declined', 'Recusado'),
    ]

    originating_ticket = models.ForeignKey(
        SupportTicket, on_delete=models.PROTECT, related_name='pedidos_update',
    )
    customer = models.ForeignKey(
        'sales.Customer', on_delete=models.PROTECT, related_name='pedidos_update',
    )
    description = models.TextField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='opened')
    prospect = models.ForeignKey(
        'sales.Prospect', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='pedidos_update',
        help_text='Prospect criado ao promover (entra em tech_analysis)',
    )
    requested_at = models.DateTimeField(auto_now_add=True)
    promoted_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='created_pedidos_update',
    )

    class Meta:
        db_table = 'support_pedidos_update'
        ordering = ['-requested_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['customer', 'status']),
        ]

    def __str__(self):
        return f'PedidoUpdate #{self.id} — {self.customer} ({self.get_status_display()})'
