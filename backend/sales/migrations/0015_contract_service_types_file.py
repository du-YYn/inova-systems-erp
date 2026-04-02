from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0014_prospectactivity_type_expand'),
    ]

    operations = [
        migrations.AddField(
            model_name='contract',
            name='service_types',
            field=models.JSONField(blank=True, default=list, help_text='Lista de tipos de serviço'),
        ),
        migrations.AddField(
            model_name='contract',
            name='contract_file',
            field=models.FileField(blank=True, help_text='PDF do contrato', null=True, upload_to='contracts/%Y/%m/'),
        ),
        migrations.AlterField(
            model_name='contract',
            name='contract_type',
            field=models.CharField(blank=True, choices=[('software_dev', 'Desenvolvimento de Software'), ('automation', 'Automação de Processos'), ('ai', 'Inteligência Artificial'), ('consulting', 'Consultoria Técnica'), ('maintenance', 'Manutenção'), ('support', 'Suporte'), ('saas', 'SaaS/Assinatura'), ('mixed', 'Múltiplos Serviços')], default='', max_length=20),
        ),
        # Migrate existing contract_type to service_types list
        migrations.RunSQL(
            sql="UPDATE contracts SET service_types = json_build_array(contract_type) WHERE contract_type != '' AND contract_type IS NOT NULL;",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
