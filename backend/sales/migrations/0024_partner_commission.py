from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('sales', '0023_clientonboarding_finance_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='prospect',
            name='referred_by',
            field=models.ForeignKey(
                blank=True, null=True,
                help_text='Parceiro que indicou este lead',
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='referrals',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.CreateModel(
            name='PartnerCommission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('project_value', models.DecimalField(decimal_places=2, max_digits=12)),
                ('commission_pct', models.DecimalField(decimal_places=2, max_digits=5)),
                ('commission_value', models.DecimalField(decimal_places=2, max_digits=12)),
                ('status', models.CharField(choices=[('pending', 'Pendente'), ('paid', 'Pago')], default='pending', max_length=10)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('partner', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='commissions', to=settings.AUTH_USER_MODEL)),
                ('prospect', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='partner_commission', to='sales.prospect')),
            ],
            options={
                'db_table': 'partner_commissions',
                'ordering': ['-created_at'],
            },
        ),
    ]
