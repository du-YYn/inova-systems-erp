"""v32 — travas de progressão do funil (fixes #5, #6, #7).

Cobre as correções que destravam a progressão do funil v32
(Prospect.status: new -> ... -> coleta_de_dados -> projeto_fechado ->
em_producao):

FIX #5  ProposalViewSet.send() — (re)enviar proposta NÃO pode rebaixar para
        'proposal' um card já avançado (coleta_de_dados/projeto_fechado/
        em_producao/concluded/disqualified + legados).

FIX #6  Submit do onboarding público avança o card ligado de
        'coleta_de_dados' (e do legado 'data_collection') -> 'projeto_fechado',
        de forma idempotente — sem rebaixar quem já está adiante.

FIX #7  ProspectViewSet.conclude() aceita o status v32 'em_producao' além do
        legado 'production'.
"""
import uuid
from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from sales.models import (
    Customer, Prospect, Proposal, ClientOnboarding,
)

User = get_user_model()

PROPOSALS_URL = '/api/v1/sales/proposals/'
PROSPECTS_URL = '/api/v1/sales/prospects/'
ONBOARDING_PUBLIC_URL = '/api/v1/sales/onboarding/public/'

# CPF/CNPJ com dígitos verificadores válidos (core.validators).
VALID_CNPJ = '11.144.477/0001-67'
VALID_CPF = '111.444.777-35'


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin_fp_v32', email='admin@fpv32.com',
        password='admin_pass_123', role='admin',
    )


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def customer(admin_user):
    return Customer.objects.create(
        company_name='Funil Progress LTDA',
        email='cliente@fpv32.com',
        created_by=admin_user,
    )


@pytest.fixture
def prospect(admin_user, customer):
    return Prospect.objects.create(
        customer=customer,
        company_name='Funil Progress LTDA',
        contact_name='Contato FP',
        contact_email='contato@fpv32.com',
        source='website',
        status='new',
        created_by=admin_user,
    )


def make_proposal(prospect, user, status_='draft'):
    return Proposal.objects.create(
        prospect=prospect,
        number=f'P-{uuid.uuid4().hex[:12]}',
        title='Proposta Progress',
        proposal_type='software_dev',
        billing_type='fixed',
        total_value=10000,
        status=status_,
        valid_until=date.today() + timedelta(days=30),
        created_by=user,
    )


def full_onboarding_payload():
    """Payload completo e válido para submeter o onboarding público."""
    return {
        # empresa
        'company_legal_name': 'Funil Progress LTDA',
        'company_cnpj': VALID_CNPJ,
        'company_street': 'Rua das Flores',
        'company_number': '100',
        'company_complement': 'Sala 1',
        'company_neighborhood': 'Centro',
        'company_city': 'São Paulo',
        'company_state': 'SP',
        'company_cep': '01000-000',
        # representante
        'rep_full_name': 'Maria Representante',
        'rep_marital_status': 'solteiro',
        'rep_profession': 'Empresária',
        'rep_cpf': VALID_CPF,
        'rep_street': 'Av. Central',
        'rep_number': '200',
        'rep_complement': 'Apto 2',
        'rep_neighborhood': 'Jardins',
        'rep_city': 'São Paulo',
        'rep_state': 'SP',
        'rep_cep': '02000-000',
        # financeiro
        'finance_contact_name': 'João Financeiro',
        'finance_contact_phone': '11999990000',
        'finance_contact_email': 'financeiro@fpv32.com',
    }


# ─── FIX #5: send() não rebaixa cards v32 avançados ──────────────────────────

@pytest.mark.django_db
class TestSendDoesNotRegressAdvancedCards:
    def test_send_does_not_regress_coleta_de_dados(
        self, admin_client, prospect, admin_user,
    ):
        """send() em prospect 'coleta_de_dados' NÃO muda o status."""
        prospect.status = 'coleta_de_dados'
        prospect.save(update_fields=['status'])
        proposal = make_proposal(prospect, admin_user, status_='draft')

        r = admin_client.post(f'{PROPOSALS_URL}{proposal.id}/send/')

        assert r.status_code == status.HTTP_200_OK, r.data
        prospect.refresh_from_db()
        assert prospect.status == 'coleta_de_dados'

    @pytest.mark.parametrize('advanced_status', [
        'coleta_de_dados', 'projeto_fechado', 'em_producao',
        'concluded', 'disqualified',
        # legados
        'data_collection', 'won', 'production',
    ])
    def test_send_does_not_regress_any_advanced_status(
        self, admin_client, prospect, admin_user, advanced_status,
    ):
        prospect.status = advanced_status
        prospect.save(update_fields=['status'])
        proposal = make_proposal(prospect, admin_user, status_='draft')

        r = admin_client.post(f'{PROPOSALS_URL}{proposal.id}/send/')

        assert r.status_code == status.HTTP_200_OK, r.data
        prospect.refresh_from_db()
        assert prospect.status == advanced_status, (
            f'send() rebaixou {advanced_status} para {prospect.status}'
        )

    def test_send_still_advances_early_card_to_proposal(
        self, admin_client, prospect, admin_user,
    ):
        """Sanidade: cards ANTES da proposta ainda avançam para 'proposal'."""
        prospect.status = 'meeting_2_done'
        prospect.save(update_fields=['status'])
        proposal = make_proposal(prospect, admin_user, status_='draft')

        r = admin_client.post(f'{PROPOSALS_URL}{proposal.id}/send/')

        assert r.status_code == status.HTTP_200_OK, r.data
        prospect.refresh_from_db()
        assert prospect.status == 'proposal'


