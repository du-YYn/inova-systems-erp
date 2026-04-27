"""Testes do hotfix de deploy resilience (TOTP_ENCRYPTION_KEY soft-required).

Cenario: producao sem TOTP_ENCRYPTION_KEY.
- App tem que SUBIR (settings carrega sem raise).
- system check core.W001 reporta config ausente.
- 2FA encrypt falha com ImproperlyConfigured (mensagem clara, nao 500 random).
- Demais features (login normal, CRUD) continuam funcionando.
"""
import os
from unittest.mock import patch

import pytest
from django.core.exceptions import ImproperlyConfigured

from accounts.totp_crypto import encrypt_totp, decrypt_totp


# ─── system check ────────────────────────────────────────────────────────────


class TestTotpKeySystemCheck:
    """Reporta TOTP_ENCRYPTION_KEY ausente como Warning, nao bloqueia checks."""

    def test_warning_when_missing_in_production(self):
        from core.checks import check_totp_encryption_key
        # Simula producao sem a key
        with patch.dict(os.environ, {'DEBUG': 'False'}, clear=False), \
             patch.dict(os.environ, {}, clear=False):
            os.environ.pop('TOTP_ENCRYPTION_KEY', None)
            warnings = check_totp_encryption_key(app_configs=None)
        assert len(warnings) == 1
        warning = warnings[0]
        assert warning.id == 'core.W001'
        assert 'TOTP_ENCRYPTION_KEY' in warning.msg
        assert '2FA' in warning.msg
        # Hint inclui o comando exato
        assert 'Fernet' in warning.hint

    def test_no_warning_in_debug(self):
        from core.checks import check_totp_encryption_key
        with patch.dict(os.environ, {'DEBUG': 'True'}, clear=False):
            os.environ.pop('TOTP_ENCRYPTION_KEY', None)
            warnings = check_totp_encryption_key(app_configs=None)
        assert warnings == []

    def test_no_warning_when_key_set(self):
        from core.checks import check_totp_encryption_key
        with patch.dict(
            os.environ,
            {'DEBUG': 'False', 'TOTP_ENCRYPTION_KEY': 'any-string'},
            clear=False,
        ):
            warnings = check_totp_encryption_key(app_configs=None)
        assert warnings == []


# ─── totp_crypto fail-safe ───────────────────────────────────────────────────


class TestTotpCryptoFailSafe:
    """encrypt_totp/decrypt_totp continuam protegendo o sistema mesmo
    quando a key esta ausente — falha cedo com mensagem clara."""

    def test_encrypt_without_key_raises_clear_error(self, settings):
        settings.TOTP_ENCRYPTION_KEY = ''
        with pytest.raises(ImproperlyConfigured) as exc_info:
            encrypt_totp('JBSWY3DPEHPK3PXP')
        assert 'TOTP_ENCRYPTION_KEY' in str(exc_info.value)

    def test_decrypt_empty_returns_empty_without_key(self, settings):
        settings.TOTP_ENCRYPTION_KEY = ''
        # decrypt('') retorna '' antes de tentar usar a key
        assert decrypt_totp('') == ''

    def test_encrypt_empty_returns_empty_without_key(self, settings):
        settings.TOTP_ENCRYPTION_KEY = ''
        # Curto-circuito: encrypt('') retorna '' sem precisar da key
        assert encrypt_totp('') == ''
