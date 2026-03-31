from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0005_taxentry_clientcost_recurringexpense_loan_loaninstallment_asset_profitdistconfig_profitdistpartner'),
    ]

    operations = [
        migrations.CreateModel(
            name='TaxConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('das_rate', models.DecimalField(decimal_places=2, default=6, help_text='Alíquota DAS %', max_digits=5)),
                ('inss_base', models.DecimalField(decimal_places=2, default=0, help_text='Base INSS pro labore', max_digits=12)),
                ('inss_rate', models.DecimalField(decimal_places=2, default=11, help_text='Alíquota INSS %', max_digits=5)),
                ('bank_fees', models.DecimalField(decimal_places=2, default=0, help_text='Taxas bancárias/mês', max_digits=12)),
                ('asaas_fees', models.DecimalField(decimal_places=2, default=0, help_text='Taxas ASAAS/mês', max_digits=12)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'db_table': 'tax_config'},
        ),
    ]
