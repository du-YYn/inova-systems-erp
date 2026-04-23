from django.db import migrations, models


class Migration(migrations.Migration):
    """Apenas atualiza o help_text do campo variables em EmailTemplate.

    Detectada pelo `makemigrations --check` — o modelo tem help_text
    mais descritivo que a migration anterior (0002). Sem impacto no schema.
    """

    dependencies = [
        ('notifications', '0002_emailtemplate'),
    ]

    operations = [
        migrations.AlterField(
            model_name='emailtemplate',
            name='variables',
            field=models.JSONField(
                default=list,
                help_text='Lista de variáveis disponíveis: [{"key": "nome", "description": "Nome do destinatário"}]',
            ),
        ),
    ]
