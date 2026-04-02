from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0018_alter_prospect_payment_fields'),
    ]

    operations = [
        migrations.AlterField(
            model_name='prospect',
            name='status',
            field=models.CharField(
                choices=[
                    ('new', 'Lead Recebido'), ('qualifying', 'Em Qualificação'),
                    ('qualified', 'Qualificado'), ('disqualified', 'Não Qualificado'),
                    ('scheduled', 'Agendado'), ('pre_meeting', 'Pré-Reunião'),
                    ('no_show', 'Não Compareceu'), ('meeting_done', 'Reunião Realizada'),
                    ('proposal', 'Proposta Enviada'), ('won', 'Fechado'),
                    ('production', 'Em Produção'), ('concluded', 'Concluído'),
                    ('not_closed', 'Não Fechou'), ('lost', 'Perdido'),
                    ('follow_up', 'Em Follow-up'),
                ],
                default='new', max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='prospectactivity',
            name='activity_type',
            field=models.CharField(
                choices=[
                    ('call', 'Ligação'), ('email', 'E-mail'), ('meeting', 'Reunião'),
                    ('whatsapp', 'WhatsApp'), ('demo', 'Demonstração'), ('linkedin', 'LinkedIn'),
                    ('other', 'Outro'), ('lead_created', 'Lead Recebido'),
                    ('status_changed', 'Status Alterado'), ('qualified', 'Qualificado'),
                    ('disqualified', 'Não Qualificado'), ('meeting_scheduled', 'Reunião Agendada'),
                    ('no_show', 'Não Compareceu'), ('meeting_done', 'Reunião Realizada'),
                    ('proposal_created', 'Proposta Criada'), ('proposal_sent', 'Proposta Enviada'),
                    ('proposal_approved', 'Proposta Aprovada'), ('proposal_rejected', 'Proposta Rejeitada'),
                    ('won', 'Lead Fechado'), ('production', 'Em Produção'),
                    ('concluded', 'Projeto Concluído'),
                    ('lost', 'Lead Perdido'), ('follow_up', 'Follow-up'),
                    ('contract_created', 'Contrato Criado'),
                ],
                default='call', max_length=30,
            ),
        ),
    ]
