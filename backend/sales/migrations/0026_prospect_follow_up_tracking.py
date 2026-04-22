from django.db import migrations, models


class Migration(migrations.Migration):
    """Adiciona follow_up_count e last_follow_up_at ao Prospect de forma idempotente.

    Os campos foram adicionados ao modelo no commit 0d83f6b (feat(sales):
    add follow-up tracking) sem a migration correspondente, o que quebra
    os testes em CI e pode ter sido contornado manualmente em produção.

    Usa RunSQL com `IF NOT EXISTS` para ser seguro em qualquer estado do
    banco — se as colunas já existem, o ALTER é no-op; se não existem, são
    criadas. `state_operations` informa o Django ORM da presença das colunas
    sem tentar alterar o schema.

    Também atua como merge dos dois leaf nodes existentes na app sales
    (0023_prospect_contact_email_optional e 0025_alter_partnercommission_prospect).
    """

    dependencies = [
        ('sales', '0023_prospect_contact_email_optional'),
        ('sales', '0025_alter_partnercommission_prospect'),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS follow_up_count INTEGER NOT NULL DEFAULT 0;",
                "ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_follow_up_at TIMESTAMP WITH TIME ZONE NULL;",
            ],
            reverse_sql=[
                "ALTER TABLE prospects DROP COLUMN IF EXISTS last_follow_up_at;",
                "ALTER TABLE prospects DROP COLUMN IF EXISTS follow_up_count;",
            ],
            state_operations=[
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
            ],
        ),
    ]
