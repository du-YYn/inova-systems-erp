from django.db import models
from django.conf import settings
from django.utils import timezone


class Customer(models.Model):
    TYPE_CHOICES = [
        ('PF', 'Pessoa Física'),
        ('PJ', 'Pessoa Jurídica'),
    ]

    SEGMENT_CHOICES = [
        ('startup', 'Startup'),
        ('mid_size', 'Média Empresa'),
        ('enterprise', 'Enterprise'),
        ('government', 'Governo'),
        ('other', 'Outro'),
    ]

    customer_type = models.CharField(max_length=2, choices=TYPE_CHOICES, default='PJ')
    segment = models.CharField(max_length=20, choices=SEGMENT_CHOICES, default='mid_size')
    company_name = models.CharField(max_length=200, blank=True)
    trading_name = models.CharField(max_length=200, blank=True)
    name = models.CharField(max_length=200, blank=True)
    document = models.CharField(max_length=18, blank=True)  # CPF/CNPJ
    state_registration = models.CharField(max_length=30, blank=True)
    municipal_registration = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    website = models.URLField(blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=2, blank=True)
    cep = models.CharField(max_length=9, blank=True)
    contacts = models.JSONField(default=list)  # [{"name": "", "email": "", "phone": "", "role": ""}]
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='customers')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'customers'
        ordering = ['-created_at']

    def __str__(self):
        return self.company_name or self.name


class Prospect(models.Model):
    SOURCE_CHOICES = [
        ('website', 'Website'),
        ('referral', 'Indicação'),
        ('linkedin', 'LinkedIn'),
        ('event', 'Evento'),
        ('cold_outreach', 'Cold Outreach'),
        ('quiz', 'Quiz / Formulário'),
        ('other', 'Outro'),
    ]

    STATUS_CHOICES = [
        ('lead_received',  'Lead Recebido'),      # quiz preenchido, aguardando SDR
        ('qualifying',     'Em Qualificação'),     # SDR iniciou conversa
        ('qualified',      'Qualificado'),         # passou ≥3/4 critérios
        ('not_qualified',  'Não Qualificado'),     # não atende critérios
        ('scheduled',      'Agendado'),            # reunião marcada via Calendly
        ('pre_meeting',    'Pré-Reunião'),          # sequência de comprometimento
        ('no_show',        'Não Compareceu'),      # faltou à reunião
        ('meeting_done',   'Reunião Realizada'),   # reunião aconteceu com o Closer
        ('proposal_sent',  'Proposta Enviada'),    # proposta enviada após reunião
        ('closed',         'Fechado'),             # projeto contratado
        ('not_closed',     'Não Fechou'),          # reunião ok mas sem fechamento
        ('follow_up',      'Em Follow-up'),        # sequência de reativação
    ]

    QUALIFICATION_LEVEL_CHOICES = [
        ('2', 'Nível 2 — Consciente do Problema'),
        ('3', 'Nível 3 — Consciente da Solução'),
        ('4', 'Nível 4 — Consciente do Produto'),
    ]

    USAGE_TYPE_CHOICES = [
        ('internal',   'Uso Interno'),
        ('commercial', 'Uso Comercial'),
    ]

    COMPANY_SIZE_CHOICES = [
        ('small',  'Pequena'),
        ('medium', 'Média'),
        ('large',  'Grande'),
    ]

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='prospects', null=True, blank=True)
    company_name = models.CharField(max_length=200)
    contact_name = models.CharField(max_length=200)
    contact_email = models.EmailField()
    contact_phone = models.CharField(max_length=20, blank=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='website')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='lead_received')
    estimated_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    description = models.TextField(blank=True)
    next_action = models.TextField(blank=True)
    next_action_date = models.DateField(null=True, blank=True)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_prospects'
    )

    # ── Qualificação ──────────────────────────────────────────────────────────
    qualification_level = models.CharField(
        max_length=1, choices=QUALIFICATION_LEVEL_CHOICES, blank=True,
        help_text='Nível do lead conforme resposta do Step 1 do quiz'
    )
    usage_type = models.CharField(
        max_length=20, choices=USAGE_TYPE_CHOICES, blank=True,
        help_text='Cenário A (uso interno) ou Cenário B (produto comercial)'
    )
    quiz_data = models.JSONField(default=dict, blank=True, help_text='Dados brutos do quiz')
    company_size = models.CharField(max_length=10, choices=COMPANY_SIZE_CHOICES, blank=True)

    # Critérios de qualificação mínima (doc Bloco 7 — Regras Gerais)
    has_operation   = models.BooleanField(null=True, blank=True, help_text='Tem operação rodando')
    has_budget      = models.BooleanField(null=True, blank=True, help_text='Budget compatível com o ticket da Inova')
    is_decision_maker = models.BooleanField(null=True, blank=True, help_text='É tomador de decisão ou tem acesso a ele')
    has_urgency     = models.BooleanField(null=True, blank=True, help_text='Tem urgência real — problema gera custo ou trava crescimento')
    qualification_score = models.IntegerField(default=0, help_text='Soma dos critérios atendidos (0–4). Score ≥3 = qualificado')

    # ── Agendamento ───────────────────────────────────────────────────────────
    closer_name = models.CharField(max_length=100, blank=True, help_text='Nome do Closer responsável pela reunião')
    meeting_scheduled_at = models.DateTimeField(null=True, blank=True)
    meeting_link = models.URLField(blank=True, help_text='Link do Calendly / Google Meet / Zoom')
    meeting_attended = models.BooleanField(null=True, blank=True, help_text='Lead compareceu à reunião?')

    # ── Pós-agendamento ───────────────────────────────────────────────────────
    ebook_sent_at = models.DateTimeField(null=True, blank=True)
    meeting_transcript = models.TextField(blank=True, help_text='Transcrição processada da reunião comercial')

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='created_prospects')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'prospects'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.company_name} - {self.get_status_display()}"


