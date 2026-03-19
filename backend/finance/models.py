from django.db import models
from django.conf import settings
from core.validators import validate_invoice_items, validate_tags_list


class BankAccount(models.Model):
    TYPE_CHOICES = [
        ('checking', 'Conta Corrente'),
        ('savings', 'Poupança'),
        ('investment', 'Investimento'),
        ('wallet', 'Carteira'),
    ]

    name = models.CharField(max_length=100)
    bank = models.CharField(max_length=100)
    account_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    agency = models.CharField(max_length=20, blank=True)
    account_number = models.CharField(max_length=30, blank=True)
    pix_key = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'bank_accounts'
        ordering = ['-is_default', 'name']

    def __str__(self):
        return f"{self.name} - {self.bank}"


class Category(models.Model):
    TYPE_CHOICES = [
        ('income', 'Receita'),
        ('expense', 'Despesa'),
    ]

    name = models.CharField(max_length=100)
    category_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='children')
    color = models.CharField(max_length=7, default='#A6864A')
    icon = models.CharField(max_length=50, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'categories'
        ordering = ['category_type', 'name']
        verbose_name_plural = 'categories'

    def __str__(self):
        return f"{self.name} ({self.get_category_type_display()})"


class Invoice(models.Model):
    TYPE_CHOICES = [
        ('receivable', 'Conta a Receber'),
        ('payable', 'Conta a Pagar'),
    ]

    STATUS_CHOICES = [
        ('draft', 'Rascunho'),
        ('pending', 'Pendente'),
        ('sent', 'Enviada'),
        ('paid', 'Paga'),
        ('overdue', 'Vencida'),
        ('cancelled', 'Cancelada'),
    ]

    TYPE_DOC_CHOICES = [
        ('invoice', 'Nota Fiscal'),
        ('receipt', 'Recibo'),
        ('bill', 'Boleto'),
        ('other', 'Outro'),
    ]

    invoice_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    document_type = models.CharField(max_length=20, choices=TYPE_DOC_CHOICES, default='invoice')

    contract = models.ForeignKey('sales.Contract', on_delete=models.SET_NULL, null=True, blank=True, related_name='invoices')
    customer = models.ForeignKey('sales.Customer', on_delete=models.SET_NULL, null=True, blank=True, related_name='invoices')

    number = models.CharField(max_length=20)
    series = models.CharField(max_length=10, default='1')

    issue_date = models.DateField()
    due_date = models.DateField()
    paid_date = models.DateField(null=True, blank=True)

    value = models.DecimalField(max_digits=12, decimal_places=2)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    interest = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2)

    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True)
    bank_account = models.ForeignKey(BankAccount, on_delete=models.SET_NULL, null=True, blank=True)

    description = models.TextField(blank=True)
    items = models.JSONField(default=list, validators=[validate_invoice_items])

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')

    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment_method = models.CharField(max_length=50, blank=True)
    payment_details = models.JSONField(default=dict)

    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoices',
    )

    is_recurring = models.BooleanField(default=False)
    recurring_pattern = models.CharField(max_length=50, blank=True)  # monthly, weekly
    parent_invoice = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='recurring_invoices')

    NFSE_STATUS_CHOICES = [
        ('pending', 'Pendente'),
        ('issued', 'Emitida'),
        ('cancelled', 'Cancelada'),
        ('error', 'Erro'),
    ]

    nfse_number = models.CharField(max_length=50, blank=True)
    nfse_status = models.CharField(max_length=20, blank=True, choices=NFSE_STATUS_CHOICES)
    nfse_xml_url = models.URLField(blank=True)
    nfse_pdf_url = models.URLField(blank=True)

    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='created_invoices')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'invoices'
        ordering = ['-issue_date']

    def __str__(self):
        return f"{self.invoice_type} #{self.number}"


class Transaction(models.Model):
    TYPE_CHOICES = [
        ('income', 'Receita'),
        ('expense', 'Despesa'),
        ('transfer', 'Transferência'),
    ]

    TYPE_DOC_CHOICES = [
        ('manual', 'Manual'),
        ('invoice', 'Fatura'),
        ('recurring', 'Recorrente'),
    ]

    transaction_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    doc_type = models.CharField(max_length=20, choices=TYPE_DOC_CHOICES, default='manual')

    invoice = models.ForeignKey(Invoice, on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')
    customer = models.ForeignKey('sales.Customer', on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')
    contract = models.ForeignKey('sales.Contract', on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')

    bank_account = models.ForeignKey(BankAccount, on_delete=models.CASCADE, related_name='transactions')
    bank_account_to = models.ForeignKey(BankAccount, on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions_to')

    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True)

    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expenses',
    )

    date = models.DateField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    description = models.CharField(max_length=200)
    notes = models.TextField(blank=True)

    tags = models.JSONField(default=list, validators=[validate_tags_list])

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='transactions')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'transactions'
        ordering = ['-date']

    def __str__(self):
        return f"{self.transaction_type} - {self.amount} - {self.description}"


class CostCenter(models.Model):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'cost_centers'
        ordering = ['code']

    def __str__(self):
        return f"{self.code} - {self.name}"


class Budget(models.Model):
    PERIOD_CHOICES = [
        ('monthly', 'Mensal'),
        ('quarterly', 'Trimestral'),
        ('yearly', 'Anual'),
    ]

    name = models.CharField(max_length=100)
    period = models.CharField(max_length=20, choices=PERIOD_CHOICES, default='monthly')
    start_date = models.DateField()
    end_date = models.DateField()
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='budgets')
    cost_center = models.ForeignKey(CostCenter, on_delete=models.SET_NULL, null=True, blank=True, related_name='budgets')

    planned = models.DecimalField(max_digits=12, decimal_places=2)
    actual = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='budgets')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'budgets'
        ordering = ['-start_date']

    def __str__(self):
        return f"{self.name} - {self.planned}"
