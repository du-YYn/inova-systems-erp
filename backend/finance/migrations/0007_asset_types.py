from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0006_taxconfig'),
    ]

    operations = [
        migrations.AddField(
            model_name='asset',
            name='asset_type',
            field=models.CharField(choices=[('physical', 'Bem Físico'), ('software', 'Software / White Label'), ('annual_license', 'Licença Anual')], default='physical', max_length=20),
        ),
        migrations.AddField(
            model_name='asset',
            name='setup_cost',
            field=models.DecimalField(decimal_places=2, default=0, help_text='Custo de aquisição/setup', max_digits=12),
        ),
        migrations.AddField(
            model_name='asset',
            name='amortization_months',
            field=models.IntegerField(default=0, help_text='Amortização em meses (0 = sem)'),
        ),
        migrations.AddField(
            model_name='asset',
            name='license_unit_cost',
            field=models.DecimalField(decimal_places=2, default=0, help_text='Custo por licença (informativo)', max_digits=12),
        ),
        migrations.AddField(
            model_name='asset',
            name='annual_cost',
            field=models.DecimalField(decimal_places=2, default=0, help_text='Valor anual da licença', max_digits=12),
        ),
        migrations.AddField(
            model_name='asset',
            name='renewal_date',
            field=models.DateField(blank=True, help_text='Data de renovação', null=True),
        ),
        migrations.AlterField(
            model_name='asset',
            name='unit_value',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AlterField(
            model_name='asset',
            name='useful_life_months',
            field=models.IntegerField(default=0, help_text='Vida útil em meses (bem físico)'),
        ),
    ]
