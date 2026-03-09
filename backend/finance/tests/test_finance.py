import pytest
from decimal import Decimal
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from finance.models import BankAccount, Category, Invoice, Transaction, Budget, CostCenter

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(
        username='admin',
        email='admin@test.com',
        password='admin_pass_123',
        role='admin',
    )


@pytest.fixture
def manager_user(db):
    return User.objects.create_user(
        username='manager',
        email='manager@test.com',
        password='manager_pass_123',
        role='manager',
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username='viewer',
        email='viewer@test.com',
        password='viewer_pass_123',
        role='viewer',
    )


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def manager_client(api_client, manager_user):
    api_client.force_authenticate(user=manager_user)
    return api_client


@pytest.fixture
def viewer_client(api_client, viewer_user):
    api_client.force_authenticate(user=viewer_user)
    return api_client


@pytest.fixture
def bank_account(db):
    return BankAccount.objects.create(
        name='Conta Principal',
        bank='Banco do Brasil',
        account_type='checking',
        balance=Decimal('10000.00'),
    )


@pytest.fixture
def category(db):
    return Category.objects.create(
        name='Serviços',
        category_type='income',
    )


@pytest.fixture
def invoice(db, admin_user, bank_account, category):
    return Invoice.objects.create(
        invoice_type='receivable',
        number='NF-001',
        issue_date='2024-01-01',
        due_date='2024-01-31',
        value=Decimal('1000.00'),
        total=Decimal('1000.00'),
        status='pending',
        category=category,
        bank_account=bank_account,
        created_by=admin_user,
    )


# ─── BANK ACCOUNT ────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestBankAccount:
    url = '/api/v1/finance/bank-accounts/'

    def test_list_requires_auth(self, api_client):
        response = api_client.get(self.url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_allowed_for_manager(self, manager_client):
        response = manager_client.get(self.url)
        assert response.status_code == status.HTTP_200_OK

    def test_create_bank_account(self, admin_client):
        payload = {
            'name': 'Conta Teste',
            'bank': 'Itaú',
            'account_type': 'checking',
        }
        response = admin_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED
        assert BankAccount.objects.filter(name='Conta Teste').exists()

    def test_viewer_cannot_create(self, viewer_client):
        payload = {
            'name': 'Conta Teste',
            'bank': 'Itaú',
            'account_type': 'checking',
        }
        response = viewer_client.post(self.url, payload)
        assert response.status_code == status.HTTP_403_FORBIDDEN


# ─── INVOICE ─────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestInvoice:
    url = '/api/v1/finance/invoices/'

    def test_list_invoices(self, admin_client, invoice):
        response = admin_client.get(self.url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] >= 1

    def test_filter_by_type(self, admin_client, invoice):
        response = admin_client.get(self.url, {'invoice_type': 'receivable'})
        assert response.status_code == status.HTTP_200_OK
        for item in response.data['results']:
            assert item['invoice_type'] == 'receivable'

    def test_filter_by_status(self, admin_client, invoice):
        response = admin_client.get(self.url, {'status': 'pending'})
        assert response.status_code == status.HTTP_200_OK
        for item in response.data['results']:
            assert item['status'] == 'pending'

    def test_create_invoice(self, admin_client, bank_account, category):
        payload = {
            'invoice_type': 'payable',
            'issue_date': '2024-02-01',
            'due_date': '2024-02-28',
            'value': '500.00',
            'total': '500.00',
            'status': 'pending',
            'bank_account': bank_account.id,
            'category': category.id,
        }
        before_count = Invoice.objects.count()
        response = admin_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED
        assert Invoice.objects.count() == before_count + 1

    def test_update_invoice_status(self, admin_client, invoice):
        url = f'{self.url}{invoice.id}/'
        response = admin_client.patch(url, {'status': 'paid'})
        assert response.status_code == status.HTTP_200_OK
        invoice.refresh_from_db()
        assert invoice.status == 'paid'

    def test_viewer_cannot_create_invoice(self, viewer_client, bank_account, category):
        payload = {
            'invoice_type': 'payable',
            'number': 'NF-003',
            'issue_date': '2024-02-01',
            'due_date': '2024-02-28',
            'value': '500.00',
            'total': '500.00',
        }
        response = viewer_client.post(self.url, payload)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_manager_can_create_invoice(self, manager_client, bank_account, category):
        payload = {
            'invoice_type': 'receivable',
            'issue_date': '2024-03-01',
            'due_date': '2024-03-31',
            'value': '750.00',
            'total': '750.00',
            'status': 'pending',
            'bank_account': bank_account.id,
            'category': category.id,
        }
        response = manager_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED


# ─── TRANSACTION ─────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestTransaction:
    url = '/api/v1/finance/transactions/'

    def test_create_transaction(self, admin_client, admin_user, bank_account, category):
        payload = {
            'transaction_type': 'income',
            'bank_account': bank_account.id,
            'category': category.id,
            'date': '2024-01-15',
            'amount': '1500.00',
            'description': 'Pagamento cliente XYZ',
        }
        response = admin_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED

    def test_list_transactions(self, admin_client, admin_user, bank_account, category):
        Transaction.objects.create(
            transaction_type='expense',
            bank_account=bank_account,
            category=category,
            date='2024-01-10',
            amount=Decimal('200.00'),
            description='Despesa operacional',
            created_by=admin_user,
        )
        response = admin_client.get(self.url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] >= 1

    def test_viewer_cannot_create_transaction(self, viewer_client, bank_account, category):
        payload = {
            'transaction_type': 'income',
            'bank_account': bank_account.id,
            'date': '2024-01-15',
            'amount': '100.00',
            'description': 'Teste',
        }
        response = viewer_client.post(self.url, payload)
        assert response.status_code == status.HTTP_403_FORBIDDEN


# ─── BUDGET ──────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestBudget:
    url = '/api/v1/finance/budgets/'

    def test_create_budget(self, admin_client, category):
        payload = {
            'name': 'Orçamento Q1',
            'period': 'quarterly',
            'start_date': '2024-01-01',
            'end_date': '2024-03-31',
            'category': category.id,
            'planned': '50000.00',
        }
        response = admin_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED
        assert Budget.objects.filter(name='Orçamento Q1').exists()

    def test_budget_progress_calculation(self, admin_client, admin_user, category):
        budget = Budget.objects.create(
            name='Budget Teste',
            period='monthly',
            start_date='2024-01-01',
            end_date='2024-01-31',
            category=category,
            planned=Decimal('10000.00'),
            actual=Decimal('2500.00'),
            created_by=admin_user,
        )
        response = admin_client.get(f'{self.url}{budget.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['progress'] == pytest.approx(25.0)

    def test_budget_zero_planned_progress(self, admin_client, admin_user, category):
        budget = Budget.objects.create(
            name='Budget Zero',
            period='monthly',
            start_date='2024-01-01',
            end_date='2024-01-31',
            category=category,
            planned=Decimal('0.00'),
            actual=Decimal('0.00'),
            created_by=admin_user,
        )
        response = admin_client.get(f'{self.url}{budget.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['progress'] == 0
