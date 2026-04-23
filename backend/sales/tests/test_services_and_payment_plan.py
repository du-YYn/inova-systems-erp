"""Testes do catálogo de serviços + plano de pagamento de proposta/contrato.

Cobre:
- ServiceViewSet: CRUD, permissão admin-only, soft delete, filtros
- ProposalSerializer write-nested: service_ids + payment_plan
- ContractSerializer write-nested: mesmo
- convert_to_contract copiando services e payment_plan
- _sync_*_services com transaction.atomic
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone
from datetime import timedelta

from sales.models import (
    Customer, Prospect, Proposal, Contract,
    Service, ProposalService, ProposalPaymentPlan,
    ContractService, ContractPaymentPlan,
)

User = get_user_model()


# ─── FIXTURES ────────────────────────────────────────────────────────────────

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin_cat', email='admin@cat.com',
        password='admin_pass', role='admin',
    )


@pytest.fixture
def operator_user(db):
    return User.objects.create_user(
        username='op_cat', email='op@cat.com',
        password='op_pass', role='operator',
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username='view_cat', email='view@cat.com',
        password='view_pass', role='viewer',
    )


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def operator_client(api_client, operator_user):
    api_client.force_authenticate(user=operator_user)
    return api_client


@pytest.fixture
def viewer_client(api_client, viewer_user):
    api_client.force_authenticate(user=viewer_user)
    return api_client


@pytest.fixture
def service(db):
    return Service.objects.create(
        code='test_dev', name='Test Development',
        default_recurrence='one_time', is_active=True, display_order=1,
    )


@pytest.fixture
def inactive_service(db):
    return Service.objects.create(
        code='legacy', name='Legacy', is_active=False, display_order=99,
    )


@pytest.fixture
def customer(db, admin_user):
    return Customer.objects.create(
        company_name='Cat ACME', customer_type='PJ',
        email='cat@acme.com', created_by=admin_user,
    )


@pytest.fixture
def prospect(db, admin_user):
    return Prospect.objects.create(
        company_name='Cat Prospect', contact_name='John',
        contact_email='j@p.com', contact_phone='1234567',
        source='website', status='proposal', created_by=admin_user,
    )


@pytest.fixture
def proposal(db, admin_user, customer):
    return Proposal.objects.create(
        customer=customer, number='PROP-CAT-001',
        title='Test Proposal', proposal_type='software_dev',
        billing_type='fixed', total_value=10000,
        valid_until=timezone.now().date() + timedelta(days=30),
        status='approved', created_by=admin_user,
    )


# ─── SERVICE CATALOG ─────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestServiceViewSet:
    url = '/api/v1/sales/services/'

    def test_list_authenticated_users(self, operator_client, service):
        response = operator_client.get(self.url)
        assert response.status_code == status.HTTP_200_OK

    def test_list_requires_auth(self, api_client, service):
        response = api_client.get(self.url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_hides_inactive_by_default(self, admin_client, service, inactive_service):
        response = admin_client.get(self.url)
        codes = [s['code'] for s in response.data.get('results', response.data)]
        assert 'test_dev' in codes
        assert 'legacy' not in codes

    def test_list_include_inactive(self, admin_client, service, inactive_service):
        response = admin_client.get(self.url + '?include_inactive=1')
        codes = [s['code'] for s in response.data.get('results', response.data)]
        assert 'legacy' in codes

    def test_list_search_by_name(self, admin_client, service):
        Service.objects.create(code='other', name='Unrelated')
        response = admin_client.get(self.url + '?search=Development')
        names = [s['name'] for s in response.data.get('results', response.data)]
        assert 'Test Development' in names
        assert 'Unrelated' not in names

    def test_admin_can_create(self, admin_client):
        response = admin_client.post(self.url, {
            'code': 'new_svc', 'name': 'New Service',
            'default_recurrence': 'monthly',
        }, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert Service.objects.filter(code='new_svc').exists()

    def test_operator_cannot_create(self, operator_client):
        response = operator_client.post(self.url, {
            'code': 'new_svc', 'name': 'New Service',
        }, format='json')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_viewer_cannot_create(self, viewer_client):
        response = viewer_client.post(self.url, {
            'code': 'new_svc', 'name': 'New Service',
        }, format='json')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_can_update(self, admin_client, service):
        response = admin_client.patch(
            f'{self.url}{service.id}/', {'name': 'Updated'}, format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        service.refresh_from_db()
        assert service.name == 'Updated'

    def test_operator_cannot_update(self, operator_client, service):
        response = operator_client.patch(
            f'{self.url}{service.id}/', {'name': 'Hacked'}, format='json',
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_delete_unused_hard_deletes(self, admin_client, service):
        response = admin_client.delete(f'{self.url}{service.id}/')
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Service.objects.filter(id=service.id).exists()

    def test_delete_in_use_soft_deletes(self, admin_client, service, proposal):
        ProposalService.objects.create(proposal=proposal, service=service)
        response = admin_client.delete(f'{self.url}{service.id}/')
        assert response.status_code == status.HTTP_200_OK
        service.refresh_from_db()
        assert service.is_active is False
        assert Service.objects.filter(id=service.id).exists()


# ─── PROPOSAL WITH SERVICES + PAYMENT PLAN ───────────────────────────────────

@pytest.mark.django_db
class TestProposalNested:
    url = '/api/v1/sales/proposals/'

    def test_create_with_services_and_plan(self, admin_client, prospect, service):
        svc2 = Service.objects.create(code='svc2', name='SVC 2')
        payload = {
            'prospect': prospect.id,
            'title': 'New Proposal', 'proposal_type': 'software_dev',
            'billing_type': 'fixed', 'total_value': '15000',
            'valid_until': (timezone.now().date() + timedelta(days=30)).isoformat(),
            'service_ids': [service.id, svc2.id],
            'payment_plan': {
                'plan_type': 'setup_plus_recurring',
                'one_time_amount': '5000', 'one_time_method': 'pix',
                'one_time_installments': 1,
                'recurring_amount': '1000', 'recurring_method': 'boleto',
                'recurring_day_of_month': 10,
                'recurring_duration_months': 10,
            },
        }
        response = admin_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED, response.data
        proposal_id = response.data['id']
        prop = Proposal.objects.get(id=proposal_id)
        assert prop.service_items.count() == 2
        assert hasattr(prop, 'payment_plan')
        assert prop.payment_plan.plan_type == 'setup_plus_recurring'
        assert str(prop.payment_plan.one_time_amount) == '5000.00'

    def test_update_syncs_services_atomically(self, admin_client, proposal, service):
        ProposalService.objects.create(proposal=proposal, service=service)
        svc_new = Service.objects.create(code='new_svc2', name='New 2')
        response = admin_client.patch(
            f'{self.url}{proposal.id}/',
            {'service_ids': [svc_new.id]}, format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        # Sync: antigo deletado, novo adicionado
        codes = [si.service.code for si in proposal.service_items.all()]
        assert codes == ['new_svc2']

    def test_update_with_nonexistent_service_id_ignored(self, admin_client, proposal):
        # Service.DoesNotExist narrow — ignora o id inválido, não quebra
        response = admin_client.patch(
            f'{self.url}{proposal.id}/',
            {'service_ids': [99999]}, format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert proposal.service_items.count() == 0

    def test_update_payment_plan(self, admin_client, proposal):
        response = admin_client.patch(
            f'{self.url}{proposal.id}/',
            {'payment_plan': {
                'plan_type': 'one_time',
                'one_time_amount': '10000',
                'one_time_method': 'pix',
                'one_time_installments': 1,
            }},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        proposal.refresh_from_db()
        assert proposal.payment_plan.plan_type == 'one_time'


# ─── CONVERT TO CONTRACT ──────────────────────────────────────────────────────

@pytest.mark.django_db
class TestConvertToContract:
    def test_convert_copies_services_and_plan(self, admin_client, proposal, service):
        # Setup: proposta aprovada com 1 serviço + payment plan
        ProposalService.objects.create(
            proposal=proposal, service=service, notes='kickoff', display_order=0,
        )
        ProposalPaymentPlan.objects.create(
            proposal=proposal, plan_type='setup_plus_recurring',
            one_time_amount=2000, recurring_amount=500,
            recurring_duration_months=6,
        )

        response = admin_client.post(
            f'/api/v1/sales/proposals/{proposal.id}/convert_to_contract/',
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        contract_id = response.data['id']
        contract = Contract.objects.get(id=contract_id)

        # Services copiados
        assert contract.service_items.count() == 1
        cs = contract.service_items.first()
        assert cs.service == service
        assert cs.notes == 'kickoff'

        # Payment plan copiado
        assert hasattr(contract, 'payment_plan')
        assert contract.payment_plan.plan_type == 'setup_plus_recurring'
        assert str(contract.payment_plan.one_time_amount) == '2000.00'
        assert contract.payment_plan.recurring_duration_months == 6

    def test_convert_without_plan_succeeds(self, admin_client, proposal):
        # Proposta sem payment_plan — convert deve rodar normalmente
        response = admin_client.post(
            f'/api/v1/sales/proposals/{proposal.id}/convert_to_contract/',
        )
        assert response.status_code == status.HTTP_201_CREATED


# ─── CONTRACT WITH SERVICES + PAYMENT PLAN ───────────────────────────────────

@pytest.mark.django_db
class TestContractNested:
    def test_patch_contract_services_and_plan(self, admin_client, admin_user, customer, service):
        contract = Contract.objects.create(
            customer=customer, number='CTR-NEST-001',
            title='Test', contract_type='software_dev', billing_type='fixed',
            start_date=timezone.now().date(), status='pending_signature',
            created_by=admin_user,
        )
        response = admin_client.patch(
            f'/api/v1/sales/contracts/{contract.id}/',
            {
                'service_ids': [service.id],
                'payment_plan': {
                    'plan_type': 'recurring_only',
                    'recurring_amount': '800',
                    'recurring_method': 'pix',
                    'recurring_duration_months': 12,
                },
            },
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        contract.refresh_from_db()
        assert contract.service_items.count() == 1
        assert contract.payment_plan.plan_type == 'recurring_only'


# ─── MODEL __str__ ────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestModelStr:
    """Cobre __str__ dos 5 models novos para elevar cobertura."""

    def test_service_str(self, service):
        assert str(service) == 'Test Development'

    def test_proposal_service_str(self, proposal, service):
        ps = ProposalService.objects.create(proposal=proposal, service=service)
        assert 'PROP-CAT-001' in str(ps) and 'Test Development' in str(ps)

    def test_proposal_payment_plan_str(self, proposal):
        pp = ProposalPaymentPlan.objects.create(proposal=proposal, plan_type='one_time')
        assert 'PROP-CAT-001' in str(pp)

    def test_contract_service_str(self, admin_user, customer, service):
        contract = Contract.objects.create(
            customer=customer, number='CTR-STR-001', title='X',
            contract_type='software_dev', billing_type='fixed',
            start_date=timezone.now().date(), created_by=admin_user,
        )
        cs = ContractService.objects.create(contract=contract, service=service)
        assert 'CTR-STR-001' in str(cs) and 'Test Development' in str(cs)

    def test_contract_payment_plan_str(self, admin_user, customer):
        contract = Contract.objects.create(
            customer=customer, number='CTR-STR-002', title='X',
            contract_type='software_dev', billing_type='fixed',
            start_date=timezone.now().date(), created_by=admin_user,
        )
        cp = ContractPaymentPlan.objects.create(contract=contract, plan_type='recurring_only')
        assert 'CTR-STR-002' in str(cp)


# ─── PROPOSAL ACTIONS (send, approve, reject) — aumenta cobertura de views.py ─

@pytest.mark.django_db
class TestProposalActions:
    """Cobre as @action endpoints do ProposalViewSet (send/approve/reject)."""

    def test_send_draft_proposal(self, admin_client, admin_user, customer):
        prop = Proposal.objects.create(
            customer=customer, number='PROP-SEND-001',
            title='Send Test', proposal_type='software_dev',
            billing_type='fixed', total_value=1000,
            valid_until=timezone.now().date() + timedelta(days=30),
            status='draft', created_by=admin_user,
        )
        response = admin_client.post(f'/api/v1/sales/proposals/{prop.id}/send/')
        assert response.status_code == status.HTTP_200_OK
        prop.refresh_from_db()
        assert prop.status == 'sent'

    def test_send_non_draft_proposal_rejected(self, admin_client, proposal):
        # proposal fixture vem com status='approved'
        response = admin_client.post(f'/api/v1/sales/proposals/{proposal.id}/send/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_approve_sent_proposal(self, admin_client, admin_user, customer):
        prop = Proposal.objects.create(
            customer=customer, number='PROP-APP-001',
            title='Approve Test', proposal_type='software_dev',
            billing_type='fixed', total_value=5000,
            valid_until=timezone.now().date() + timedelta(days=30),
            status='sent', created_by=admin_user,
        )
        response = admin_client.post(f'/api/v1/sales/proposals/{prop.id}/approve/')
        assert response.status_code == status.HTTP_200_OK
        prop.refresh_from_db()
        assert prop.status == 'approved'

    def test_reject_sent_proposal(self, admin_client, admin_user, customer):
        prop = Proposal.objects.create(
            customer=customer, number='PROP-REJ-001',
            title='Reject Test', proposal_type='software_dev',
            billing_type='fixed', total_value=1000,
            valid_until=timezone.now().date() + timedelta(days=30),
            status='sent', created_by=admin_user,
        )
        response = admin_client.post(f'/api/v1/sales/proposals/{prop.id}/reject/')
        assert response.status_code == status.HTTP_200_OK
        prop.refresh_from_db()
        assert prop.status == 'rejected'

    def test_reject_already_approved_blocked(self, admin_client, proposal):
        response = admin_client.post(f'/api/v1/sales/proposals/{proposal.id}/reject/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_convert_non_approved_proposal_blocked(self, admin_client, admin_user, customer):
        prop = Proposal.objects.create(
            customer=customer, number='PROP-CNV-001',
            title='Draft', proposal_type='software_dev',
            billing_type='fixed', total_value=1000,
            valid_until=timezone.now().date() + timedelta(days=30),
            status='draft', created_by=admin_user,
        )
        response = admin_client.post(f'/api/v1/sales/proposals/{prop.id}/convert_to_contract/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_proposals_dashboard(self, admin_client, proposal):
        response = admin_client.get('/api/v1/sales/proposals/dashboard/')
        assert response.status_code == status.HTTP_200_OK
        assert 'approved_count' in response.data

    def test_list_proposals_filter_status(self, admin_client, proposal):
        response = admin_client.get('/api/v1/sales/proposals/?status=approved')
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get('results', response.data)
        assert len(results) >= 1

    def test_delete_proposal(self, admin_client, admin_user, customer):
        prop = Proposal.objects.create(
            customer=customer, number='PROP-DEL-001',
            title='Delete Me', proposal_type='software_dev',
            billing_type='fixed', total_value=100,
            valid_until=timezone.now().date() + timedelta(days=30),
            status='draft', created_by=admin_user,
        )
        response = admin_client.delete(f'/api/v1/sales/proposals/{prop.id}/')
        assert response.status_code == status.HTTP_204_NO_CONTENT
