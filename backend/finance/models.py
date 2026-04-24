from decimal import Decimal

from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
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
        constraints = [
            models.UniqueConstraint(
                fields=['invoice_type', 'number'],
                name='unique_invoice_type_number',
            ),
        ]

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


class TaxConfig(models.Model):
    """Configuração de tributação (singleton). Alíquotas e taxas fixas."""
    das_rate = models.DecimalField(max_digits=5, decimal_places=2, default=6, help_text='Alíquota DAS %')
    inss_base = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text='Base INSS pro labore')
    inss_rate = models.DecimalField(max_digits=5, decimal_places=2, default=11, help_text='Alíquota INSS %')
    bank_fees = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text='Taxas bancárias/mês')
    asaas_fees = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text='Taxas ASAAS/mês')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tax_config'

    def __str__(self):
        return f"DAS {self.das_rate}% | INSS {self.inss_rate}%"

    def calculate(self, rob_current_month, rob_previous_month=None):
        """Calcula deduções automáticas. DAS usa receita do mês anterior."""
        base_das = float(rob_previous_month) if rob_previous_month else float(rob_current_month)
        das = base_das * float(self.das_rate) / 100
        inss = float(self.inss_base) * float(self.inss_rate) / 100
        return {
            'das': round(das, 2),
            'das_base': round(base_das, 2),
            'das_rate': float(self.das_rate),
            'inss': round(inss, 2),
            'inss_base': float(self.inss_base),
            'inss_rate': float(self.inss_rate),
            'bank_fees': float(self.bank_fees),
            'asaas_fees': float(self.asaas_fees),
            'total': round(das + inss + float(self.bank_fees) + float(self.asaas_fees), 2),
        }


class TaxEntry(models.Model):
    """Impostos e deduções mensais (DAS, INSS, taxas) — histórico."""
    TYPE_CHOICES = [
        ('das', 'DAS Faturamento'),
        ('das_parcelamento', 'DAS Parcelamento'),
        ('inss', 'INSS Pro labore'),
        ('taxa_bancaria', 'Taxa Bancária'),
        ('taxa_asaas', 'Taxa ASAAS'),
        ('other', 'Outro'),
    ]

    tax_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    reference_month = models.DateField(help_text='Primeiro dia do mês de referência')
    rate = models.DecimalField(max_digits=5, decimal_places=2, default=0, help_text='Alíquota %')
    base_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text='Base de cálculo')
    value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='tax_entries')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tax_entries'
        ordering = ['-reference_month', 'tax_type']

    def __str__(self):
        return f"{self.get_tax_type_display()} - {self.reference_month.strftime('%m/%Y')}"


class ClientCost(models.Model):
    """Custos variáveis por cliente — qualquer tipo de custo associado."""
    COST_CATEGORY_CHOICES = [
        ('sistemas', 'Sistemas'),
        ('pessoas', 'Pessoas'),
        ('infraestrutura', 'Infraestrutura'),
        ('comercial', 'Comercial'),
        ('outro', 'Outro'),
    ]

    FREQUENCY_CHOICES = [
        ('one_time', 'Único'),
        ('monthly', 'Mensal'),
        ('quarterly', 'Trimestral'),
        ('semiannual', 'Semestral'),
        ('yearly', 'Anual'),
    ]

    customer = models.ForeignKey('sales.Customer', on_delete=models.CASCADE, related_name='client_costs')
    cost_category = models.CharField(max_length=30, choices=COST_CATEGORY_CHOICES, default='sistemas')
    description = models.CharField(max_length=200, help_text='Nome do custo')
    value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    frequency = models.CharField(max_length=20, choices=FREQUENCY_CHOICES, default='monthly')
    reference_month = models.DateField(help_text='Primeiro dia do mês de referência')
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='client_costs')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'client_costs'
        ordering = ['-reference_month', 'customer__company_name', 'cost_category']

    def __str__(self):
        return f"{self.customer} - {self.description} - {self.reference_month.strftime('%m/%Y')}"


class RecurringExpense(models.Model):
    """Despesas fixas recorrentes."""
    CATEGORY_CHOICES = [
        ('salarios', 'Salários'),
        ('imovel', 'Imóvel'),
        ('manutencao', 'Manutenção'),
        ('materiais', 'Materiais'),
        ('sistemas', 'Sistemas/Assinaturas'),
        ('equipamentos', 'Equipamentos'),
        ('marketing', 'Marketing'),
        ('honorarios', 'Honorários'),
        ('gerais', 'Despesas Gerais'),
    ]

    expense_category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    description = models.CharField(max_length=200)
    value = models.DecimalField(max_digits=12, decimal_places=2)
    due_day = models.IntegerField(default=1, help_text='Dia do vencimento (1-31)')
    is_recurring = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='recurring_expenses')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'recurring_expenses'
        ordering = ['expense_category', 'description']

    def __str__(self):
        return f"{self.get_expense_category_display()} - {self.description}"


class Loan(models.Model):
    """Empréstimos e reparcelamentos."""
    partner = models.CharField(max_length=100, help_text='Sócio responsável')
    card_bank = models.CharField(max_length=100, blank=True, help_text='Cartão/Banco')
    description = models.CharField(max_length=200)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    num_installments = models.IntegerField()
    installment_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    start_date = models.DateField()
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='loans')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'loans'
        ordering = ['-start_date']

    def __str__(self):
        return f"{self.partner} - {self.description}"


