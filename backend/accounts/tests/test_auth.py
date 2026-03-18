import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from unittest.mock import patch
import pyotp

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(
        username='admin',
        email='admin@test.com',
        password='admin_pass_123',
        role='admin',
    )


@pytest.fixture
def regular_user(db):
    return User.objects.create_user(
        username='operator',
        email='operator@test.com',
        password='operator_pass_123',
        role='operator',
    )


@pytest.fixture
def auth_client(api_client, regular_user):
    api_client.force_authenticate(user=regular_user)
    return api_client


# ─── REGISTER ────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestRegister:
    url = '/api/v1/accounts/register/'

    def test_register_success(self, api_client):
        payload = {
            'username': 'newuser',
            'email': 'new@test.com',
            'password': 'secure_pass_123',
            'password_confirm': 'secure_pass_123',
        }
        response = api_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED
        assert User.objects.filter(username='newuser').exists()

    def test_register_duplicate_username(self, api_client, regular_user):
        payload = {
            'username': regular_user.username,
            'email': 'other@test.com',
            'password': 'secure_pass_123',
        }
        response = api_client.post(self.url, payload)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_register_missing_fields(self, api_client):
        response = api_client.post(self.url, {'username': 'onlyname'})
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ─── LOGIN ───────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestLogin:
    url = '/api/v1/accounts/login/'

    def test_login_success(self, api_client, regular_user):
        response = api_client.post(self.url, {
            'username': 'operator',
            'password': 'operator_pass_123',
        })
        assert response.status_code == status.HTTP_200_OK
        assert 'user' in response.data
        # Tokens são enviados via cookies httpOnly
        assert 'access_token' in response.cookies
        assert 'refresh_token' in response.cookies

    def test_login_wrong_password(self, api_client, regular_user):
        response = api_client.post(self.url, {
            'username': 'operator',
            'password': 'wrong_password',
        })
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_login_inactive_user(self, api_client, db):
        User.objects.create_user(
            username='inactive',
            password='pass123',
            is_active=False,
        )
        response = api_client.post(self.url, {
            'username': 'inactive',
            'password': 'pass123',
        })
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_login_requires_2fa(self, api_client, regular_user):
        regular_user.is_2fa_enabled = True
        regular_user.totp_secret = pyotp.random_base32()
        regular_user.save()

        response = api_client.post(self.url, {
            'username': 'operator',
            'password': 'operator_pass_123',
        })
        assert response.status_code == status.HTTP_200_OK
        assert response.data.get('requires_2fa') is True
        assert 'temp_token' in response.data


