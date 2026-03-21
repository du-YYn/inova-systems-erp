"""
Align Prospect status choices with the commercial process document.
Add new statuses: scheduled, pre_meeting, no_show, meeting_done, not_closed.
Remove statuses: discovery, negotiation.
Add fields: follow_up_reason, pre_meeting_scenario, last_message, last_message_at.
Migrate existing data from old statuses to new ones.
"""
from django.db import migrations, models


def migrate_status_forward(apps, schema_editor):
    """Convert old statuses to new commercial process statuses."""
    Prospect = apps.get_model('sales', 'Prospect')
    # discovery -> scheduled (agendado)
    Prospect.objects.filter(status='discovery').update(status='scheduled')
    # negotiation -> proposal (não existe no documento, mover para proposta enviada)
    Prospect.objects.filter(status='negotiation').update(status='proposal')


def migrate_status_backward(apps, schema_editor):
    """Revert new statuses back to old ones."""
    Prospect = apps.get_model('sales', 'Prospect')
    Prospect.objects.filter(status='scheduled').update(status='discovery')
    Prospect.objects.filter(status='pre_meeting').update(status='discovery')
    Prospect.objects.filter(status='no_show').update(status='follow_up')
    Prospect.objects.filter(status='meeting_done').update(status='proposal')
    Prospect.objects.filter(status='not_closed').update(status='follow_up')


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0006_prospect_service_interest_temperature_and_status_update'),
    ]

    operations = [
        # 1. Update Prospect status choices (add new, keep old temporarily for data migration)
        migrations.AlterField(
            model_name='prospect',
            name='status',
            field=models.CharField(
                default='new', max_length=20,
                choices=[
                    ('new', 'Lead Recebido'),
                    ('qualifying', 'Em Qualificação'),
                    ('qualified', 'Qualificado'),
                    ('disqualified', 'Não Qualificado'),
                    ('scheduled', 'Agendado'),
                    ('pre_meeting', 'Pré-Reunião'),
                    ('no_show', 'Não Compareceu'),
                    ('meeting_done', 'Reunião Realizada'),
                    ('proposal', 'Proposta Enviada'),
                    ('won', 'Fechado'),
                    ('not_closed', 'Não Fechou'),
                    ('lost', 'Perdido'),
                    ('follow_up', 'Em Follow-up'),
                ],
            ),
        ),

        # 2. Add new fields
        migrations.AddField(
            model_name='prospect',
            name='follow_up_reason',
            field=models.CharField(
                blank=True, max_length=20,
                choices=[
                    ('nao_agendou', 'Não Agendou'),
                    ('nao_compareceu', 'Não Compareceu'),
                    ('nao_fechou', 'Não Fechou'),
                ],
                help_text='Sub-cenário do follow-up: nao_agendou, nao_compareceu, nao_fechou',
            ),
        ),
        migrations.AddField(
            model_name='prospect',
            name='pre_meeting_scenario',
            field=models.IntegerField(
                blank=True, null=True,
                choices=[(1, '2 a 5 dias de antecedência'), (2, 'Reunião no dia seguinte')],
                help_text='Cenário de pré-reunião: 1 (2-5 dias) ou 2 (dia seguinte)',
            ),
        ),
        migrations.AddField(
            model_name='prospect',
            name='last_message',
            field=models.TextField(
                blank=True,
                help_text='Última mensagem do lead via WhatsApp',
            ),
        ),
        migrations.AddField(
            model_name='prospect',
            name='last_message_at',
            field=models.DateTimeField(
                blank=True, null=True,
            ),
        ),

        # 3. Migrate existing data
        migrations.RunPython(migrate_status_forward, migrate_status_backward),
    ]
