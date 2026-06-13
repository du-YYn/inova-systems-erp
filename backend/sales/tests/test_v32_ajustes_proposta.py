"""v32 ajustes (doc processo-v32/09-ajustes-validacao.md §04) — fluxo da proposta.

Cobre:
01° project_type derivado da forma de pagamento (one_time->fechado /
    recurring->recorrente) ao aprovar a proposta.
02° Aprovar a proposta MOVE o card do prospect para a Coleta de Dados
    (status novo `coleta_de_dados`). O fechamento (won) NÃO é automatizado.
03° Status novos aditivos do funil (coleta_de_dados / projeto_fechado /
    em_producao) aceitos pelo serializer (legados mantidos).
04° Cobrança em dobro: o caminho legado de recebíveis (won) é DEDUPLICADO
    quando existe ProposalPaymentPlan (o pré-cadastro F4 é a fonte da verdade).
    Numeração REC robusta via PostgreSQL sequence (sem colisão -> 500).
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from finance.models import Invoice
from finance.services import precadastrar_invoice_da_proposta
from sales.models import (
    Customer, Prospect, Proposal, ProposalPaymentPlan,
)

User = get_user_model()

PROPOSALS_URL = '/api/v1/sales/proposals/'


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin_v32aj', email='admin@v32aj.com',
        password='admin_pass_123', role='admin',
    )


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def customer(admin_user):
    return Customer.objects.create(
        company_name='Ajustes V32 LTDA',
        email='cliente@v32aj.com',
        created_by=admin_user,
    )


@pytest.fixture
def prospect(admin_user, customer):
    return Prospect.objects.create(
        customer=customer,
        company_name='Ajustes V32 LTDA',
        contact_name='Contato V32',
        contact_email='contato@v32aj.com',
        source='website',
        status='proposal',
        created_by=admin_user,
    )


def make_proposal(prospect, user, plan_type=None, status='sent', **plan_kwargs):
    import uuid
    proposal = Proposal.objects.create(
        prospect=prospect,
        number=f'P-{uuid.uuid4().hex[:12]}',  # <= 20 chars (Proposal.number)
        title='Proposta Ajustes',
        proposal_type='software_dev',
        billing_type='fixed',
        total_value=Decimal('10000'),
        status=status,
        valid_until=date.today() + timedelta(days=30),
        created_by=user,
    )
    if plan_type is not None:
        defaults = dict(
            proposal=proposal,
            plan_type=plan_type,
            one_time_amount=Decimal('6000'),
            one_time_method='pix',
            one_time_installments=1,
            one_time_first_due=date(2026, 7, 10),
            recurring_amount=Decimal('1500'),
            recurring_method='boleto',
            recurring_duration_months=3,
            recurring_first_due=date(2026, 8, 5),
        )
        defaults.update(plan_kwargs)
        ProposalPaymentPlan.objects.create(**defaults)
    return proposal


# ─── 01° + 02° Aprovar deriva project_type e move o card ─────────────────────

@pytest.mark.django_db
class TestApproveDerivesTypeAndMovesCard:
    def test_one_time_plan_sets_project_type_fechado(
        self, admin_client, prospect, admin_user,
    ):
        proposal = make_proposal(
            prospect, admin_user, plan_type='one_time',
            recurring_amount=Decimal('0'),
        )
        r = admin_client.post(f'{PROPOSALS_URL}{proposal.id}/approve/')
        assert r.status_code == status.HTTP_200_OK, r.data
        prospect.refresh_from_db()
        assert prospect.project_type == 'fechado'

    def test_recurring_only_plan_sets_project_type_recorrente(
        self, admin_client, prospect, admin_user,
    ):
        proposal = make_proposal(
            prospect, admin_user, plan_type='recurring_only',
            one_time_amount=Decimal('0'),
        )
        r = admin_client.post(f'{PROPOSALS_URL}{proposal.id}/approve/')
        assert r.status_code == status.HTTP_200_OK, r.data
        prospect.refresh_from_db()
        assert prospect.project_type == 'recorrente'

    def test_setup_plus_recurring_is_recorrente(
        self, admin_client, prospect, admin_user,
    ):
        proposal = make_proposal(
            prospect, admin_user, plan_type='setup_plus_recurring',
        )
        admin_client.post(f'{PROPOSALS_URL}{proposal.id}/approve/')
        prospect.refresh_from_db()
        assert prospect.project_type == 'recorrente'

    def test_approve_moves_card_to_coleta_de_dados(
        self, admin_client, prospect, admin_user,
    ):
        proposal = make_proposal(prospect, admin_user, plan_type='one_time')
        assert prospect.status == 'proposal'
        admin_client.post(f'{PROPOSALS_URL}{proposal.id}/approve/')
        prospect.refresh_from_db()
        assert prospect.status == 'coleta_de_dados'

    def test_approve_does_not_close_won(
        self, admin_client, prospect, admin_user,
    ):
        """Fechamento (won) NÃO é automatizado no aceite (John 2026-06-11)."""
        proposal = make_proposal(prospect, admin_user, plan_type='one_time')
        admin_client.post(f'{PROPOSALS_URL}{proposal.id}/approve/')
        prospect.refresh_from_db()
        assert prospect.status != 'won'
        assert prospect.status != 'projeto_fechado'

    def test_approve_without_plan_does_not_set_type_but_still_moves(
        self, admin_client, prospect, admin_user,
    ):
        proposal = make_proposal(prospect, admin_user, plan_type=None)
        admin_client.post(f'{PROPOSALS_URL}{proposal.id}/approve/')
        prospect.refresh_from_db()
        assert prospect.project_type == ''  # sem plano -> não deriva
        assert prospect.status == 'coleta_de_dados'  # mas o card move

    def test_approve_does_not_demote_already_advanced_card(
        self, admin_client, admin_user, customer,
    ):
        prospect = Prospect.objects.create(
            customer=customer, company_name='Avancado LTDA',
            contact_name='C', source='website', status='won',
            created_by=admin_user,
        )
        proposal = make_proposal(prospect, admin_user, plan_type='one_time')
        admin_client.post(f'{PROPOSALS_URL}{proposal.id}/approve/')
        prospect.refresh_from_db()
        # won já é fechamento — não rebaixar para coleta_de_dados
        assert prospect.status == 'won'


# ─── 03° Status novos aceitos pelo serializer (aditivos) ─────────────────────

@pytest.mark.django_db
class TestNewFunnelStatusesAccepted:
    @pytest.mark.parametrize('new_status', [
        'coleta_de_dados', 'projeto_fechado', 'em_producao',
    ])
    def test_patch_to_new_status(self, admin_client, prospect, new_status):
        r = admin_client.patch(
            f'/api/v1/sales/prospects/{prospect.id}/',
            {'status': new_status}, format='json',
        )
        assert r.status_code == status.HTTP_200_OK, r.data
        prospect.refresh_from_db()
        assert prospect.status == new_status

    @pytest.mark.parametrize('legacy', ['won', 'production', 'concluded'])
    def test_legacy_statuses_still_valid(
        self, admin_client, admin_user, customer, legacy,
    ):
        # prospect fresco por status legado (evita o guard de transição v32
        # que encadeamentos won->production->data_collection disparam).
        p = Prospect.objects.create(
            customer=customer, company_name=f'Legacy {legacy}',
            contact_name='C', source='website', status='proposal',
            created_by=admin_user,
        )
        r = admin_client.patch(
            f'/api/v1/sales/prospects/{p.id}/',
            {'status': legacy}, format='json',
        )
        assert r.status_code == status.HTTP_200_OK, (legacy, r.data)


# ─── 04° Cobrança em dobro: dedupe legado vs pré-cadastro F4 ──────────────────

@pytest.mark.django_db
class TestDoubleChargeDedupe:
    def _close_won_via_patch(self, client, prospect):
        return client.patch(
            f'/api/v1/sales/prospects/{prospect.id}/',
            {'status': 'won'}, format='json',
        )

    def test_legacy_receivables_skipped_when_plan_exists(
        self, admin_client, prospect, admin_user,
    ):
        """Com ProposalPaymentPlan, won NÃO gera recebíveis legados (dedupe).

        O pré-cadastro F4 (a partir do plano) é a fonte; o caminho legado
        não pode cobrar em paralelo.
        """
        make_proposal(prospect, admin_user, plan_type='one_time',
                      status='approved', recurring_amount=Decimal('0'))
        prospect.payment_type = 'one_time'
        prospect.proposal_value = Decimal('6000')
        prospect.save(update_fields=['payment_type', 'proposal_value'])

        r = self._close_won_via_patch(admin_client, prospect)
        assert r.status_code == status.HTTP_200_OK, r.data
        # Nenhum recebível legado criado (dedupe)
        assert Invoice.objects.filter(invoice_type='receivable').count() == 0

    def test_legacy_receivables_still_run_without_plan(
        self, admin_client, admin_user, customer,
    ):
        """Lead antigo sem plano estruturado: caminho legado ainda gera."""
        prospect = Prospect.objects.create(
            customer=customer, company_name='Legado Sem Plano LTDA',
            contact_name='C', source='website', status='proposal',
            payment_type='one_time', proposal_value=Decimal('5000'),
            created_by=admin_user,
        )
        r = self._close_won_via_patch(admin_client, prospect)
        assert r.status_code == status.HTTP_200_OK, r.data
        assert Invoice.objects.filter(invoice_type='receivable').count() == 1

    def test_f4_precadastro_only_source_when_plan_exists(
        self, admin_client, prospect, admin_user, customer,
    ):
        """Fluxo completo: won (sem legado) + pré-cadastro F4 = SEM duplicação."""
        make_proposal(prospect, admin_user, plan_type='one_time',
                      status='approved', recurring_amount=Decimal('0'),
                      one_time_amount=Decimal('6000'),
                      one_time_installments=1)
        prospect.payment_type = 'one_time'
        prospect.proposal_value = Decimal('6000')
        prospect.save(update_fields=['payment_type', 'proposal_value'])

        # 1) Fecha o lead (won) — legado pulado pelo dedupe
        self._close_won_via_patch(admin_client, prospect)
        assert Invoice.objects.filter(invoice_type='receivable').count() == 0

        # 2) Pré-cadastro F4 (fonte única) — 1 parcela one_time
        created = precadastrar_invoice_da_proposta(prospect)
        assert len(created) == 1
        assert Invoice.objects.filter(invoice_type='receivable').count() == 1

    def test_rec_numbering_uses_sequence_no_collision(
        self, admin_client, admin_user, customer,
    ):
        """Recebíveis legados de leads distintos não colidem na numeração REC."""
        numbers = []
        for i in range(3):
            p = Prospect.objects.create(
                customer=customer, company_name=f'Seq Co {i}',
                contact_name='C', source='website', status='proposal',
                payment_type='one_time', proposal_value=Decimal('1000'),
                created_by=admin_user,
            )
            self._close_won_via_patch(admin_client, p)
        numbers = list(
            Invoice.objects.filter(invoice_type='receivable')
            .values_list('number', flat=True)
        )
        assert len(numbers) == 3
        assert len(set(numbers)) == 3  # todos únicos
        assert all(n.startswith('REC-') for n in numbers)
