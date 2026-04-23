from django.db import migrations, models


def seed_asaas(apps, schema_editor):
    """Seed inicial: Asaas com taxas vigentes (abr/2026) para cartão, boleto e PIX.

    Valores atuais (do simulador Asaas):
    - Cartão: 3,99% + R$ 0,49 por parcela, antecipação 1,70% ao mês
    - Boleto: sem taxa no modelo do lojista (pode ter no futuro)
    - PIX:    grátis

    Admin pode ajustar pela tela /configuracoes/bancos.
    """
    PaymentProvider = apps.get_model('finance', 'PaymentProvider')
    PaymentProviderRate = apps.get_model('finance', 'PaymentProviderRate')

    asaas, _ = PaymentProvider.objects.update_or_create(
        code='asaas',
        defaults={
            'name': 'Asaas',
            'is_active': True,
            'display_order': 1,
            'notes': 'Gateway padrão. Taxas vigentes em abr/2026.',
        },
    )

    rates = [
        {
            'method': 'credit_card',
            'installment_fee_pct': '3.99',
            'installment_fee_fixed': '0.49',
            'anticipation_monthly_pct': '1.70',
            'fixed_fee': '0.00',
        },
        {
            'method': 'boleto',
            'installment_fee_pct': '0.00',
            'installment_fee_fixed': '0.00',
            'anticipation_monthly_pct': '0.00',
            'fixed_fee': '0.00',
        },
        {
            'method': 'pix',
            'installment_fee_pct': '0.00',
            'installment_fee_fixed': '0.00',
            'anticipation_monthly_pct': '0.00',
            'fixed_fee': '0.00',
        },
    ]
    for r in rates:
        PaymentProviderRate.objects.update_or_create(
            provider=asaas, method=r['method'], defaults=r,
        )


def unseed_asaas(apps, schema_editor):
    PaymentProvider = apps.get_model('finance', 'PaymentProvider')
    PaymentProvider.objects.filter(code='asaas').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0010_clientcost_frequency'),
    ]

    operations = [
        migrations.CreateModel(
            name='PaymentProvider',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.SlugField(max_length=50, unique=True, help_text='Código único (ex: asaas, pagseguro, stone)')),
                ('name', models.CharField(max_length=100)),
                ('is_active', models.BooleanField(default=True)),
                ('display_order', models.IntegerField(default=0)),
                ('notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'payment_providers',
                'ordering': ['display_order', 'name'],
            },
        ),
        migrations.CreateModel(
            name='PaymentProviderRate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('method', models.CharField(
                    choices=[('credit_card', 'Cartão de Crédito'), ('boleto', 'Boleto'), ('pix', 'PIX')],
                    max_length=20,
                )),
                ('installment_fee_pct', models.DecimalField(decimal_places=4, default=0, max_digits=6, help_text='Percentual da taxa por parcela (ex: 3.99 = 3,99%)')),
                ('installment_fee_fixed', models.DecimalField(decimal_places=2, default=0, max_digits=10, help_text='Taxa fixa em R$ por parcela (ex: 0.49)')),
                ('anticipation_monthly_pct', models.DecimalField(decimal_places=4, default=0, max_digits=6, help_text='Taxa mensal de antecipação (ex: 1.70 = 1,70% ao mês)')),
                ('fixed_fee', models.DecimalField(decimal_places=2, default=0, max_digits=10, help_text='Taxa fixa por emissão (boleto/PIX). 0 quando não se aplica.')),
                ('notes', models.CharField(blank=True, max_length=300)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('provider', models.ForeignKey(
                    on_delete=models.deletion.CASCADE,
                    related_name='rates', to='finance.paymentprovider',
                )),
            ],
            options={
                'db_table': 'payment_provider_rates',
                'ordering': ['provider__display_order', 'method'],
            },
        ),
        migrations.AddConstraint(
            model_name='paymentproviderrate',
            constraint=models.UniqueConstraint(
                fields=('provider', 'method'), name='unique_provider_method_rate',
            ),
        ),
        migrations.RunPython(seed_asaas, reverse_code=unseed_asaas),
    ]
