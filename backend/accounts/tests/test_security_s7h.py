"""Testes S7H: hardening do fluxo de autenticacao.

Cobre:
- S7H.1: Lockout por usuario apos 5 falhas com backoff exponencial.
- S7H.2: Login timing-safe (account enumeration) — sem log revelando existencia.
- S7H.3: temp_2fa_token invalidado apos 5 falhas de TOTP.
- S7H.4: TwoFactorVerifyView bloqueia user inativo.
- S7H.5: ChangePasswordView throttle 5/h + step 2FA quando habilitado.
- S7H.6: LogoutView aceita apenas refresh_token via cookie httpOnly.
- S7H.7: PasswordResetRequest com throttle composto + soft-cap por-email.
"""
import hashlib
import logging
from datetime import timedelta

import pyotp
import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User as UserModel  # noqa: F401  - usado por type-hint implicito

User = get_user_model()


# ─── Fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture(autouse=True)
def _flush_cache_between_tests():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def user_factory(db):
    def _create(username='s7h_user', email='s7h@user.com',
                password='pass12345', role='operator', is_active=True,  # noqa: S107
                is_2fa_enabled=False, totp_secret=''):
        u = User.objects.create_user(
            username=username, email=email, password=password,
            role=role, is_active=is_active,
        )
        if is_2fa_enabled:
            u.set_totp_secret(totp_secret or pyotp.random_base32())
            u.is_2fa_enabled = True
            u.save()
        return u
    return _create


@pytest.fixture
def regular_user(user_factory):
    return user_factory()


@pytest.fixture
def user_with_2fa(user_factory):
    secret = pyotp.random_base32()
    user = user_factory(
        username='s7h_2fa', email='s7h@2fa.com',
        is_2fa_enabled=True, totp_secret=secret,
    )
    # Anexa o secret plain para o teste poder gerar codigos validos.
    user._raw_totp_secret = secret
    return user


# ─── S7H.1: Lockout por usuario apos 5 falhas ─────────────────────────────

@pytest.mark.django_db
class TestS7H1_AccountLockout:
    URL = '/api/v1/accounts/login/'

    def test_failed_login_increments_counter(self, api_client, regular_user):
        r = api_client.post(self.URL, {
            'username': regular_user.username, 'password': 'wrong',
        }, format='json')
        assert r.status_code == status.HTTP_401_UNAUTHORIZED
        regular_user.refresh_from_db()
        assert regular_user.failed_attempts == 1
        assert regular_user.locked_until is None

    def test_lockout_applies_after_5_failures(self, api_client, regular_user):
        for _ in range(5):
            api_client.post(self.URL, {
                'username': regular_user.username, 'password': 'wrong',
            }, format='json')
            cache.clear()  # bypassa rate limit de IP, mantemos lockout de user
        regular_user.refresh_from_db()
        assert regular_user.failed_attempts == 5
        assert regular_user.locked_until is not None
        assert regular_user.locked_until > timezone.now()
        # Lockout ~15min
        delta = regular_user.locked_until - timezone.now()
        assert timedelta(minutes=14) < delta <= timedelta(minutes=15)

    def test_locked_user_rejected_even_with_correct_password(
        self, api_client, regular_user,
    ):
        regular_user.locked_until = timezone.now() + timedelta(minutes=10)
        regular_user.failed_attempts = 5
        regular_user.save()
        r = api_client.post(self.URL, {
            'username': regular_user.username, 'password': 'pass12345',
        }, format='json')
        assert r.status_code == status.HTTP_401_UNAUTHORIZED
        # Mensagem generica (mesma que credencial invalida) — anti-enum.
        assert 'Credenciais' in r.data.get('error', '')

    def test_lockout_exponential_backoff(self, api_client, regular_user):
        # Simula 6 tentativas falhas — segundo nivel de backoff = 30min.
        regular_user.failed_attempts = 5
        regular_user.save()
        # Limpa lockout para permitir mais uma tentativa
        regular_user.locked_until = None
        regular_user.save()
        cache.clear()

        api_client.post(self.URL, {
            'username': regular_user.username, 'password': 'wrong',
        }, format='json')
        regular_user.refresh_from_db()
        assert regular_user.failed_attempts == 6
        delta = regular_user.locked_until - timezone.now()
        assert timedelta(minutes=29) < delta <= timedelta(minutes=30)

    def test_successful_login_resets_counter(self, api_client, regular_user):
        regular_user.failed_attempts = 3
        regular_user.save()
        cache.clear()
        r = api_client.post(self.URL, {
            'username': regular_user.username, 'password': 'pass12345',
        }, format='json')
        assert r.status_code == status.HTTP_200_OK
        regular_user.refresh_from_db()
        assert regular_user.failed_attempts == 0
        assert regular_user.locked_until is None

    def test_nonexistent_user_does_not_create_record(self, api_client, db):
        api_client.post(self.URL, {
            'username': 'ghost_user', 'password': 'whatever',
        }, format='json')
        # Nao criou ghost record
        assert not User.objects.filter(username='ghost_user').exists()

    def test_expired_lockout_does_not_block(self, api_client, regular_user):
        # Lockout no passado — nao deve bloquear
        regular_user.locked_until = timezone.now() - timedelta(minutes=1)
        regular_user.failed_attempts = 5
        regular_user.save()
        cache.clear()
        r = api_client.post(self.URL, {
            'username': regular_user.username, 'password': 'pass12345',
        }, format='json')
        assert r.status_code == status.HTTP_200_OK


