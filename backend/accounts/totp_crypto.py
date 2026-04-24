"""Criptografia de segredos TOTP (F3b.1).

Cifra `User.totp_secret` em repouso usando Fernet (AES-128 CBC + HMAC-SHA256).
Chave `TOTP_ENCRYPTION_KEY` vem de env separada do DB — backup do banco
vazado nao e suficiente para reconstruir 2FA.

Fail-safe: `decrypt_totp()` tolera valores plain-text (InvalidToken retorna
como esta) para nao quebrar usuarios que ativaram 2FA antes da migracao.
Na proxima ativacao/reconfiguracao, o secret sera cifrado automaticamente.
"""
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


def _get_fernet() -> Fernet:
    key = getattr(settings, 'TOTP_ENCRYPTION_KEY', '') or ''
    if not key:
        raise ImproperlyConfigured(
            'TOTP_ENCRYPTION_KEY nao configurada. '
            'Defina em .env (Fernet key base64 32 bytes; gerar com: '
            'python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())")'
        )
    if isinstance(key, str):
        key = key.encode()
    try:
        return Fernet(key)
    except Exception as exc:
        raise ImproperlyConfigured(
            f'TOTP_ENCRYPTION_KEY invalida: {exc}. '
            'Deve ser Fernet key base64 32 bytes.'
        )


def encrypt_totp(raw_secret: str) -> str:
    """Cifra o segredo TOTP. Retorna string vazia para entrada vazia."""
    if not raw_secret:
        return ''
    return _get_fernet().encrypt(raw_secret.encode()).decode()


def decrypt_totp(stored_value: str) -> str:
    """Decifra o segredo TOTP.

    Fail-safe: se o valor nao for um ciphertext Fernet valido, retorna
    como esta (compat com secrets plain-text criados antes da migracao).
    Isso permite zero-downtime deploy.
    """
    if not stored_value:
        return ''
    try:
        return _get_fernet().decrypt(stored_value.encode()).decode()
    except InvalidToken:
        # Plain-text legado — retorna sem decifrar.
        # Proxima reativacao 2FA cifrara automaticamente.
        return stored_value
    except Exception:
        return ''
