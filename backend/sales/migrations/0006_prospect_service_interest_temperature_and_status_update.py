"""
Add service_interest, temperature fields to Prospect.
Update status choices for Prospect, Proposal, Contract, Customer segment.
Migrate existing status data to new nomenclature.
"""
from django.db import migrations, models


def migrate_prospect_status(apps, schema_editor):
    """Convert old status values to new nomenclature."""
    Prospect = apps.get_model('sales', 'Prospect')
    status_map = {
        'lead_received': 'new',
        'not_qualified': 'disqualified',
        'scheduled': 'discovery',
        'pre_meeting': 'discovery',
        'no_show': 'follow_up',
        'meeting_done': 'proposal',
        'proposal_sent': 'proposal',
        'closed': 'won',
        'not_closed': 'lost',
    }
    for old_status, new_status in status_map.items():
        Prospect.objects.filter(status=old_status).update(status=new_status)


def migrate_proposal_status(apps, schema_editor):
    """Convert discussion to negotiation."""
    Proposal = apps.get_model('sales', 'Proposal')
    Proposal.objects.filter(status='discussion').update(status='negotiation')


def migrate_customer_segment(apps, schema_editor):
    """Convert mid_size to smb."""
    Customer = apps.get_model('sales', 'Customer')
    Customer.objects.filter(segment='mid_size').update(segment='smb')


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0005_alter_customer_contacts_alter_proposal_deliverables_and_more'),
    ]

    operations = [
        # Add new fields to Prospect
        migrations.AddField(
            model_name='prospect',
            name='service_interest',
            field=models.CharField(
                blank=True, max_length=20,
                choices=[
                    ('software_dev', 'Desenvolvimento de Software'),
                    ('automation', 'Automação de Processos'),
                    ('ai', 'Inteligência Artificial'),
                    ('consulting', 'Consultoria Técnica'),
                    ('support', 'Suporte e Manutenção'),
                    ('mixed', 'Múltiplos Serviços'),
                ],
                help_text='Serviço de interesse principal do lead',
            ),
        ),
        migrations.AddField(
            model_name='prospect',
            name='temperature',
            field=models.CharField(
                default='warm', max_length=10,
                choices=[
                    ('hot', 'Quente'),
                    ('warm', 'Morno'),
                    ('cold', 'Frio'),
                ],
                help_text='Temperatura do lead: quente, morno ou frio',
            ),
        ),

        # Update Prospect status choices
        migrations.AlterField(
            model_name='prospect',
            name='status',
            field=models.CharField(
                default='new', max_length=20,
                choices=[
                    ('new', 'Novo Lead'),
                    ('qualifying', 'Em Qualificação'),
                    ('qualified', 'Oportunidade'),
                    ('disqualified', 'Desqualificado'),
                    ('discovery', 'Discovery'),
                    ('proposal', 'Proposta Enviada'),
                    ('negotiation', 'Em Negociação'),
                    ('won', 'Ganho'),
                    ('lost', 'Perdido'),
                    ('follow_up', 'Em Follow-up'),
                ],
            ),
        ),

        # Update Proposal type choices
        migrations.AlterField(
            model_name='proposal',
            name='proposal_type',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('software_dev', 'Desenvolvimento de Software'),
                    ('automation', 'Automação de Processos'),
                    ('ai', 'Inteligência Artificial'),
                    ('consulting', 'Consultoria Técnica'),
                    ('maintenance', 'Manutenção'),
                    ('support', 'Suporte'),
                    ('mixed', 'Múltiplos Serviços'),
                ],
            ),
        ),

        # Update Proposal status choices
        migrations.AlterField(
            model_name='proposal',
            name='status',
            field=models.CharField(
                default='draft', max_length=20,
                choices=[
                    ('draft', 'Rascunho'),
                    ('sent', 'Enviada'),
                    ('viewed', 'Visualizada'),
                    ('negotiation', 'Em Negociação'),
                    ('approved', 'Aprovada'),
                    ('rejected', 'Recusada'),
                    ('expired', 'Expirada'),
                ],
            ),
        ),

        # Update Contract type choices
        migrations.AlterField(
            model_name='contract',
            name='contract_type',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('software_dev', 'Desenvolvimento de Software'),
                    ('automation', 'Automação de Processos'),
                    ('ai', 'Inteligência Artificial'),
                    ('consulting', 'Consultoria Técnica'),
                    ('maintenance', 'Manutenção'),
                    ('support', 'Suporte'),
                    ('saas', 'SaaS/Assinatura'),
                    ('mixed', 'Múltiplos Serviços'),
                ],
            ),
        ),

        # Update Customer segment choices
        migrations.AlterField(
            model_name='customer',
            name='segment',
            field=models.CharField(
                default='smb', max_length=20,
                choices=[
                    ('startup', 'Startup'),
                    ('smb', 'Pequena/Média Empresa'),
                    ('enterprise', 'Enterprise'),
                    ('government', 'Governo'),
                    ('education', 'Educação'),
                    ('health', 'Saúde'),
                    ('finance', 'Financeiro'),
                    ('retail', 'Varejo'),
                    ('industry', 'Indústria'),
                    ('tech', 'Tecnologia'),
                    ('other', 'Outro'),
                ],
            ),
        ),

        # Data migrations — convert existing data
        migrations.RunPython(migrate_prospect_status, migrations.RunPython.noop),
        migrations.RunPython(migrate_proposal_status, migrations.RunPython.noop),
        migrations.RunPython(migrate_customer_segment, migrations.RunPython.noop),
    ]
