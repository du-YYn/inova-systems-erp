"""F1: tests for POST /api/v1/projects/cronograma/simular/.

Stateless simulation: IsAuthenticated, serializer validates ranges,
returns the GamePlan serialized with ISO dates. No side effects.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()

URL = '/api/v1/projects/cronograma/simular/'

DEFAULT_PAYLOAD = {
    'prazo_total': 45,
    'modo': 'uteis',
    'data_onboarding': '2026-06-10',
    'pct_doc': 15,
    'pct_dev': 50,
    'pct_aud': 8,
    'peso_val': 5,
    'peso_hom': 17,
    'peso_ent': 5,
    'reupd_fds': 0,
    'considerar_carnaval': True,
    'considerar_corpus': True,
}


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def operator_client(api_client, db):
    user = User.objects.create_user(
        username='cron_operator',
        email='cron_operator@test.com',
        password='cron_pass_123!',
        role='operator',
    )
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def viewer_client(db):
    client = APIClient()
    user = User.objects.create_user(
        username='cron_viewer',
        email='cron_viewer@test.com',
        password='cron_pass_123!',
        role='viewer',
    )
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestCronogramaSimularAuth:
    def test_anonymous_rejected(self, api_client):
        response = api_client.post(URL, DEFAULT_PAYLOAD, format='json')
        assert response.status_code in (
            status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN,
        )

    def test_authenticated_allowed(self, operator_client):
        response = operator_client.post(URL, DEFAULT_PAYLOAD, format='json')
        assert response.status_code == status.HTTP_200_OK

    def test_viewer_can_simulate(self, viewer_client):
        # simulação é leitura sem efeito colateral — viewer tem acesso
        response = viewer_client.post(URL, DEFAULT_PAYLOAD, format='json')
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestCronogramaSimularValidation:
    def test_missing_onboarding_rejected(self, operator_client):
        payload = {**DEFAULT_PAYLOAD}
        payload.pop('data_onboarding')
        response = operator_client.post(URL, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.parametrize('field,value', [
        ('prazo_total', 4),
        ('prazo_total', 401),
        ('pct_doc', 41),
        ('pct_dev', 19),
        ('pct_dev', 81),
        ('pct_aud', 31),
        ('peso_val', 0),
        ('peso_hom', 61),
        ('peso_ent', 0),
        ('reupd_fds', 9),
        ('modo', 'mensal'),
    ])
    def test_out_of_range_rejected(self, operator_client, field, value):
        payload = {**DEFAULT_PAYLOAD, field: value}
        response = operator_client.post(URL, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert field in response.json()

    def test_defaults_applied(self, operator_client):
        # only data_onboarding is required — everything else has doc defaults
        response = operator_client.post(
            URL, {'data_onboarding': '2026-06-10'}, format='json'
        )
        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert body['prazo_total'] == 45
        assert body['modo'] == 'uteis'


@pytest.mark.django_db
class TestCronogramaSimularResponse:
    def test_game_plan_shape(self, operator_client):
        response = operator_client.post(URL, DEFAULT_PAYLOAD, format='json')
        body = response.json()
        assert body['entrega'] == '2026-08-13'
        assert body['entrega_base'] == '2026-08-13'
        assert body['total_gap'] == 0
        assert body['capped'] is False
        assert body['avisos'] == []
        assert [f['key'] for f in body['fases']] == [
            'doc', 'val', 'dev', 'aud', 'hom', 'ent',
        ]
        doc = body['fases'][0]
        assert doc['dias'] == 7
        assert doc['inicio'] == '2026-06-11'
        assert doc['fim'] == '2026-06-19'
        assert len(doc['sub_passos']) > 0
        assert doc['sub_passos'][0]['data'] == '2026-06-11'
        assert body['reunioes']['val']['data_natural'] == '2026-06-22'
        assert body['feriados'] == [
            {'data': '2026-07-09', 'nome': 'Revolução Constitucionalista (SP)'},
        ]

    def test_reschedule_meeting(self, operator_client):
        payload = {**DEFAULT_PAYLOAD, 'data_reuniao_validacao': '2026-06-24'}
        response = operator_client.post(URL, payload, format='json')
        body = response.json()
        assert body['total_gap'] == 2
        assert body['entrega'] == '2026-08-17'
        assert body['reunioes']['val']['gap'] == 2
        assert body['reunioes']['val']['remarcada'] is True
        assert len(body['avisos']) == 1

    def test_reupd_warning(self, operator_client):
        payload = {**DEFAULT_PAYLOAD, 'reupd_fds': 8}
        response = operator_client.post(URL, payload, format='json')
        body = response.json()
        assert body['reupd_info']['requested'] == 8
        assert body['reupd_info']['used'] == 2
        assert any('fim de semana' in aviso for aviso in body['avisos'])

    def test_simulation_is_stateless(self, operator_client):
        from core.models import AuditLog
        before = AuditLog.objects.count()
        operator_client.post(URL, DEFAULT_PAYLOAD, format='json')
        assert AuditLog.objects.count() == before
