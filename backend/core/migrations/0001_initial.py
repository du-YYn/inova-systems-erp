from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('timestamp', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('username_snapshot', models.CharField(
                    blank=True, max_length=150,
                    help_text='Username no momento do evento (snapshot, imutavel)',
                )),
                ('user_role_snapshot', models.CharField(blank=True, max_length=20)),
                ('action', models.CharField(
                    max_length=100,
                    help_text='Ex: contract_activate, invoice_mark_paid, customer_anonymize',
                )),
                ('resource_type', models.CharField(
                    max_length=50,
                    help_text='Ex: contract, invoice, customer, payment_provider',
                )),
                ('resource_id', models.CharField(
                    blank=True, max_length=100,
                    help_text='PK do recurso afetado (string para suportar UUID/int)',
                )),
                ('old_value', models.JSONField(blank=True, default=dict)),
                ('new_value', models.JSONField(blank=True, default=dict)),
                ('details', models.TextField(blank=True)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.CharField(blank=True, max_length=500)),
                ('user', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=models.deletion.PROTECT,
                    related_name='audit_logs',
                    to=settings.AUTH_USER_MODEL,
                    help_text='Usuario que executou a operacao (null para operacoes do sistema)',
                )),
            ],
            options={
                'db_table': 'audit_log',
                'ordering': ['-timestamp'],
                'indexes': [
                    models.Index(fields=['resource_type', 'resource_id'], name='audit_log_resourc_2570dd_idx'),
                    models.Index(fields=['user', '-timestamp'], name='audit_log_user_id_79f582_idx'),
                    models.Index(fields=['action', '-timestamp'], name='audit_log_action_cf8063_idx'),
                ],
            },
        ),
    ]
