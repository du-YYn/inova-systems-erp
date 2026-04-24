"""Testes F3b: cifragem do totp_secret + mask em logs."""
import logging

import pyotp
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from accounts.totp_crypto import encrypt_totp, decrypt_totp

User = get_user_model()


# ─── Fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def regular_user(db):
    return User.objects.create_user(
        username='s3b_user', email='s3b@user.com',
        password='pass12345', role='operator',
    )


@pytest.fixture
def auth_client(api_client, regular_user):
    api_client.force_authenticate(user=regular_user)
    return api_client


# ─── F3b.1: totp_crypto helpers ───────────────────────────────────────────

@pytest.mark.django_db
class TestTotpCrypto:
    def test_encrypt_returns_different_string(self):
        raw = pyotp.random_base32()
        ciphertext = encrypt_totp(raw)
        assert ciphertext != raw
        assert len(ciphertext) > 40

    def test_decrypt_roundtrip(self):
        raw = 'JBSWY3DPEHPK3PXP'
        ct = encrypt_totp(raw)
        assert decrypt_totp(ct) == raw

    def test_decrypt_failsafe_plaintext_legacy(self):
        """Valor plain-text legado (nao cifrado) deve retornar como esta."""
        legacy = 'JBSWY3DPEHPK3PXP'  # TOTP base32 valido
        assert decrypt_totp(legacy) == legacy

    def test_encrypt_empty_returns_empty(self):
        assert encrypt_totp('') == ''

    def test_decrypt_empty_returns_empty(self):
        assert decrypt_totp('') == ''

    def test_user_set_totp_secret_stores_ciphertext(self, regular_user):
        raw = pyotp.random_base32()
        regular_user.set_totp_secret(raw)
        # DB tem ciphertext, nao plain-text
        assert regular_user.totp_secret != raw
        assert len(regular_user.totp_secret) > 40

    def test_user_get_totp_secret_decrypts(self, regular_user):
        raw = pyotp.random_base32()
        regular_user.set_totp_secret(raw)
        assert regular_user.get_totp_secret() == raw

    def test_user_get_totp_secret_legacy_plaintext(self, regular_user):
        """User criado com secret plain-text antes da migration."""
        regular_user.totp_secret = 'JBSWY3DPEHPK3PXP'
        regular_user.save()
        assert regular_user.get_totp_secret() == 'JBSWY3DPEHPK3PXP'


# ─── F3b.1: integração 2FA ────────────────────────────────────────────────

@pytest.mark.django_db
class TestTwoFactorEncryption:
    URL = '/api/v1/accounts/2fa/setup/'

    def test_2fa_enable_stores_encrypted_secret(self, auth_client, regular_user):
        r = auth_client.post(self.URL, {'password': 'pass12345'}, format='json')
        assert r.status_code == status.HTTP_200_OK
        regular_user.refresh_from_db()
        assert regular_user.is_2fa_enabled
        # DB nao tem o plain-text que foi retornado ao cliente
        plain_secret = r.data['secret']
        assert regular_user.totp_secret != plain_secret
        # Mas get_totp_secret() retorna o plain-text (decifrado)
        assert regular_user.get_totp_secret() == plain_secret


# ─── F3b.2: logs mascarados ───────────────────────────────────────────────

@pytest.mark.django_db
class TestLogsMasked:
    def test_email_renderer_masks_recipient(self, caplog):
        """send_template_email_sync loga email mascarado."""
        from notifications.email_renderer import send_template_email_sync
        from notifications.models import EmailTemplate
        EmailTemplate.objects.create(
            slug='mask_test', subject='Teste',
            body_html='<p>Oi {{nome}}</p>', is_active=True,
        )
        with caplog.at_level(logging.INFO, logger='notifications'):
            send_template_email_sync('mask_test', 'cliente@empresa.com', {'nome': 'X'})
        log_output = '\n'.join(r.message for r in caplog.records)
        # Email completo NAO deve aparecer no log
        assert 'cliente@empresa.com' not in log_output
        assert 'empresa.com' not in log_output  # dominio tambem mascarado
        # Mas deve haver algum log do envio
        assert len(caplog.records) > 0
        assert 'mask_test' in log_output  # slug aparece mas recipient mascarado
        # Formato tipico: "cl***te@***.com"
        assert '***' in log_output