# ─── S7H.2: Login timing-safe + log nao revela existencia ─────────────────

@pytest.mark.django_db
class TestS7H2_TimingSafeLogin:
    URL = '/api/v1/accounts/login/'

    def test_log_does_not_reveal_user_existence(
        self, api_client, regular_user, caplog,
    ):
        with caplog.at_level(logging.WARNING, logger='accounts'):
            # User existe, senha errada
            api_client.post(self.URL, {
                'username': regular_user.username, 'password': 'wrong',
            }, format='json')
        log_output = '\n'.join(r.message for r in caplog.records)
        # Nao pode revelar que o user existe
        assert 'existe' not in log_output.lower()
        # Nao pode revelar status do is_active
        assert 'active=' not in log_output

    def test_nonexistent_user_log_does_not_reveal(self, api_client, caplog, db):
        with caplog.at_level(logging.WARNING, logger='accounts'):
            api_client.post(self.URL, {
                'username': 'truly_nonexistent', 'password': 'anything',
            }, format='json')
        log_output = '\n'.join(r.message for r in caplog.records)
        assert 'não encontrado' not in log_output
        assert 'nao encontrado' not in log_output
        assert 'truly_nonexistent' not in log_output

    def test_response_status_same_for_existing_and_nonexistent(
        self, api_client, regular_user,
    ):
        r1 = api_client.post(self.URL, {
            'username': regular_user.username, 'password': 'wrong',
        }, format='json')
        cache.clear()
        r2 = api_client.post(self.URL, {
            'username': 'nonexistent_xyz', 'password': 'wrong',
        }, format='json')
        assert r1.status_code == r2.status_code == status.HTTP_401_UNAUTHORIZED
        assert r1.data.get('error') == r2.data.get('error')


# ─── S7H.3: temp_2fa_token invalidado apos 5 falhas ───────────────────────

@pytest.mark.django_db
class TestS7H3_TwoFactorAttemptsLimit:
    LOGIN_URL = '/api/v1/accounts/login/'
    VERIFY_URL = '/api/v1/accounts/2fa/verify/'

    def _initiate_2fa(self, api_client, user):
        r = api_client.post(self.LOGIN_URL, {
            'username': user.username, 'password': 'pass12345',
        }, format='json')
        assert r.status_code == 200
        assert r.data.get('requires_2fa') is True
        return r.data['temp_token']

    def test_temp_token_invalidated_after_5_failures(
        self, api_client, user_with_2fa,
    ):
        temp_token = self._initiate_2fa(api_client, user_with_2fa)
        for _ in range(5):
            cache.clear()  # bypassa rate limit do endpoint
            api_client.post(self.VERIFY_URL, {
                'temp_token': temp_token, 'code': '000000',
            }, format='json')
        user_with_2fa.refresh_from_db()
        # Apos 5 falhas: temp_token zerado, atttempts zerado, exige novo login
        assert user_with_2fa.temp_2fa_token is None
        assert user_with_2fa.temp_2fa_expires is None
        assert user_with_2fa.temp_2fa_attempts == 0

    def test_5th_failure_returns_relogin_message(
        self, api_client, user_with_2fa,
    ):
        temp_token = self._initiate_2fa(api_client, user_with_2fa)
        for _ in range(4):
            cache.clear()
            api_client.post(self.VERIFY_URL, {
                'temp_token': temp_token, 'code': '000000',
            }, format='json')
        cache.clear()
        r = api_client.post(self.VERIFY_URL, {
            'temp_token': temp_token, 'code': '000000',
        }, format='json')
        assert r.status_code == status.HTTP_401_UNAUTHORIZED
        assert 'Faça login' in r.data.get('error', '') or 'login' in r.data.get('error', '').lower()

    def test_successful_verify_resets_attempts(
        self, api_client, user_with_2fa,
    ):
        temp_token = self._initiate_2fa(api_client, user_with_2fa)
        # 2 falhas
        for _ in range(2):
            cache.clear()
            api_client.post(self.VERIFY_URL, {
                'temp_token': temp_token, 'code': '000000',
            }, format='json')
        cache.clear()
        # Codigo correto
        valid_code = pyotp.TOTP(user_with_2fa._raw_totp_secret).now()
        r = api_client.post(self.VERIFY_URL, {
            'temp_token': temp_token, 'code': valid_code,
        }, format='json')
        assert r.status_code == status.HTTP_200_OK
        user_with_2fa.refresh_from_db()
        assert user_with_2fa.temp_2fa_attempts == 0