class Proposal(models.Model):
    TYPE_CHOICES = [
        ('software_dev', 'Desenvolvimento de Software'),
        ('maintenance', 'Manutenção'),
        ('consulting', 'Consultoria'),
        ('support', 'Suporte'),
        ('other', 'Outro'),
    ]

    BILLING_TYPE_CHOICES = [
        ('hourly', 'Por Hora'),
        ('fixed', 'Preço Fixo'),
        ('monthly', 'Mensal'),
        ('milestone', 'Por Marco'),
    ]

    STATUS_CHOICES = [
        ('draft', 'Rascunho'),
        ('sent', 'Enviado'),
        ('viewed', 'Visualizado'),
        ('discussion', 'Em Discussão'),
        ('approved', 'Aprovado'),
        ('rejected', 'Rejeitado'),
        ('expired', 'Expirado'),
    ]

    prospect = models.ForeignKey(Prospect, on_delete=models.CASCADE, related_name='proposals', null=True, blank=True)
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='proposals')
    number = models.CharField(max_length=20, unique=True)
    title = models.CharField(max_length=200)
    proposal_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    billing_type = models.CharField(max_length=20, choices=BILLING_TYPE_CHOICES)
    version = models.IntegerField(default=1)

    description = models.TextField(blank=True)
    scope = models.JSONField(default=list)  # Escopo inclusions/exclusions
    deliverables = models.JSONField(default=list)  # Entregáveis
    timeline = models.JSONField(default=dict)  # {"start": "", "end": "", "phases": []}
    requirements = models.JSONField(default=list)  # Requisitos técnicos

    hours_estimated = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    valid_until = models.DateField()
    notes = models.TextField(blank=True)
    terms = models.TextField(blank=True)

    sent_at = models.DateTimeField(null=True, blank=True)
    viewed_at = models.DateTimeField(null=True, blank=True)

    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_proposals'
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='created_proposals')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'proposals'
        ordering = ['-created_at']

    def __str__(self):
        return f"Proposta #{self.number} - {self.title}"