class LoanInstallment(models.Model):
    """Parcelas de empréstimo (geradas automaticamente)."""
    loan = models.ForeignKey(Loan, on_delete=models.CASCADE, related_name='installments')
    number = models.IntegerField()
    due_date = models.DateField()
    value = models.DecimalField(max_digits=12, decimal_places=2)
    is_paid = models.BooleanField(default=False)
    paid_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'loan_installments'
        ordering = ['loan', 'number']

    def __str__(self):
        return f"{self.loan} - Parcela {self.number}/{self.loan.num_installments}"


class Asset(models.Model):
    """Ativos patrimoniais — bens físicos, software/white label, licenças anuais."""
    ASSET_TYPE_CHOICES = [
        ('physical', 'Bem Físico'),
        ('software', 'Software / White Label'),
        ('annual_license', 'Licença Anual'),
    ]

    asset_type = models.CharField(max_length=20, choices=ASSET_TYPE_CHOICES, default='physical')
    name = models.CharField(max_length=200)

    # Bem Físico
    quantity = models.IntegerField(default=1)
    unit_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    useful_life_months = models.IntegerField(default=0, help_text='Vida útil em meses (bem físico)')

    # Software / White Label
    setup_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text='Custo de aquisição/setup')
    amortization_months = models.IntegerField(default=0, help_text='Amortização em meses (0 = sem)')
    license_unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text='Custo por licença (informativo)')

    # Licença Anual
    annual_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text='Valor anual da licença')
    renewal_date = models.DateField(null=True, blank=True, help_text='Data de renovação')

    # Comum
    acquisition_date = models.DateField()
    monthly_depreciation = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='assets')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'assets'
        ordering = ['name']

    def calc_monthly_depreciation(self):
        if self.asset_type == 'physical':
            if self.useful_life_months and self.useful_life_months > 0:
                return (self.unit_value * self.quantity) / self.useful_life_months
        elif self.asset_type == 'software':
            if self.amortization_months and self.amortization_months > 0:
                return self.setup_cost / self.amortization_months
        elif self.asset_type == 'annual_license':
            if self.annual_cost and self.annual_cost > 0:
                return self.annual_cost / 12
        return 0

    def __str__(self):
        return f"{self.name} ({self.get_asset_type_display()})"


class ProfitDistConfig(models.Model):
    """Configuração de distribuição de lucros (singleton)."""
    working_capital_pct = models.DecimalField(max_digits=5, decimal_places=2, default=20)
    reserve_fund_pct = models.DecimalField(max_digits=5, decimal_places=2, default=20)
    directors_pct = models.DecimalField(max_digits=5, decimal_places=2, default=50)
    directors_cap = models.DecimalField(max_digits=12, decimal_places=2, default=15000)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'profit_dist_config'

    def __str__(self):
        return f"Distrib.: CG {self.working_capital_pct}% | Reserva {self.reserve_fund_pct}% | Dir. {self.directors_pct}%"


class ProfitDistPartner(models.Model):
    """Sócios na distribuição de lucros."""
    config = models.ForeignKey(ProfitDistConfig, on_delete=models.CASCADE, related_name='partners')
    name = models.CharField(max_length=100)
    share_pct = models.DecimalField(max_digits=5, decimal_places=2, help_text='% de participação')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'profit_dist_partners'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.share_pct}%)"


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


# ─────────────────────────────────────────────────────────────────────────────
# Payment Providers (bancos / gateways) + Taxas
# ─────────────────────────────────────────────────────────────────────────────

class PaymentProvider(models.Model):
    """Catálogo de bancos/gateways de pagamento (Asaas, PagSeguro, Stone, etc.).

    Admin cadastra e mantém as taxas vigentes. Cada provider tem uma ou mais
    `PaymentProviderRate` (uma por método: credit_card, boleto, pix).
    """
    code = models.SlugField(
        max_length=50, unique=True,
        help_text='Código único (ex: asaas, pagseguro, stone)',
    )
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'payment_providers'
        ordering = ['display_order', 'name']

    def __str__(self):
        return self.name


class PaymentProviderRate(models.Model):
    """Taxas de um provider por método de pagamento.

    Valores decimais em percentual (ex: 3.99 = 3,99%).
    """
    METHOD_CHOICES = [
        ('credit_card', 'Cartão de Crédito'),
        ('boleto', 'Boleto'),
        ('pix', 'PIX'),
    ]

    provider = models.ForeignKey(
        PaymentProvider, on_delete=models.CASCADE, related_name='rates',
    )
    method = models.CharField(max_length=20, choices=METHOD_CHOICES)

    installment_fee_pct = models.DecimalField(
        max_digits=6, decimal_places=4, default=0,
        validators=[
            MinValueValidator(Decimal('0')),
            MaxValueValidator(Decimal('99.99')),
        ],
        help_text='Percentual da taxa por parcela (0-99.99%, ex: 3.99 = 3,99%)',
    )
    installment_fee_fixed = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        validators=[MinValueValidator(Decimal('0'))],
        help_text='Taxa fixa em R$ por parcela (ex: 0.49)',
    )
    anticipation_monthly_pct = models.DecimalField(
        max_digits=6, decimal_places=4, default=0,
        validators=[
            MinValueValidator(Decimal('0')),
            MaxValueValidator(Decimal('99.99')),
        ],
        help_text='Taxa mensal de antecipação (0-99.99%, ex: 1.70 = 1,70% ao mês)',
    )
    fixed_fee = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        validators=[MinValueValidator(Decimal('0'))],
        help_text='Taxa fixa por emissão (boleto/PIX). 0 quando não se aplica.',
    )

    notes = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'payment_provider_rates'
        ordering = ['provider__display_order', 'method']
        constraints = [
            models.UniqueConstraint(
                fields=['provider', 'method'],
                name='unique_provider_method_rate',
            ),
        ]

    def __str__(self):
        return f"{self.provider.name} — {self.get_method_display()}"
