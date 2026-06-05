"""S7H: hardening do fluxo de autenticacao.

Adiciona campos para:
- Lockout por usuario apos 5 falhas de login (failed_attempts, locked_until).
- Invalidacao de temp_2fa_token apos 5 falhas (temp_2fa_attempts).
- Soft-cap por-email para password reset (password_reset_last_sent).
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0007_totp_secret_encrypted'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='failed_attempts',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='user',
            name='locked_until',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='temp_2fa_attempts',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='user',
            name='password_reset_last_sent',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
