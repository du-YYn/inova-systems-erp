"""F0: gates de seguranca operacional (reset-data e health throttle)."""
import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

from core.views import HealthRateThrottle, health_check

User = get_user_model()
RESET_URL = '/api/v1/core/reset-data/'
HEALTH_URL = '/api/v1/core/health/'


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin_f0', email='admin_f0@x.com',
        password='Senha#Forte2026!', role='admin',
    )


@pytest.fixture
def regular_user(db):
    return User.objects.create_user(
        username='oper_f0', email='oper_f0@x.com',
        password='Senha#Forte2026!', role='operator',
    )


@pytest.mark.django_db
class TestResetDataGate:
    def test_returns_404_when_disabled(self, api_client, admin_user):
        """Em producao (flag off) o endpoint se comporta como inexistente."""
        api_client.force_authenticate(admin_user)
        with override_settings(RESET_DATA_ENABLED=False):
            resp = api_client.post(RESET_URL, {'confirm': 'RESETAR'}, format='json')
        assert resp.status_code == 404

    def test_available_when_enabled(self, api_client, admin_user):
        """Com a flag ligada o fluxo original continua (400 sem confirmacao)."""
        api_client.force_authenticate(admin_user)
        with override_settings(RESET_DATA_ENABLED=True):
            resp = api_client.post(RESET_URL, {'confirm': 'errado'}, format='json')
        assert resp.status_code == 400

    def test_gate_applies_before_permission_payload(self, api_client, regular_user):
        """Nao-admin segue barrado pela permission (403) mesmo com flag off."""
        api_client.force_authenticate(regular_user)
        with override_settings(RESET_DATA_ENABLED=False):
            resp = api_client.post(RESET_URL, {'confirm': 'RESETAR'}, format='json')
        assert resp.status_code == 403


@pytest.mark.django_db
class TestHealthThrottle:
    def test_health_has_rate_limit_class(self):
        """health deixou de ser throttle_classes=[] (era ilimitado)."""
        assert HealthRateThrottle in health_check.cls.throttle_classes
        assert HealthRateThrottle.scope == 'health'

    def test_health_throttles_after_limit(self):
        """61a request anonima no mesmo minuto leva 429 (rate real 60/min).

        DRF le THROTTLE_RATES no import, entao override de settings nao
        muda o rate em runtime; testamos contra o valor real.
        """
        client = APIClient()
        for i in range(60):
            assert client.get(HEALTH_URL).status_code == 200, f'request {i + 1}'
        assert client.get(HEALTH_URL).status_code == 429
