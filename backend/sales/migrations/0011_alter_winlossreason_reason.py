from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0010_prospect_proposal_value'),
    ]

    operations = [
        migrations.AlterField(
            model_name='winlossreason',
            name='reason',
            field=models.CharField(
                choices=[
                    ('price', 'Preço'),
                    ('timeline', 'Prazo'),
                    ('competitor', 'Concorrente'),
                    ('no_budget', 'Sem Orçamento'),
                    ('no_fit', 'Sem Fit'),
                    ('no_response', 'Sem Resposta'),
                    ('relationship', 'Relacionamento'),
                    ('other', 'Outro'),
                ],
                max_length=50,
            ),
        ),
    ]
