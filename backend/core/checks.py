"""Django system checks — surfacam config faltante em `manage.py check`.

Esses checks rodam:
- Sempre que `manage.py check` e' invocado
- Antes de `runserver`/`migrate` (a menos que `--skip-checks`)
- No deploy, antes do gunicorn iniciar

Diferenca chave vs raise no settings.py:
- raise no settings: bloqueia import → app NAO sobe.
- system check (Warning/Error): app sobe, mas aviso aparece em logs e
  no output do check command. Operador ve a falta de config sem perder
  o resto das features.
"""
import os

from django.core.checks import Tags, Warning, register


@register(Tags.security, deploy=True)
def check_totp_encryption_key(app_configs, **kwargs):
    """Avisa se TOTP_ENCRYPTION_KEY esta ausente em producao.

    O fluxo 2FA depende dessa key (encrypt/decrypt do `totp_secret` em repouso).
    Sem ela, login sem 2FA continua funcionando, mas setup/verify de 2FA
    falha cedo em `accounts.totp_crypto._get_fernet()` com
    `ImproperlyConfigured`. Login normal nao quebra.

    Mantemos como Warning (W001), nao Error: produzir um Error faria
    `manage.py migrate --no-input` falhar com exit 1 e isso bloquearia
    deploys novamente — exatamente o que estamos resolvendo.
    """
    is_debug = os.environ.get('DEBUG', 'False').lower() == 'true'
    if is_debug:
        return []
    if not os.environ.get('TOTP_ENCRYPTION_KEY'):
        return [
            Warning(
                'TOTP_ENCRYPTION_KEY nao configurada — fluxo 2FA esta '
                'bloqueado. Login sem 2FA continua funcional; setup/verify '
                'de 2FA retornarao erro 500 ate a env var ser definida.',
                hint=(
                    'Gere uma Fernet key em base64 32 bytes:\n'
                    '  python -c "from cryptography.fernet import Fernet; '
                    'print(Fernet.generate_key().decode())"\n'
                    'e adicione ao .env de producao como TOTP_ENCRYPTION_KEY=...'
                ),
                id='core.W001',
            )
        ]
    return []
