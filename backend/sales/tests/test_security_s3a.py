"""Testes F3a: audit trail + LGPD endpoints.

Cobre:
- data-export gera JSON com dados do titular e cria AuditLog
- anonymize substitui PII e marca audit log
- anonymize exige confirmacao e admin role
- operacoes financeiras geram AuditLog (activate/cancel/invoice/provider)
"""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from core.models import AuditLog
from sales.models import Customer, Contract, ContractPaymentPlan
from finance.models import (
    Invoice, PaymentProvider, PaymentProviderRate, BankAccount,
)

User = get_user_model()


# ─── Fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='s3a_admin', email='s3a@admin.com',
        password='pass12345', role='admin',
    )


@pytest.fixture
def manager_user(db):
    return User.objects.create_user(
        username='s3a_mgr', email='s3a@mgr.com',
        password='pass12345', role='manager',
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
def customer(db, admin_user):
    return Customer.objects.create(
        customer_type='PJ', company_name='Cliente LGPD Ltda',
        name='Contato LGPD', document='12.345.678/0001-00',
        email='titular@lgpd.com', phone='11 98765-4321',
        created_by=admin_user,
    )


@pytest.fixture
def bank_account(db):
    return BankAccount.objects.create(
        name='Banco S3A', bank='Teste', account_type='checking',
    )


@pytest.fixture
def provider(db):
    p = PaymentProvider.objects.create(
        code='asaas_s3a', name='Asaas S3A', is_active=True,
    )
    PaymentProviderRate.objects.create(
        provider=p, method='credit_card',
        installment_fee_pct=Decimal('3.99'),
        installment_fee_fixed=Decimal('0.49'),
    )
    return p


# ─── F3a: data-export ─────────────────────────────────────────────────────

@pytest.mark.django_db
class TestDataExport:
    URL = '/api/v1/sales/customers/{id}/data-export/'

    def test_export_returns_full_customer_data(
        self, admin_client, customer, admin_user,
    ):
        # Cria contrato + invoice para confirmar que aparece no export
        contract = Contract.objects.create(
            number='CTR-LGPD-001', title='Contrato Export',
            customer=customer, billing_type='fixed',
            start_date=timezone.now().date(),
            status='active', created_by=admin_user,
        )
        Invoice.objects.create(
            invoice_type='receivable', customer=customer, contract=contract,
            number='REC-LGPD-001', issue_date=timezone.now().date(),
            due_date=timezone.now().date(),
            value=Decimal('1000'), total=Decimal('1000'),
            status='pending', created_by=admin_user,
        )
        r = admin_client.get(self.URL.format(id=customer.id))
        assert r.status_code == status.HTTP_200_OK
        assert r.data['customer']['id'] == customer.id
        assert r.data['customer']['email'] == 'titular@lgpd.com'
        assert r.data['customer']['document'] == '12.345.678/0001-00'
        assert len(r.data['contracts']) == 1
        assert r.data['contracts'][0]['number'] == 'CTR-LGPD-001'
        assert len(r.data['invoices']) == 1
        assert r.data['exported_by'] == 's3a_admin'

    def test_export_creates_audit_log(self, admin_client, customer):
        admin_client.get(self.URL.format(id=customer.id))
        audit = AuditLog.objects.filter(
            action='customer_data_export', resource_id=str(customer.id),
        ).first()
        assert audit is not None
        assert audit.user.username == 's3a_admin'

    def test_viewer_cannot_export(self, api_client, customer, db):
        viewer = User.objects.create_user(
            username='s3a_viewer', email='v@v.com',
            password='pass', role='viewer',
        )
        api_client.force_authenticate(user=viewer)
        r = api_client.get(self.URL.format(id=customer.id))
        # CustomerViewSet usa IsAdminOrManagerOrOperatorStrict — viewer 403
        assert r.status_code == status.HTTP_403_FORBIDDEN


# ─── F3a: anonymize ───────────────────────────────────────────────────────

@pytest.mark.django_db
class TestAnonymize:
    URL = '/api/v1/sales/customers/{id}/anonymize/'

    def test_anonymize_requires_confirmation(self, admin_client, customer):
        r = admin_client.post(self.URL.format(id=customer.id), {}, format='json')
        assert r.status_code == status.HTTP_400_BAD_REQUEST
        customer.refresh_from_db()
        # Nao mudou
        assert customer.email == 'titular@lgpd.com'

    def test_anonymize_requires_admin_role(self, manager_client, customer):
        """Manager eh explicitamente bloqueado — so admin."""
        r = manager_client.post(
            self.URL.format(id=customer.id),
            {'confirm': 'ANONIMIZAR'}, format='json',
        )
        assert r.status_code == status.HTTP_403_FORBIDDEN
        customer.refresh_from_db()
        assert customer.email == 'titular@lgpd.com'

    def test_anonymize_replaces_pii(self, admin_client, customer):
        original_id = customer.id
        r = admin_client.post(
            self.URL.format(id=original_id),
            {'confirm': 'ANONIMIZAR'}, format='json',
        )
        assert r.status_code == status.HTTP_200_OK
        customer.refresh_from_db()
        # Dados pessoais substituidos
        assert customer.email.endswith('@anonymized.local')
        assert customer.company_name.startswith('ANON-')
        assert customer.name.startswith('CLIENTE-ANON-')
        assert customer.document == ''
        assert customer.phone == ''
        assert customer.is_active is False
        # FK preservada (id nao muda)
        assert customer.id == original_id

    def test_anonymize_creates_audit_with_snapshot(self, admin_client, customer):
        admin_client.post(
            self.URL.format(id=customer.id),
            {'confirm': 'ANONIMIZAR'}, format='json',
        )
        audit = AuditLog.objects.filter(
            action='customer_anonymize', resource_id=str(customer.id),
        ).first()
        assert audit is not None
        # Snapshot dos dados reais preservado no audit
        assert audit.old_value['email'] == 'titular@lgpd.com'
        assert audit.old_value['document'] == '12.345.678/0001-00'
        assert audit.new_value['is_active'] is False

    def test_anonymize_preserves_invoice_fks(
        self, admin_client, customer, admin_user,
    ):
        """Invoice antiga continua vinculada ao customer_id (obrigacao fiscal)."""
        inv = Invoice.objects.create(
            invoice_type='receivable', customer=customer,
            number='REC-LGPD-KEEP', issue_date=timezone.now().date(),
            due_date=timezone.now().date(),
            value=Decimal('500'), total=Decimal('500'),
            status='pending', created_by=admin_user,
        )
        admin_client.post(
            self.URL.format(id=customer.id),
            {'confirm': 'ANONIMIZAR'}, format='json',
        )
        inv.refresh_from_db()
        assert inv.customer_id == customer.id  # FK intacta


# ─── F3a: audit em operacoes financeiras ──────────────────────────────────

@pytest.mark.django_db
class TestFinancialOperationsAudited:
    def test_contract_cancel_creates_audit(
        self, admin_client, customer, admin_user,
    ):
        contract = Contract.objects.create(
            number='CTR-AUD-1', title='T', customer=customer,
            billing_type='fixed', start_date=timezone.now().date(),
            status='active', created_by=admin_user,
        )
        r = admin_client.post(f'/api/v1/sales/contracts/{contract.id}/cancel/')
        assert r.status_code == status.HTTP_200_OK
        audit = AuditLog.objects.filter(
            action='contract_cancel', resource_id=str(contract.id),
        ).first()
        assert audit is not None
        assert audit.old_value['status'] == 'active'
        assert audit.new_value['status'] == 'cancelled'

    def test_invoice_mark_paid_creates_audit(
        self, admin_client, customer, admin_user, bank_account,
    ):
        inv = Invoice.objects.create(
            invoice_type='receivable', customer=customer,
            number='REC-AUD-1', issue_date=timezone.now().date(),
            due_date=timezone.now().date(),
            value=Decimal('500'), total=Decimal('500'),
            bank_account=bank_account,
            status='pending', created_by=admin_user,
        )
        r = admin_client.post(f'/api/v1/finance/invoices/{inv.id}/mark_paid/')
        assert r.status_code == status.HTTP_200_OK
        audit = AuditLog.objects.filter(
            action='invoice_mark_paid', resource_id=str(inv.id),
        ).first()
        assert audit is not None
        assert audit.new_value['status'] == 'paid'

    def test_payment_provider_rate_update_creates_audit(
        self, admin_client, provider,
    ):
        rate = provider.rates.filter(method='credit_card').first()
        r = admin_client.patch(
            f'/api/v1/finance/payment-provider-rates/{rate.id}/',
            {'installment_fee_pct': '4.99'}, format='json',
        )
        assert r.status_code == status.HTTP_200_OK
        audit = AuditLog.objects.filter(
            action='payment_provider_rate_update', resource_id=str(rate.id),
        ).first()
        assert audit is not None
        assert audit.old_value['installment_fee_pct'] == '3.9900'
        assert audit.new_value['installment_fee_pct'] == '4.9900'

    def test_contract_delete_creates_audit(
        self, admin_client, customer, admin_user,
    ):
        """CustomerViewSet.destroy audit."""
        # Cria customer sem contracts/invoices para permitir delete
        c = Customer.objects.create(
            customer_type='PJ', company_name='Cust Audit',
            created_by=admin_user,
        )
        r = admin_client.delete(f'/api/v1/sales/customers/{c.id}/')
        assert r.status_code == status.HTTP_204_NO_CONTENT
        audit = AuditLog.objects.filter(
            action='customer_delete', resource_id=str(c.id),
        ).first()
        assert audit is not None
        assert audit.old_value['company_name'] == 'Cust Audit'
