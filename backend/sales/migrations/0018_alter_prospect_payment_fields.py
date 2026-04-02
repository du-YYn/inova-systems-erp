from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0017_prospect_status_production'),
    ]

    operations = [
        migrations.AlterField(
            model_name='prospect',
            name='payment_first_due',
            field=models.DateField(blank=True, help_text='Vencimento da primeira parcela/entrada', null=True),
        ),
        migrations.AlterField(
            model_name='prospect',
            name='payment_split_pct',
            field=models.IntegerField(default=50, help_text='% da entrada (para tipo split)'),
        ),
    ]
