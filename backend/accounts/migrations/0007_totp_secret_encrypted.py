"""F3b.1: totp_secret agora armazena ciphertext Fernet (~100 chars).

Aumenta max_length de 32 para 256. Nao cifra secrets existentes — eles
continuam plain-text e serao aceitos via fail-safe em
accounts.totp_crypto.decrypt_totp(). Proxima reativacao 2FA pelo usuario
cifra automaticamente.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0006_partner_profile'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='totp_secret',
            field=models.CharField(blank=True, max_length=256, null=True),
        ),
    ]
