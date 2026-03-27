from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0009_proposal_customer_nullable'),
    ]

    operations = [
        migrations.AddField(
            model_name='prospect',
            name='proposal_value',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text='Valor definido pelo Closer para a proposta comercial',
                max_digits=12,
                null=True,
            ),
        ),
    ]
