import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('sales', '0021_merge_0008_prospectmessage_0020_proposal_file_token_views'),
    ]

    operations = [
        migrations.CreateModel(
            name='ClientOnboarding',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('public_token', models.UUIDField(db_index=True, default=uuid.uuid4, help_text='Token para acesso público ao formulário', unique=True)),
                ('status', models.CharField(choices=[('pending', 'Pendente'), ('submitted', 'Preenchido'), ('reviewed', 'Revisado')], default='pending', max_length=20)),
                # Dados da Empresa
                ('company_legal_name', models.CharField(blank=True, help_text='Razão Social', max_length=300)),
                ('company_cnpj', models.CharField(blank=True, max_length=18)),
                ('company_street', models.CharField(blank=True, max_length=300)),
                ('company_number', models.CharField(blank=True, max_length=20)),
                ('company_complement', models.CharField(blank=True, max_length=100)),
                ('company_neighborhood', models.CharField(blank=True, help_text='Bairro', max_length=100)),
                ('company_city', models.CharField(blank=True, max_length=100)),
                ('company_state', models.CharField(blank=True, max_length=2)),
                ('company_cep', models.CharField(blank=True, max_length=9)),
                # Representante Legal
                ('rep_full_name', models.CharField(blank=True, max_length=300)),
                ('rep_marital_status', models.CharField(blank=True, choices=[('solteiro', 'Solteiro(a)'), ('casado', 'Casado(a)'), ('divorciado', 'Divorciado(a)'), ('viuvo', 'Viúvo(a)'), ('separado', 'Separado(a)'), ('uniao_estavel', 'União Estável')], max_length=20)),
                ('rep_profession', models.CharField(blank=True, max_length=200)),
                ('rep_cpf', models.CharField(blank=True, max_length=14)),
                ('rep_street', models.CharField(blank=True, max_length=300)),
                ('rep_number', models.CharField(blank=True, max_length=20)),
                ('rep_complement', models.CharField(blank=True, max_length=100)),
                ('rep_neighborhood', models.CharField(blank=True, help_text='Bairro', max_length=100)),
                ('rep_city', models.CharField(blank=True, max_length=100)),
                ('rep_state', models.CharField(blank=True, max_length=2)),
                ('rep_cep', models.CharField(blank=True, max_length=9)),
                # Rastreamento
                ('submitted_at', models.DateTimeField(blank=True, null=True)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.CharField(blank=True, max_length=500)),
                # Auditoria
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                # FKs
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='created_onboardings', to=settings.AUTH_USER_MODEL)),
                ('customer', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='onboardings', to='sales.customer')),
                ('prospect', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='onboarding', to='sales.prospect')),
            ],
            options={
                'db_table': 'client_onboardings',
                'ordering': ['-created_at'],
            },
        ),
    ]
