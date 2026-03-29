import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('sales', '0013_customer_contract_value_billing_frequency'),
        ('finance', '0004_alter_invoice_items_alter_transaction_tags'),
    ]

    operations = [
        migrations.CreateModel(
            name='TaxEntry',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tax_type', models.CharField(choices=[('das', 'DAS Faturamento'), ('das_parcelamento', 'DAS Parcelamento'), ('inss', 'INSS Pro labore'), ('taxa_bancaria', 'Taxa Bancária'), ('taxa_asaas', 'Taxa ASAAS'), ('other', 'Outro')], max_length=20)),
                ('reference_month', models.DateField(help_text='Primeiro dia do mês de referência')),
                ('rate', models.DecimalField(decimal_places=2, default=0, help_text='Alíquota %', max_digits=5)),
                ('base_amount', models.DecimalField(decimal_places=2, default=0, help_text='Base de cálculo', max_digits=12)),
                ('value', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('notes', models.TextField(blank=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='tax_entries', to=settings.AUTH_USER_MODEL)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'db_table': 'tax_entries', 'ordering': ['-reference_month', 'tax_type']},
        ),
        migrations.CreateModel(
            name='ClientCost',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('cost_type', models.CharField(choices=[('license_erp', 'Licença Sistema Parceiro'), ('license_botconversa', 'Licença BotConversa'), ('license_zapi', 'Licença Z-API'), ('reserve_zapi', 'Reserva Limite Z-API'), ('commission_closer', 'Comissão Closer'), ('commission_sdr', 'Comissão SDR'), ('miv', 'MIV - Custo de Lead'), ('designer', 'Designer'), ('other', 'Outro')], max_length=30)),
                ('value', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('reference_month', models.DateField(help_text='Primeiro dia do mês de referência')),
                ('notes', models.TextField(blank=True)),
                ('customer', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='client_costs', to='sales.customer')),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='client_costs', to=settings.AUTH_USER_MODEL)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'db_table': 'client_costs', 'ordering': ['-reference_month', 'customer__company_name']},
        ),
        migrations.CreateModel(
            name='RecurringExpense',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('expense_category', models.CharField(choices=[('salarios', 'Salários'), ('imovel', 'Imóvel'), ('manutencao', 'Manutenção'), ('materiais', 'Materiais'), ('sistemas', 'Sistemas/Assinaturas'), ('equipamentos', 'Equipamentos'), ('marketing', 'Marketing'), ('honorarios', 'Honorários'), ('gerais', 'Despesas Gerais')], max_length=20)),
                ('description', models.CharField(max_length=200)),
                ('value', models.DecimalField(decimal_places=2, max_digits=12)),
                ('due_day', models.IntegerField(default=1, help_text='Dia do vencimento (1-31)')),
                ('is_recurring', models.BooleanField(default=True)),
                ('is_active', models.BooleanField(default=True)),
                ('notes', models.TextField(blank=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='recurring_expenses', to=settings.AUTH_USER_MODEL)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'db_table': 'recurring_expenses', 'ordering': ['expense_category', 'description']},
        ),
        migrations.CreateModel(
            name='Loan',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('partner', models.CharField(help_text='Sócio responsável', max_length=100)),
                ('card_bank', models.CharField(blank=True, help_text='Cartão/Banco', max_length=100)),
                ('description', models.CharField(max_length=200)),
                ('total_amount', models.DecimalField(decimal_places=2, max_digits=12)),
                ('num_installments', models.IntegerField()),
                ('installment_value', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('start_date', models.DateField()),
                ('is_active', models.BooleanField(default=True)),
                ('notes', models.TextField(blank=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='loans', to=settings.AUTH_USER_MODEL)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'db_table': 'loans', 'ordering': ['-start_date']},
        ),
        migrations.CreateModel(
            name='LoanInstallment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('number', models.IntegerField()),
                ('due_date', models.DateField()),
                ('value', models.DecimalField(decimal_places=2, max_digits=12)),
                ('is_paid', models.BooleanField(default=False)),
                ('paid_date', models.DateField(blank=True, null=True)),
                ('loan', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='installments', to='finance.loan')),
            ],
            options={'db_table': 'loan_installments', 'ordering': ['loan', 'number']},
        ),
        migrations.CreateModel(
            name='Asset',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('quantity', models.IntegerField(default=1)),
                ('unit_value', models.DecimalField(decimal_places=2, max_digits=12)),
                ('useful_life_months', models.IntegerField(help_text='Vida útil em meses')),
                ('acquisition_date', models.DateField()),
                ('monthly_depreciation', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('is_active', models.BooleanField(default=True)),
                ('notes', models.TextField(blank=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='assets', to=settings.AUTH_USER_MODEL)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'db_table': 'assets', 'ordering': ['name']},
        ),
        migrations.CreateModel(
            name='ProfitDistConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('working_capital_pct', models.DecimalField(decimal_places=2, default=20, max_digits=5)),
                ('reserve_fund_pct', models.DecimalField(decimal_places=2, default=20, max_digits=5)),
                ('directors_pct', models.DecimalField(decimal_places=2, default=50, max_digits=5)),
                ('directors_cap', models.DecimalField(decimal_places=2, default=15000, max_digits=12)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'db_table': 'profit_dist_config'},
        ),
        migrations.CreateModel(
            name='ProfitDistPartner',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('share_pct', models.DecimalField(decimal_places=2, help_text='% de participação', max_digits=5)),
                ('is_active', models.BooleanField(default=True)),
                ('config', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='partners', to='finance.profitdistconfig')),
            ],
            options={'db_table': 'profit_dist_partners', 'ordering': ['name']},
        ),
    ]
