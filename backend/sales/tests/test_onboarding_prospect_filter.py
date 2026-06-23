"""Bug C: o card de onboarding (OnboardingLinkSection) precisa hidratar o estado
"Preenchido" pelo prospect ao montar, sem depender do clique em "Gerar Cadastro".

Para isso o ClientOnboardingViewSet precisa aceitar o filtro ?prospect=<id>,
devolvendo apenas o onboarding daquele lead (e não todos). Sem o filtro o
frontend não tem como buscar o estado do onboarding no load do card.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from sales.models import Prospect, ClientOnboarding

User = get_user_model()

ONBOARDINGS_URL = '/api/v1/sales/onboardings/'


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def manager_user(db):
    return User.objects.create_user(
        username='manager_onb_filter',
        email='manager_onb_filter@test.com',
        password='manager_pass_123',
        role='manager',
        sectors=['comercial'],
    )


@pytest.fixture
def manager_client(api_client, manager_user):
    api_client.force_authenticate(user=manager_user)
    return api_client


def _make_prospect(user, company_name):
    return Prospect.objects.create(
        company_name=company_name,
        contact_name='Contato',
        contact_email='contato@test.com',
        source='website',
        status='qualified',
        created_by=user,
    )


def _results(response):
    data = response.data
    if isinstance(data, dict) and 'results' in data:
        return data['results']
    return data


@pytest.mark.django_db
class TestClientOnboardingProspectFilter:
    def test_filter_returns_only_that_prospects_onboarding(self, manager_client, manager_user):
        p1 = _make_prospect(manager_user, 'Lead Um')
        p2 = _make_prospect(manager_user, 'Lead Dois')
        onb1 = ClientOnboarding.objects.create(prospect=p1, created_by=manager_user)
        ClientOnboarding.objects.create(prospect=p2, created_by=manager_user)

        response = manager_client.get(ONBOARDINGS_URL, {'prospect': p1.id})

        assert response.status_code == 200
        ids = [item['id'] for item in _results(response)]
        assert ids == [onb1.id], (
            f'Esperava apenas o onboarding do prospect {p1.id} ({onb1.id}), '
            f'mas o filtro ?prospect retornou {ids}'
        )

    def test_filter_with_no_onboarding_returns_empty(self, manager_client, manager_user):
        p1 = _make_prospect(manager_user, 'Lead Sem Cadastro')
        # Onboarding de outro prospect não deve vazar para a consulta filtrada.
        other = _make_prospect(manager_user, 'Outro Lead')
        ClientOnboarding.objects.create(prospect=other, created_by=manager_user)

        response = manager_client.get(ONBOARDINGS_URL, {'prospect': p1.id})

        assert response.status_code == 200
        assert _results(response) == []
