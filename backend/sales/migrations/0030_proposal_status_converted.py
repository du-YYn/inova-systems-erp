from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0029_auto_field_alignment'),
    ]

    operations = [
        migrations.AlterField(
            model_name='proposal',
            name='status',
            field=models.CharField(
                choices=[
                    ('draft', 'Rascunho'),
                    ('sent', 'Enviada'),
                    ('viewed', 'Visualizada'),
                    ('negotiation', 'Em Negociação'),
                    ('approved', 'Aprovada'),
                    ('converted', 'Convertida em Contrato'),
                    ('rejected', 'Recusada'),
                    ('expired', 'Expirada'),
                ],
                default='draft',
                max_length=20,
            ),
        ),
    ]
