from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0007_prospect_status_align_commercial_process'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProspectMessage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('direction', models.CharField(choices=[('inbound', 'Lead → Inova'), ('outbound', 'Inova → Lead')], max_length=10)),
                ('content', models.TextField()),
                ('channel', models.CharField(choices=[('whatsapp', 'WhatsApp'), ('email', 'E-mail'), ('sms', 'SMS')], default='whatsapp', max_length=10)),
                ('sent_at', models.DateTimeField()),
                ('metadata', models.JSONField(blank=True, help_text='Media URLs, wamid, delivery status, etc.', null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('prospect', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='messages', to='sales.prospect')),
            ],
            options={
                'db_table': 'prospect_messages',
                'ordering': ['sent_at'],
                'indexes': [
                    models.Index(fields=['prospect', 'sent_at'], name='prospect_me_prospec_idx'),
                ],
            },
        ),
    ]
