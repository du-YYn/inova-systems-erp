from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_alter_user_avatar'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[
                    ('admin', 'Administrador'),
                    ('manager', 'Gerente'),
                    ('operator', 'Operador'),
                    ('viewer', 'Visualizador'),
                    ('partner', 'Parceiro'),
                ],
                default='operator',
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name='PartnerProfile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('partner_id', models.CharField(db_index=True, help_text='ID único do parceiro (PRC-00001)', max_length=10, unique=True)),
                ('company_name', models.CharField(blank=True, max_length=200)),
                ('phone', models.CharField(blank=True, max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='partner_profile', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'partner_profiles',
                'ordering': ['-created_at'],
            },
        ),
    ]