# ─── 2FA ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestTwoFactor:
    verify_url = '/api/v1/accounts/2fa/verify/'
    setup_url = '/api/v1/accounts/2fa/setup/'

    def test_2fa_verify_success(self, api_client, regular_user):
        secret = pyotp.random_base32()
        regular_user.is_2fa_enabled = True
        regular_user.totp_secret = secret
        regular_user.temp_2fa_token = 'valid_temp_token_abc'
        regular_user.save()

        code = pyotp.TOTP(secret).now()
        response = api_client.post(self.verify_url, {
            'temp_token': 'valid_temp_token_abc',
            'code': code,
        })
        assert response.status_code == status.HTTP_200_OK
        assert 'user' in response.data
        assert 'access_token' in response.cookies

    def test_2fa_verify_invalid_code(self, api_client, regular_user):
        secret = pyotp.random_base32()
        regular_user.is_2fa_enabled = True
        regular_user.totp_secret = secret
        regular_user.temp_2fa_token = 'valid_temp_token_abc'
        regular_user.save()

        response = api_client.post(self.verify_url, {
            'temp_token': 'valid_temp_token_abc',
            'code': '000000',
        })
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_2fa_verify_invalid_token(self, api_client):
        response = api_client.post(self.verify_url, {
            'temp_token': 'nonexistent_token',
            'code': '123456',
        })
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_2fa_setup_enable(self, auth_client):
        response = auth_client.post(self.setup_url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data.get('enabled') is True
        assert 'secret' in response.data
        assert 'qr_code' in response.data

    def test_2fa_setup_disable(self, auth_client, regular_user):
        regular_user.is_2fa_enabled = True
        regular_user.totp_secret = pyotp.random_base32()
        regular_user.save()

        response = auth_client.post(self.setup_url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data.get('enabled') is False


# ─── LOGOUT ──────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestLogout:
    url = '/api/v1/accounts/logout/'

    def test_logout_requires_auth(self, api_client):
        response = api_client.post(self.url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_logout_success(self, auth_client):
        response = auth_client.post(self.url, {'refresh': 'sometoken'})
        assert response.status_code == status.HTTP_200_OK


# ─── CHANGE PASSWORD ─────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestChangePassword:
    url = '/api/v1/accounts/change-password/'

    def test_change_password_success(self, auth_client, regular_user):
        response = auth_client.post(self.url, {
            'old_password': 'operator_pass_123',
            'new_password': 'new_secure_pass_456',
            'new_password_confirm': 'new_secure_pass_456',
        })
        assert response.status_code == status.HTTP_200_OK
        regular_user.refresh_from_db()
        assert regular_user.check_password('new_secure_pass_456')

    def test_change_password_wrong_old(self, auth_client):
        response = auth_client.post(self.url, {
            'old_password': 'wrong_old_pass',
            'new_password': 'new_secure_pass_456',
            'new_password_confirm': 'new_secure_pass_456',
        })
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ─── PASSWORD RESET ──────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestPasswordReset:
    request_url = '/api/v1/accounts/password-reset/'
    confirm_url = '/api/v1/accounts/password-reset/confirm/'

    @patch('accounts.tasks.send_password_reset_email.delay')
    def test_reset_request_existing_email(self, mock_task, api_client, regular_user):
        response = api_client.post(self.request_url, {'email': regular_user.email})
        assert response.status_code == status.HTTP_200_OK
        mock_task.assert_called_once()

    def test_reset_request_nonexistent_email(self, api_client):
        response = api_client.post(self.request_url, {'email': 'ghost@test.com'})
        # Same response to avoid email enumeration
        assert response.status_code == status.HTTP_200_OK

    def test_reset_confirm_success(self, api_client, regular_user):
        from django.utils import timezone
        from datetime import timedelta
        token = 'valid_reset_token_xyz'
        regular_user.password_reset_token = token
        regular_user.password_reset_expires = timezone.now() + timedelta(hours=1)
        regular_user.save()

        response = api_client.post(self.confirm_url, {
            'token': token,
            'new_password': 'brand_new_pass_789',
        })
        assert response.status_code == status.HTTP_200_OK
        regular_user.refresh_from_db()
        assert regular_user.check_password('brand_new_pass_789')
        assert regular_user.password_reset_token is None

    def test_reset_confirm_expired_token(self, api_client, regular_user):
        from django.utils import timezone
        from datetime import timedelta
        regular_user.password_reset_token = 'expired_token'
        regular_user.password_reset_expires = timezone.now() - timedelta(hours=1)
        regular_user.save()

        response = api_client.post(self.confirm_url, {
            'token': 'expired_token',
            'new_password': 'brand_new_pass_789',
        })
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_reset_confirm_invalid_token(self, api_client):
        response = api_client.post(self.confirm_url, {
            'token': 'nonexistent_token',
            'new_password': 'brand_new_pass_789',
        })
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ─── RBAC ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestRBAC:
    users_url = '/api/v1/accounts/users/'

    def test_user_list_admin_only(self, api_client, admin_user):
        api_client.force_authenticate(user=admin_user)
        response = api_client.get(self.users_url)
        assert response.status_code == status.HTTP_200_OK

    def test_user_list_forbidden_for_operator(self, auth_client):
        response = auth_client.get(self.users_url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_user_list_requires_auth(self, api_client):
        response = api_client.get(self.users_url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
