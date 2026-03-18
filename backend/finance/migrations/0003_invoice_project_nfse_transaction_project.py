from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0002_alter_category_parent_on_delete'),
        ('projects', '0002_projecttask_depends_on_sprint_projectenvironment_and_more'),
    ]

    operations = [
        # Add project FK to Invoice
        migrations.AddField(
            model_name='invoice',
            name='project',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='invoices',
                to='projects.project',
            ),
        ),
        # Add NFS-e fields to Invoice
        migrations.AddField(
            model_name='invoice',
            name='nfse_number',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='invoice',
            name='nfse_status',
            field=models.CharField(
                blank=True,
                choices=[
                    ('pending', 'Pendente'),
                    ('issued', 'Emitida'),
                    ('cancelled', 'Cancelada'),
                    ('error', 'Erro'),
                ],
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='invoice',
            name='nfse_xml_url',
            field=models.URLField(blank=True),
        ),
        migrations.AddField(
            model_name='invoice',
            name='nfse_pdf_url',
            field=models.URLField(blank=True),
        ),
        # Add project FK to Transaction
        migrations.AddField(
            model_name='transaction',
            name='project',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='expenses',
                to='projects.project',
            ),
        ),
    ]