# ─── S7H.4: TwoFactorVerify rejeita user inativo ──────────────────────────

@pytest.mark.django_db
class TestS7H4_TwoFactorChecksIsActive:
    VERIFY_URL = '/api/v1/accounts/2fa/verify/'

    def test_inactive_user_blocked_in_verify(
        self, api_client, user_with_2fa,
    ):
        # Coloca user diretamente em estado pos-login (com temp_token valido)
        temp_token_plain = 'plain_xyz_token'
        user_with_2fa.temp_2fa_token = hashlib.sha256(
            temp_token_plain.encode()
        ).hexdigest()
        user_with_2fa.temp_2fa_expires = timezone.now() + timedelta(minutes=3)
        user_with_2fa.is_active = False
        user_with_2fa.save()

        valid_code = pyotp.TOTP(user_with_2fa._raw_totp_secret).now()
        r = api_client.post(self.VERIFY_URL, {
            'temp_token': temp_token_plain, 'code': valid_code,
        }, format='json')
        assert r.status_code == status.HTTP_401_UNAUTHORIZED
        assert 'inativo' in r.data.get('error', '').lower()


# ─── S7H.5: ChangePasswordView throttle + 2FA step ────────────────────────

@pytest.mark.django_db
class TestS7H5_ChangePassword:
    URL = '/api/v1/accounts/change-password/'

    def test_change_password_requires_2fa_when_enabled(
        self, api_client, user_with_2fa,
    ):
        api_client.force_authenticate(user=user_with_2fa)
        r = api_client.post(self.URL, {
            'old_password': 'pass12345',
            'new_password': 'NewSecure!Pass99',
            'new_password_confirm': 'NewSecure!Pass99',
        }, format='json')
        assert r.status_code == status.HTTP_400_BAD_REQUEST
        assert '2FA' in r.data.get('error', '') or '2fa' in r.data.get('error', '').lower()

    def test_change_password_rejects_invalid_totp(
        self, api_client, user_with_2fa,
    ):
        api_client.force_authenticate(user=user_with_2fa)
        r = api_client.post(self.URL, {
            'old_password': 'pass12345',
            'new_password': 'NewSecure!Pass99',
            'new_password_confirm': 'NewSecure!Pass99',
            'totp_code': '000000',
        }, format='json')
        assert r.status_code == status.HTTP_400_BAD_REQUEST

    def test_change_password_accepts_valid_totp(
        self, api_client, user_with_2fa,
    ):
        api_client.force_authenticate(user=user_with_2fa)
        valid_code = pyotp.TOTP(user_with_2fa._raw_totp_secret).now()
        r = api_client.post(self.URL, {
            'old_password': 'pass12345',
            'new_password': 'NewSecure!Pass99',
            'new_password_confirm': 'NewSecure!Pass99',
            'totp_code': valid_code,
        }, format='json')
        assert r.status_code == status.HTTP_200_OK
        user_with_2fa.refresh_from_db()
        assert user_with_2fa.check_password('NewSecure!Pass99')

    def test_change_password_without_2fa_works_for_non_2fa_user(
        self, api_client, regular_user,
    ):
        api_client.force_authenticate(user=regular_user)
        r = api_client.post(self.URL, {
            'old_password': 'pass12345',
            'new_password': 'NewSecure!Pass99',
            'new_password_confirm': 'NewSecure!Pass99',
        }, format='json')
        assert r.status_code == status.HTTP_200_OK

    def test_change_password_throttled_after_5(
        self, api_client, regular_user,
    ):
        api_client.force_authenticate(user=regular_user)
        # 5 trocas validas
        passwords = [
            'NewSecure!Pass99', 'Another!Pass99', 'YetMore!Pass99',
            'FourthOne!Pass99', 'FifthOne!Pass99',
        ]
        prev = 'pass12345'
        for new in passwords:
            r = api_client.post(self.URL, {
                'old_password': prev, 'new_password': new,
                'new_password_confirm': new,
            }, format='json')
            assert r.status_code == 200
            prev = new
        # Sexta deve ser throttled (429)
        r = api_client.post(self.URL, {
            'old_password': prev, 'new_password': 'Sixth!Pass99',
            'new_password_confirm': 'Sixth!Pass99',
        }, format='json')
        assert r.status_code == status.HTTP_429_TOO_MANY_REQUESTS