class Contract(models.Model):
    TYPE_CHOICES = [
        ('software_dev', 'Desenvolvimento de Software'),
        ('maintenance', 'Manutenção'),
        ('support', 'Suporte'),
        ('consulting', 'Consultoria'),
        ('saas', 'SaaS/Assinatura'),
        ('other', 'Outro'),
    ]

    BILLING_TYPE_CHOICES = [
        ('hourly', 'Por Hora'),
        ('fixed', 'Preço Fixo'),
        ('monthly', 'Mensal'),
        ('milestone', 'Por Marco'),
    ]

    STATUS_CHOICES = [
        ('draft', 'Rascunho'),
        ('pending_signature', 'Pendente Assinatura'),
        ('active', 'Ativo'),
        ('expired', 'Expirado'),
        ('cancelled', 'Cancelado'),
        ('renewed', 'Renovado'),
    ]

    proposal = models.ForeignKey(Proposal, on_delete=models.SET_NULL, null=True, blank=True, related_name='contracts')
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='contracts')
    number = models.CharField(max_length=20, unique=True)
    title = models.CharField(max_length=200)
    contract_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    billing_type = models.CharField(max_length=20, choices=BILLING_TYPE_CHOICES)

    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    auto_renew = models.BooleanField(default=False)
    renewal_days = models.IntegerField(default=30)

    monthly_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_hours_monthly = models.DecimalField(max_digits=8, decimal_places=2, default=0)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    notes = models.TextField(blank=True)
    terms = models.TextField(blank=True)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='contracts')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'contracts'
        ordering = ['-created_at']

    def __str__(self):
        return f"Contrato #{self.number} - {self.customer.company_name or self.customer.name}"


class ProspectActivity(models.Model):
    ACTIVITY_TYPE_CHOICES = [
        ('call', 'Ligação'),
        ('email', 'E-mail'),
        ('meeting', 'Reunião'),
        ('whatsapp', 'WhatsApp'),
        ('demo', 'Demonstração'),
        ('linkedin', 'LinkedIn'),
        ('other', 'Outro'),
    ]

    prospect = models.ForeignKey(Prospect, on_delete=models.CASCADE, related_name='activities')
    activity_type = models.CharField(max_length=20, choices=ACTIVITY_TYPE_CHOICES, default='call')
    subject = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    outcome = models.TextField(blank=True)
    next_action = models.TextField(blank=True)
    next_action_date = models.DateField(null=True, blank=True)
    duration_minutes = models.IntegerField(default=0)
    date = models.DateTimeField(default=timezone.now)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='prospect_activities',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'prospect_activities'
        ordering = ['-date']

    def __str__(self):
        return f"{self.get_activity_type_display()} - {self.prospect.company_name} - {self.subject}"


class WinLossReason(models.Model):
    RESULT_CHOICES = [
        ('won', 'Ganho'),
        ('lost', 'Perdido'),
    ]

    REASON_CHOICES = [
        ('price', 'Preço'),
        ('timeline', 'Prazo'),
        ('competitor', 'Concorrente'),
        ('no_budget', 'Sem Orçamento'),
        ('no_fit', 'Sem Fit'),
        ('relationship', 'Relacionamento'),
        ('other', 'Outro'),
    ]

    prospect = models.OneToOneField(Prospect, on_delete=models.CASCADE, related_name='win_loss')
    result = models.CharField(max_length=10, choices=RESULT_CHOICES)
    reason = models.CharField(max_length=50, choices=REASON_CHOICES)
    competitor = models.CharField(max_length=100, blank=True)
    actual_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'win_loss_reasons'

    def __str__(self):
        return f"{self.get_result_display()} - {self.prospect.company_name} ({self.get_reason_display()})"
