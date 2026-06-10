"""F0: politica de senha e enforcement de 2FA para admins."""
import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.test import override_settings

User = get_user_model()
LOGIN_URL = '/api/v1/accounts/login/'


@pytest.fixture
def api_client():
    from rest_framework.test import APIClient
    return APIClient()


class TestPasswordComplexity:
    def test_rejects_short(self):
        with pytest.raises(ValidationError):
            validate_password('Ab1!short')  # 9 < 12

    def test_rejects_no_uppercase(self):
        with pytest.raises(ValidationError):
            validate_password('semmaiuscula123!')

    def test_rejects_no_digit(self):
        with pytest.raises(ValidationError):
            validate_password('SemNumeroAqui!!!')

    def test_rejects_no_symbol(self):
        with pytest.raises(ValidationError):
            validate_password('SemSimboloAqui123')

    def test_accepts_strong_password(self):
        validate_password('Senha#Forte2026!')  # nao deve levantar


@pytest.mark.django_db
class TestAdmin2FAEnforcement:
    PASSWORD = 'Senha#Forte2026!'

    def _make(self, role):
        return User.objects.create_user(
            username=f'{role}_f0', email=f'{role}_f0@x.com',
            password=self.PASSWORD, role=role,
        )

    def _login(self, api_client, user):
        return api_client.post(
            LOGIN_URL,
            {'username': user.username, 'password': self.PASSWORD},
            format='json',
        )

    def test_admin_without_2fa_gets_flag(self, api_client):
        user = self._make('admin')
        with override_settings(ENFORCE_ADMIN_2FA=True):
            resp = self._login(api_client, user)
        assert resp.status_code == 200
        assert resp.data.get('must_setup_2fa') is True

    def test_non_admin_without_2fa_no_flag(self, api_client):
        user = self._make('operator')
        with override_settings(ENFORCE_ADMIN_2FA=True):
            resp = self._login(api_client, user)
        assert resp.status_code == 200
        assert 'must_setup_2fa' not in resp.data

    def test_admin_no_flag_when_enforcement_off(self, api_client):
        user = self._make('admin')
        with override_settings(ENFORCE_ADMIN_2FA=False):
            resp = self._login(api_client, user)
        assert resp.status_code == 200
        assert 'must_setup_2fa' not in resp.data
