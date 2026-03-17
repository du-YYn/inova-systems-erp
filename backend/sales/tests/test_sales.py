import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone

from sales.models import Customer, Prospect, Proposal, Contract

User = get_user_model()


# ─── FIXTURES ────────────────────────────────────────────────────────────────

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def manager_user(db):
    return User.objects.create_user(
        username='manager_sales',
        email='manager@salestest.com',
        password='manager_pass_123',
        role='manager',
    )


@pytest.fixture
def operator_user(db):
    return User.objects.create_user(
        username='operator_sales',
        email='operator@salestest.com',
        password='operator_pass_123',
        role='operator',
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username='viewer_sales',
        email='viewer@salestest.com',
        password='viewer_pass_123',
        role='viewer',
    )


@pytest.fixture
def manager_client(api_client, manager_user):
    api_client.force_authenticate(user=manager_user)
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
def customer(db, manager_user):
    return Customer.objects.create(
        company_name='ACME Corp',
        customer_type='PJ',
        email='acme@test.com',
        created_by=manager_user,
    )


@pytest.fixture
def proposal(db, manager_user, customer):
    return Proposal.objects.create(
        customer=customer,
        number='PROP-00001',
        title='Sistema ERP',
        proposal_type='software_dev',
        billing_type='fixed',
        total_value=50000,
        valid_until=timezone.now().date(),
        created_by=manager_user,
        status='draft',
    )


@pytest.fixture
def contract(db, manager_user, customer):
    return Contract.objects.create(
        customer=customer,
        number='CTR-00001',
        title='Contrato ERP',
        contract_type='software_dev',
        billing_type='fixed',
        start_date=timezone.now().date(),
        status='pending_signature',
        created_by=manager_user,
    )