# ─── S7H.6: LogoutView aceita apenas cookie ───────────────────────────────

@pytest.mark.django_db
class TestS7H6_LogoutCookieOnly:
    URL = '/api/v1/accounts/logout/'

    def test_logout_without_cookie_rejected(self, api_client, regular_user):
        api_client.force_authenticate(user=regular_user)
        r = api_client.post(self.URL, {}, format='json')
        assert r.status_code == status.HTTP_401_UNAUTHORIZED

    def test_logout_with_refresh_in_body_rejected(
        self, api_client, regular_user,
    ):
        from rest_framework_simplejwt.tokens import RefreshToken
        api_client.force_authenticate(user=regular_user)
        refresh = RefreshToken.for_user(regular_user)
        # Body-only nao deve mais funcionar — apenas cookie httpOnly
        r = api_client.post(self.URL, {'refresh': str(refresh)}, format='json')
        assert r.status_code == status.HTTP_401_UNAUTHORIZED

    def test_logout_with_cookie_works(self, api_client, regular_user):
        from rest_framework_simplejwt.tokens import RefreshToken
        api_client.force_authenticate(user=regular_user)
        refresh = RefreshToken.for_user(regular_user)
        api_client.cookies['refresh_token'] = str(refresh)
        r = api_client.post(self.URL, {}, format='json')
        assert r.status_code == status.HTTP_200_OK


# ─── S7H.7: PasswordResetRequest composto + soft-cap ──────────────────────

@pytest.mark.django_db
class TestS7H7_PasswordResetCompositeThrottle:
    URL = '/api/v1/accounts/password-reset/'

    def test_soft_cap_blocks_within_1h_same_email(
        self, api_client, regular_user,
    ):
        regular_user.password_reset_last_sent = timezone.now() - timedelta(minutes=10)
        regular_user.save()
        r = api_client.post(self.URL, {'email': regular_user.email}, format='json')
        # Resposta generica (anti-enum) mesmo bloqueado
        assert r.status_code == status.HTTP_200_OK
        assert 'instruções' in r.data.get('message', '')
        # password_reset_token nao foi atualizado
        token_before = regular_user.password_reset_token
        regular_user.refresh_from_db()
        # token nao foi gerado (last_sent ja era recente)
        assert regular_user.password_reset_token == token_before

    def test_first_request_succeeds_and_sets_last_sent(
        self, api_client, regular_user,
    ):
        assert regular_user.password_reset_last_sent is None
        r = api_client.post(self.URL, {'email': regular_user.email}, format='json')
        assert r.status_code == status.HTTP_200_OK
        regular_user.refresh_from_db()
        assert regular_user.password_reset_last_sent is not None
        assert regular_user.password_reset_token is not None

    def test_soft_cap_expires_after_1h(
        self, api_client, regular_user,
    ):
        regular_user.password_reset_last_sent = timezone.now() - timedelta(hours=1, minutes=5)
        regular_user.save()
        old_token = regular_user.password_reset_token
        r = api_client.post(self.URL, {'email': regular_user.email}, format='json')
        assert r.status_code == status.HTTP_200_OK
        regular_user.refresh_from_db()
        # Novo token gerado
        assert regular_user.password_reset_token != old_token

    def test_nonexistent_email_returns_same_safe_response(
        self, api_client, db,
    ):
        r = api_client.post(self.URL, {'email': 'no-such@email.com'}, format='json')
        assert r.status_code == status.HTTP_200_OK
        assert 'instruções' in r.data.get('message', '')

    def test_composite_throttle_blocks_2nd_request_same_email_ip(
        self, api_client, regular_user, user_factory,
    ):
        # 1a request: passa (last_sent fica setado)
        r1 = api_client.post(self.URL, {'email': regular_user.email}, format='json')
        assert r1.status_code == 200
        # 2a request mesmo email+IP: PasswordResetEmailThrottle (1/h) deve bloquear
        r2 = api_client.post(self.URL, {'email': regular_user.email}, format='json')
        assert r2.status_code == status.HTTP_429_TOO_MANY_REQUESTS
