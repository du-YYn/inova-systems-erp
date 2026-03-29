from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0012_customer_source'),
    ]

    operations = [
        migrations.AddField(
            model_name='customer',
            name='contract_value',
            field=models.DecimalField(decimal_places=2, default=0, help_text='Valor do contrato', max_digits=12),
        ),
        migrations.AddField(
            model_name='customer',
            name='billing_frequency',
            field=models.CharField(blank=True, choices=[('one_time', 'Pagamento Único'), ('monthly', 'Mensal'), ('quarterly', 'Trimestral'), ('semiannual', 'Semestral'), ('yearly', 'Anual')], default='monthly', max_length=20),
        ),
    ]