# ─── FIX #6: submit do onboarding avança o card ──────────────────────────────

@pytest.mark.django_db
class TestOnboardingSubmitAdvancesProspect:
    def _onboarding_for(self, prospect, customer, user):
        return ClientOnboarding.objects.create(
            prospect=prospect,
            customer=customer,
            created_by=user,
        )

    def test_submit_advances_coleta_de_dados_to_projeto_fechado(
        self, api_client, prospect, customer, admin_user,
    ):
        prospect.status = 'coleta_de_dados'
        prospect.save(update_fields=['status'])
        onboarding = self._onboarding_for(prospect, customer, admin_user)

        r = api_client.post(
            f'{ONBOARDING_PUBLIC_URL}{onboarding.public_token}/',
            full_onboarding_payload(), format='json',
        )

        assert r.status_code == status.HTTP_200_OK, r.data
        onboarding.refresh_from_db()
        assert onboarding.status == 'submitted'
        prospect.refresh_from_db()
        assert prospect.status == 'projeto_fechado'

    def test_submit_advances_legacy_data_collection(
        self, api_client, prospect, customer, admin_user,
    ):
        prospect.status = 'data_collection'
        prospect.save(update_fields=['status'])
        onboarding = self._onboarding_for(prospect, customer, admin_user)

        r = api_client.post(
            f'{ONBOARDING_PUBLIC_URL}{onboarding.public_token}/',
            full_onboarding_payload(), format='json',
        )

        assert r.status_code == status.HTTP_200_OK, r.data
        prospect.refresh_from_db()
        assert prospect.status == 'projeto_fechado'

    def test_submit_does_not_regress_em_producao(
        self, api_client, prospect, customer, admin_user,
    ):
        """Prospect já em 'em_producao' NÃO é rebaixado pelo submit."""
        prospect.status = 'em_producao'
        prospect.save(update_fields=['status'])
        onboarding = self._onboarding_for(prospect, customer, admin_user)

        r = api_client.post(
            f'{ONBOARDING_PUBLIC_URL}{onboarding.public_token}/',
            full_onboarding_payload(), format='json',
        )

        assert r.status_code == status.HTTP_200_OK, r.data
        prospect.refresh_from_db()
        assert prospect.status == 'em_producao'


# ─── FIX #7: conclude() aceita em_producao ───────────────────────────────────

@pytest.mark.django_db
class TestConcludeAcceptsEmProducao:
    def test_conclude_em_producao_succeeds(
        self, admin_client, prospect,
    ):
        prospect.status = 'em_producao'
        prospect.save(update_fields=['status'])

        r = admin_client.post(
            f'{PROSPECTS_URL}{prospect.id}/conclude/',
            {'deactivate_customer': False}, format='json',
        )

        assert r.status_code == status.HTTP_200_OK, r.data
        prospect.refresh_from_db()
        assert prospect.status == 'concluded'

    def test_conclude_legacy_production_still_succeeds(
        self, admin_client, prospect,
    ):
        prospect.status = 'production'
        prospect.save(update_fields=['status'])

        r = admin_client.post(
            f'{PROSPECTS_URL}{prospect.id}/conclude/',
            {'deactivate_customer': False}, format='json',
        )

        assert r.status_code == status.HTTP_200_OK, r.data
        prospect.refresh_from_db()
        assert prospect.status == 'concluded'

    def test_conclude_rejects_non_production_status(
        self, admin_client, prospect,
    ):
        prospect.status = 'proposal'
        prospect.save(update_fields=['status'])

        r = admin_client.post(
            f'{PROSPECTS_URL}{prospect.id}/conclude/',
            {'deactivate_customer': False}, format='json',
        )

        assert r.status_code == status.HTTP_400_BAD_REQUEST
        prospect.refresh_from_db()
        assert prospect.status == 'proposal'
