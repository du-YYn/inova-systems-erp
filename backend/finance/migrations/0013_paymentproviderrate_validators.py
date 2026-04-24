"""F1.4: adiciona validators aos campos de taxa do PaymentProviderRate.

- installment_fee_pct: Min(0), Max(99.99) — evita divisao por zero em repass_fee
- anticipation_monthly_pct: Min(0), Max(99.99)
- installment_fee_fixed: Min(0)
- fixed_fee: Min(0)

Valida em nivel de serializer/full_clean. Nao altera schema (apenas metadados).
"""
from decimal import Decimal
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0012_invoice_integrity_s1'),
    ]

    operations = [
        migrations.AlterField(
            model_name='paymentproviderrate',
            name='installment_fee_pct',
            field=models.DecimalField(
                decimal_places=4, default=0, max_digits=6,
                validators=[
                    MinValueValidator(Decimal('0')),
                    MaxValueValidator(Decimal('99.99')),
                ],
                help_text='Percentual da taxa por parcela (0-99.99%, ex: 3.99 = 3,99%)',
            ),
        ),
        migrations.AlterField(
            model_name='paymentproviderrate',
            name='installment_fee_fixed',
            field=models.DecimalField(
                decimal_places=2, default=0, max_digits=10,
                validators=[MinValueValidator(Decimal('0'))],
                help_text='Taxa fixa em R$ por parcela (ex: 0.49)',
            ),
        ),
        migrations.AlterField(
            model_name='paymentproviderrate',
            name='anticipation_monthly_pct',
            field=models.DecimalField(
                decimal_places=4, default=0, max_digits=6,
                validators=[
                    MinValueValidator(Decimal('0')),
                    MaxValueValidator(Decimal('99.99')),
                ],
                help_text='Taxa mensal de antecipação (0-99.99%, ex: 1.70 = 1,70% ao mês)',
            ),
        ),
        migrations.AlterField(
            model_name='paymentproviderrate',
            name='fixed_fee',
            field=models.DecimalField(
                decimal_places=2, default=0, max_digits=10,
                validators=[MinValueValidator(Decimal('0'))],
                help_text='Taxa fixa por emissão (boleto/PIX). 0 quando não se aplica.',
            ),
        ),
    ]
