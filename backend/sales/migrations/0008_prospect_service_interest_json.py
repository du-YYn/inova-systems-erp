from django.db import migrations, models


def convert_string_to_list(apps, schema_editor):
    """Migra service_interest de string para lista."""
    Prospect = apps.get_model('sales', 'Prospect')
    for prospect in Prospect.objects.all():
        raw = prospect.service_interest
        if isinstance(raw, list):
            # Já é lista — não faz nada
            continue
        if raw and isinstance(raw, str):
            prospect.service_interest = [raw]
        else:
            prospect.service_interest = []
        prospect.save(update_fields=['service_interest'])


def convert_list_to_string(apps, schema_editor):
    """Reverso: pega o primeiro item da lista (ou string vazia)."""
    Prospect = apps.get_model('sales', 'Prospect')
    for prospect in Prospect.objects.all():
        raw = prospect.service_interest
        if isinstance(raw, list):
            prospect.service_interest = raw[0] if raw else ''
        prospect.save(update_fields=['service_interest'])


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0007_prospect_status_align_commercial_process'),
    ]

    operations = [
        migrations.AlterField(
            model_name='prospect',
            name='service_interest',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='Lista de serviços de interesse do lead',
            ),
        ),
        migrations.RunPython(convert_string_to_list, reverse_code=convert_list_to_string),
    ]
