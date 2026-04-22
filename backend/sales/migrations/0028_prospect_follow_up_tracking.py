from django.db import migrations, models


class Migration(migrations.Migration):
    """Adiciona colunas de tracking de follow-up ao Prospect.

    Os campos follow_up_count e last_follow_up_at foram adicionados ao modelo
    no commit 0d83f6b (feat(sales): add follow-up tracking) sem a migration
    correspondente. Isso quebra os testes em CI e novas instalações.
    """

    dependencies = [
        ('sales', '0027_merge_0023_0026'),
    ]

    operations = [
        migrations.AddField(
            model_name='prospect',
            name='follow_up_count',
            field=models.IntegerField(
                default=0,
                help_text='Número de follow-ups realizados',
            ),
        ),
        migrations.AddField(
            model_name='prospect',
            name='last_follow_up_at',
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text='Data/hora do último follow-up',
            ),
        ),
    ]
