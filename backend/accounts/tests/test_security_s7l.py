"""Testes Sprint S7-L — findings residuais.

Cobre:
- S7L.1: ComplexityValidator (min 12 + 1 upper + 1 digit + 1 symbol)
- S7L.2: LoginView response minimal (id/username/role, sem email/phone/avatar)
- S7L.3: system-info nao retorna `version` para nao-admin
- S7L.4: reset_data retorna 404 em DEBUG=False
"""
import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from rest_framework import status

from accounts.validators import ComplexityValidator

User = get_user_model()


# ─── S7L.1: ComplexityValidator ────────────────────────────────────────

class TestComplexityValidator:
    """Senha precisa de pelo menos 1 maiuscula + 1 digito + 1 simbolo."""

    def setup_method(self):
        self.v = ComplexityValidator()

    def test_rejects_no_uppercase(self):
        with pytest.raises(ValidationError):
            self.v.validate('senha123!@#')

    def test_rejects_no_digit(self):
        with pytest.raises(ValidationError):
            self.v.validate('SenhaSemDigito!')

    def test_rejects_no_symbol(self):
        with pytest.raises(ValidationError):
            self.v.validate('Senha123456')

    def test_accepts_strong_password(self):
        # min 12 chars + upper + digit + symbol
        self.v.validate('SenhaForte123!')

    def test_rejects_weak_dictionary_like(self):
        """Senhas dict-attack viaveis (`senha1234`, `inova2026`) devem falhar."""
        for weak in ('senha1234', 'inova2026', 'admin1234'):
            with pytest.raises(ValidationError):
                self.v.validate(weak)

    def test_accepts_long_with_classes(self):
        self.v.validate('M1nhaSenh@SuperLonga')


# ─── S7L.2: LoginView response minimal ───────────────────────────────

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username='s7l_user', email='s7l@user.com',
        password='SenhaFort3!@', role='operator',
        first_name='Nome', last_name='Sobrenome', phone='+5511999999999',
    )


@pytest.mark.django_db
class TestLoginResponseMinimal:
    """Login response nao deve vazar PII (email/phone/avatar/first_name)."""

    def test_login_response_excludes_pii(self, api_client, user):
        resp = api_client.post('/api/v1/accounts/login/', {
            'username': 's7l_user', 'password': 'SenhaFort3!@',
        }, format='json')
        assert resp.status_code == status.HTTP_200_OK, resp.content
        body = resp.json()
        assert 'user' in body
        u = body['user']
        # Permitido
        assert 'id' in u
        assert 'username' in u
        assert 'role' in u
        # PII NAO pode estar presente
        assert 'email' not in u, 'email PII vazou na response de login'
        assert 'phone' not in u, 'phone PII vazou na response de login'
        assert 'avatar' not in u, 'avatar vazou na response de login'
        assert 'first_name' not in u, 'first_name vazou na response de login'
        assert 'last_name' not in u, 'last_name vazou na response de login'


# ─── S7L.3: system-info sem version para nao-admin ──────────────────

@pytest.mark.django_db
class TestSystemInfoVersionGate:
    """system-info nao deve retornar version para viewer/operator/manager."""

    def test_viewer_does_not_see_version(self, api_client, db):
        viewer = User.objects.create_user(
            username='s7l_viewer', email='s7l@viewer.com',
            password='SenhaFort3!@', role='viewer',
        )
        api_client.force_authenticate(user=viewer)
        resp = api_client.get('/api/v1/core/system-info/')
        assert resp.status_code == status.HTTP_200_OK
        assert 'version' not in resp.json()

    def test_admin_sees_version(self, api_client, db):
        admin = User.objects.create_user(
            username='s7l_admin', email='s7l@admin.com',
            password='SenhaFort3!@', role='admin',
        )
        api_client.force_authenticate(user=admin)
        resp = api_client.get('/api/v1/core/system-info/')
        assert resp.status_code == status.HTTP_200_OK
        assert 'version' in resp.json()


# ─── S7L.4: reset_data 404 em DEBUG=False ───────────────────────────

@pytest.mark.django_db
class TestResetDataDebugOnly:
    """reset_data deve ser 404 em prod (DEBUG=False)."""

    def test_reset_data_returns_404_in_prod(self, api_client, db, settings):
        settings.DEBUG = False
        admin = User.objects.create_user(
            username='s7l_admin2', email='s7l@admin2.com',
            password='SenhaFort3!@', role='admin',
        )
        api_client.force_authenticate(user=admin)
        resp = api_client.post('/api/v1/core/reset-data/', {'confirm': 'RESETAR'}, format='json')
        assert resp.status_code == status.HTTP_404_NOT_FOUND
