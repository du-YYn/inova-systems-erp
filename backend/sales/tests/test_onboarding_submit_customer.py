"""Bug B: o submit do onboarding precisa garantir um Customer vinculado.

Quando o lead chega em "Coleta de Dados" SEM passar pela aprovacao da proposta
(ex.: movido manualmente no Kanban), nao existe Customer. O gatilho do Juridico
(juridico/signals.py) exige Customer, entao a Coleta de Dados preenchida nao
abria o LegalCase de contrato. _sync_customer passa a criar/deduplicar o
Customer no submit, com dedup por email -> razao social (espelha a aprovacao da
proposta).

Tambem cobre o diagnostico do silent-skip: _advance_prospect_on_submit passa a
logar um warning quando o submit chega com o card num status ANTERIOR a Coleta
de Dados (nao avancado para projeto_fechado).
"""
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from sales.models import Customer, Prospect, ClientOnboarding
from sales.views_public import ClientOnboardingPublicView

User = get_user_model()

ONBOARDING_PUBLIC_URL = '/api/v1/sales/onboarding/public/'
VALID_CNPJ = '11.144.477/0001-67'
VALID_CPF = '111.444.777-35'


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def seller(db):
    return User.objects.create_user(
        username='seller_bugb', email='seller_bugb@test.com',
        password='seller_pass_123', role='manager', sectors=['comercial'],
    )


def _prospect_without_customer(seller, **kwargs):
    defaults = dict(
        company_name='Lead Sem Customer',
        contact_name='Contato Lead',
        contact_email='lead_sem_customer@test.com',
        contact_phone='11999990000',
        source='website',
        status='coleta_de_dados',
        created_by=seller,
    )
    defaults.update(kwargs)
    return Prospect.objects.create(**defaults)


def _full_payload():
    """Payload completo e valido para submeter o onboarding publico."""
    return {
        'company_legal_name': 'Lead Sem Customer LTDA',
        'company_cnpj': VALID_CNPJ,
        'company_street': 'Rua das Flores',
        'company_number': '100',
        'company_complement': 'Sala 1',
        'company_neighborhood': 'Centro',
        'company_city': 'Sao Paulo',
        'company_state': 'SP',
        'company_cep': '01000-000',
        'rep_full_name': 'Maria Representante',
        'rep_marital_status': 'solteiro',
        'rep_profession': 'Empresaria',
        'rep_cpf': VALID_CPF,
        'rep_street': 'Av. Central',
        'rep_number': '200',
        'rep_complement': 'Apto 2',
        'rep_neighborhood': 'Jardins',
        'rep_city': 'Sao Paulo',
        'rep_state': 'SP',
        'rep_cep': '02000-000',
        'finance_contact_name': 'Joao Financeiro',
        'finance_contact_phone': '11999990000',
        'finance_contact_email': 'financeiro@test.com',
    }


@pytest.mark.django_db
class TestOnboardingSubmitCreatesCustomer:
    def test_submit_creates_and_links_customer_when_absent(self, api_client, seller):
        prospect = _prospect_without_customer(seller)
        onboarding = ClientOnboarding.objects.create(prospect=prospect, created_by=seller)
        assert prospect.customer_id is None

        r = api_client.post(
            f'{ONBOARDING_PUBLIC_URL}{onboarding.public_token}/',
            _full_payload(), format='json',
        )

        assert r.status_code == 200, r.content
        prospect.refresh_from_db()
        onboarding.refresh_from_db()
        assert prospect.customer_id is not None, 'submit deveria criar/vincular Customer'
        assert onboarding.customer_id == prospect.customer_id
        customer = prospect.customer
        assert customer.company_name == onboarding.company_legal_name
        assert customer.document == onboarding.company_cnpj

    def test_submit_reuses_existing_customer_by_email(self, api_client, seller):
        existing = Customer.objects.create(
            company_name='Cliente Existente',
            email='lead_sem_customer@test.com',  # mesmo email do prospect
            created_by=seller,
        )
        prospect = _prospect_without_customer(seller)
        onboarding = ClientOnboarding.objects.create(prospect=prospect, created_by=seller)

        r = api_client.post(
            f'{ONBOARDING_PUBLIC_URL}{onboarding.public_token}/',
            _full_payload(), format='json',
        )

        assert r.status_code == 200, r.content
        assert Customer.objects.count() == 1, 'nao deveria criar Customer duplicado'
        prospect.refresh_from_db()
        assert prospect.customer_id == existing.id


@pytest.mark.django_db
class TestAdvanceLogsOnUnexpectedStatus:
    def test_advance_warns_when_status_before_coleta(self, seller):
        # 'proposal' nao esta nem em PENDING nem em ADVANCED_FUNNEL_STATUSES.
        prospect = _prospect_without_customer(seller, status='proposal')
        onboarding = ClientOnboarding.objects.create(prospect=prospect, created_by=seller)

        with patch('sales.views_public.logger') as mock_logger:
            ClientOnboardingPublicView._advance_prospect_on_submit(onboarding)

        prospect.refresh_from_db()
        assert prospect.status == 'proposal', 'nao deveria avancar de status anterior a coleta'
        mock_logger.warning.assert_called_once()
        # o prospect.id deve aparecer nos args do warning (diagnostico)
        assert prospect.id in mock_logger.warning.call_args.args

    def test_advance_silent_for_already_advanced_status(self, seller):
        # projeto_fechado ja e terminal/avancado -> skip legitimo, sem warning.
        prospect = _prospect_without_customer(seller, status='projeto_fechado')
        onboarding = ClientOnboarding.objects.create(prospect=prospect, created_by=seller)

        with patch('sales.views_public.logger') as mock_logger:
            ClientOnboardingPublicView._advance_prospect_on_submit(onboarding)

        mock_logger.warning.assert_not_called()
