from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0016_prospect_production_payment'),
    ]

    operations = [
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
                    ('lost', 'Lead Perdido'), ('follow_up', 'Follow-up'),
                    ('contract_created', 'Contrato Criado'),
                ],
                default='call', max_length=30,
            ),
        ),
    ]