# ─── CUSTOMER ────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestCustomer:
    url = '/api/v1/sales/customers/'

    def test_list_customers_manager(self, manager_client, customer):
        response = manager_client.get(self.url)
        assert response.status_code == status.HTTP_200_OK

    def test_list_customers_operator(self, operator_client, customer):
        response = operator_client.get(self.url)
        assert response.status_code == status.HTTP_200_OK

    def test_list_customers_requires_auth(self, api_client):
        response = api_client.get(self.url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_customers_viewer_forbidden(self, viewer_client):
        response = viewer_client.get(self.url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_create_customer(self, manager_client):
        payload = {
            'company_name': 'New Client SA',
            'customer_type': 'PJ',
            'email': 'newclient@test.com',
        }
        response = manager_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED
        assert Customer.objects.filter(company_name='New Client SA').exists()

    def test_search_customer_by_name(self, manager_client, customer):
        response = manager_client.get(self.url, {'search': 'ACME'})
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] >= 1

    def test_update_customer(self, manager_client, customer):
        url = f'{self.url}{customer.id}/'
        response = manager_client.patch(url, {'company_name': 'ACME Updated'})
        assert response.status_code == status.HTTP_200_OK
        customer.refresh_from_db()
        assert customer.company_name == 'ACME Updated'

    def test_delete_customer(self, manager_client, customer):
        url = f'{self.url}{customer.id}/'
        response = manager_client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT


# ─── PROSPECT ────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestProspect:
    url = '/api/v1/sales/prospects/'

    def test_create_prospect(self, manager_client):
        payload = {
            'company_name': 'Startup XYZ',
            'contact_name': 'João Silva',
            'contact_email': 'joao@startup.com',
            'status': 'new',
            'source': 'website',
        }
        response = manager_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED

    def test_pipeline_action(self, manager_client, db, manager_user):
        Prospect.objects.create(
            company_name='P1', contact_name='C1', contact_email='c1@test.com',
            status='new', source='website', created_by=manager_user
        )
        Prospect.objects.create(
            company_name='P2', contact_name='C2', contact_email='c2@test.com',
            status='qualified', source='referral', created_by=manager_user
        )
        response = manager_client.get(f'{self.url}pipeline/')
        assert response.status_code == status.HTTP_200_OK
        statuses = [item['status'] for item in response.data]
        assert 'new' in statuses
        assert 'qualified' in statuses

    def test_filter_by_status(self, manager_client, db, manager_user):
        Prospect.objects.create(
            company_name='Won', contact_name='C', contact_email='c@t.com',
            status='won', source='website', created_by=manager_user
        )
        response = manager_client.get(self.url, {'status': 'won'})
        assert response.status_code == status.HTTP_200_OK
        assert all(p['status'] == 'won' for p in response.data['results'])


# ─── PROPOSAL ────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestProposal:
    url = '/api/v1/sales/proposals/'

    def test_create_proposal(self, manager_client, customer):
        payload = {
            'customer': customer.id,
            'title': 'Proposta de Sistema',
            'proposal_type': 'software_dev',
            'billing_type': 'fixed',
            'total_value': '10000.00',
            'valid_until': str(timezone.now().date()),
        }
        response = manager_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED
        assert 'number' in response.data
        assert response.data['number'].startswith('PROP-')

    def test_proposal_number_auto_generated(self, manager_client, customer):
        payload = {
            'customer': customer.id,
            'title': 'Proposta A',
            'proposal_type': 'consulting',
            'billing_type': 'hourly',
            'total_value': '5000.00',
            'valid_until': str(timezone.now().date()),
        }
        r1 = manager_client.post(self.url, payload)
        r2 = manager_client.post(self.url, {**payload, 'title': 'Proposta B'})
        assert r1.status_code == status.HTTP_201_CREATED
        assert r2.status_code == status.HTTP_201_CREATED
        assert r1.data['number'] != r2.data['number']

    def test_send_proposal_from_draft(self, manager_client, proposal):
        url = f'{self.url}{proposal.id}/send/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        proposal.refresh_from_db()
        assert proposal.status == 'sent'

    def test_send_proposal_not_from_draft_fails(self, manager_client, proposal):
        proposal.status = 'sent'
        proposal.save()
        url = f'{self.url}{proposal.id}/send/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_approve_proposal_from_sent(self, manager_client, proposal):
        proposal.status = 'sent'
        proposal.save()
        url = f'{self.url}{proposal.id}/approve/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        proposal.refresh_from_db()
        assert proposal.status == 'approved'

    def test_reject_proposal(self, manager_client, proposal):
        proposal.status = 'sent'
        proposal.save()
        url = f'{self.url}{proposal.id}/reject/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        proposal.refresh_from_db()
        assert proposal.status == 'rejected'

    def test_reject_approved_proposal_fails(self, manager_client, proposal):
        proposal.status = 'approved'
        proposal.save()
        url = f'{self.url}{proposal.id}/reject/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_convert_to_contract(self, manager_client, proposal):
        proposal.status = 'approved'
        proposal.save()
        url = f'{self.url}{proposal.id}/convert_to_contract/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_201_CREATED
        assert 'number' in response.data
        assert response.data['number'].startswith('CTR-')

    def test_convert_non_approved_proposal_fails(self, manager_client, proposal):
        # proposal.status is 'draft' by default
        url = f'{self.url}{proposal.id}/convert_to_contract/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_proposals_operator(self, operator_client, proposal):
        response = operator_client.get(self.url)
        assert response.status_code == status.HTTP_200_OK

    def test_list_proposals_viewer_forbidden(self, viewer_client):
        response = viewer_client.get(self.url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_unauthenticated_forbidden(self, api_client):
        response = api_client.get(self.url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ─── CONTRACT ────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestContract:
    url = '/api/v1/sales/contracts/'

    def test_create_contract(self, manager_client, customer):
        payload = {
            'customer': customer.id,
            'title': 'Contrato de Suporte',
            'contract_type': 'support',
            'billing_type': 'monthly',
            'start_date': str(timezone.now().date()),
            'monthly_value': '3000.00',
        }
        response = manager_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['number'].startswith('CTR-')

    def test_activate_contract(self, manager_client, contract):
        url = f'{self.url}{contract.id}/activate/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        contract.refresh_from_db()
        assert contract.status == 'active'

    def test_activate_non_pending_contract_fails(self, manager_client, contract):
        contract.status = 'active'
        contract.save()
        url = f'{self.url}{contract.id}/activate/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_cancel_contract(self, manager_client, contract):
        contract.status = 'active'
        contract.save()
        url = f'{self.url}{contract.id}/cancel/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        contract.refresh_from_db()
        assert contract.status == 'cancelled'

    def test_cancel_already_cancelled_fails(self, manager_client, contract):
        contract.status = 'cancelled'
        contract.save()
        url = f'{self.url}{contract.id}/cancel/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_dashboard(self, manager_client, contract):
        contract.status = 'active'
        contract.save()
        response = manager_client.get(f'{self.url}dashboard/')
        assert response.status_code == status.HTTP_200_OK
        assert 'total_contracts' in response.data
        assert 'active_contracts' in response.data
        assert 'mrr' in response.data

    def test_contract_requires_manager(self, operator_client, contract):
        # ContractViewSet requer IsAdminOrManager — operator deve receber 403
        response = operator_client.get(self.url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_contract_unauthenticated(self, api_client):
        response = api_client.get(self.url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ─── CROSS-USER ACCESS ───────────────────────────────────────────────────────

@pytest.mark.django_db
class TestCrossUserAccess:
    """Garante que usuários não acessam dados uns dos outros de forma indevida."""

    def test_operator_cannot_access_contracts(self, operator_client, contract):
        """Operadores não têm acesso ao módulo de contratos."""
        url = f'/api/v1/sales/contracts/{contract.id}/'
        response = operator_client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_viewer_cannot_list_customers(self, viewer_client):
        """Viewer não tem acesso a nenhum recurso de vendas."""
        response = viewer_client.get('/api/v1/sales/customers/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_viewer_cannot_list_proposals(self, viewer_client):
        response = viewer_client.get('/api/v1/sales/proposals/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_viewer_cannot_list_prospects(self, viewer_client):
        response = viewer_client.get('/api/v1/sales/prospects/')
        assert response.status_code == status.HTTP_403_FORBIDDEN
