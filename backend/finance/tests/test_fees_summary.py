"""Testes do endpoint GET /finance/fin-dashboard/fees-summary/

Valida:
- Soma de taxas retidas (fee_retained) apenas de invoices paid
- Agrupamento por provider
- Filtro por provider
- Filtro por mês/ano
- Permissão: IsAdminOrManager (viewer → 403)
"""
from decimal import Decimal
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from sales.models import Customer, Contract
from finance.models import Invoice, PaymentProvider, PaymentProviderRate

User = get_user_model()

URL = '/api/v1/finance/fin-dashboard/fees-summary/'


# ─── Fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='fees_admin', email='fees@admin.com',
        password='pass12345', role='admin',
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username='fees_viewer', email='fees@viewer.com',
        password='pass12345', role='viewer',
    )


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def viewer_client(api_client, viewer_user):
    api_client.force_authenticate(user=viewer_user)
    return api_client


@pytest.fixture
def providers(db):
    asaas = PaymentProvider.objects.create(
        code='asaas_fees', name='Asaas Fees', is_active=True, display_order=1,
    )
    PaymentProviderRate.objects.create(
        provider=asaas, method='credit_card',
        installment_fee_pct=Decimal('3.99'),
        installment_fee_fixed=Decimal('0.49'),
    )
    stone = PaymentProvider.objects.create(
        code='stone_fees', name='Stone Fees', is_active=True, display_order=2,
    )
    PaymentProviderRate.objects.create(
        provider=stone, method='credit_card',
        installment_fee_pct=Decimal('2.99'),
    )
    return asaas, stone


@pytest.fixture
def customer(db, admin_user):
    return Customer.objects.create(
        customer_type='PJ', company_name='Cliente Fees Ltda',
        email='fees@cliente.com', created_by=admin_user,
    )


@pytest.fixture
def contract(db, customer, admin_user):
    return Contract.objects.create(
        number='C-FEES-001', title='Contrato Fees',
        customer=customer, billing_type='fixed',
        start_date=timezone.now().date(), status='active',
        created_by=admin_user,
    )


def _make_paid_invoice(contract, customer, admin_user, provider,
                       gross, net, paid_date, method='credit_card'):
    fee = gross - net
    inv = Invoice.objects.create(
        invoice_type='receivable', document_type='invoice',
        contract=contract, customer=customer,
        number=f'REC-{Invoice.objects.count() + 1:05d}',
        issue_date=paid_date - timedelta(days=5),
        due_date=paid_date,
        value=gross, total=net,
        description='Teste fees',
        items=[],
        payment_method=method,
        payment_details={
            'provider_id': provider.id,
            'provider_code': provider.code,
            'gross_charged_to_client': str(gross),
            'net_company_receives': str(net),
            'fee_retained': str(fee),
        },
        status='paid', paid_date=paid_date,
        paid_amount=net,
        created_by=admin_user,
    )
    return inv


# ─── Tests ────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestFeesSummary:

    def test_requires_admin_or_manager(self, viewer_client, providers, contract, customer, admin_user):
        today = timezone.now().date()
        asaas, _ = providers
        _make_paid_invoice(contract, customer, admin_user, asaas,
                           Decimal('100'), Decimal('95'), today)
        r = viewer_client.get(URL, {'year': today.year, 'month': today.month})
        assert r.status_code == status.HTTP_403_FORBIDDEN

    def test_empty_month_returns_zeros(self, admin_client, providers):
        r = admin_client.get(URL, {'year': 2020, 'month': 1})
        assert r.status_code == status.HTTP_200_OK
        assert r.data['total_fees'] == 0.0
        assert r.data['by_provider'] == []

    def test_sums_only_paid_invoices(
        self, admin_client, providers, contract, customer, admin_user,
    ):
        today = timezone.now().date()
        asaas, _ = providers
        # Invoice paga
        _make_paid_invoice(contract, customer, admin_user, asaas,
                           Decimal('100'), Decimal('95'), today)
        # Invoice pending (não deve contar)
        Invoice.objects.create(
            invoice_type='receivable', contract=contract, customer=customer,
            number='REC-PENDING', issue_date=today, due_date=today,
            value=Decimal('200'), total=Decimal('190'),
            payment_details={
                'provider_id': asaas.id, 'provider_code': asaas.code,
                'fee_retained': '10',
            },
            status='pending', created_by=admin_user,
        )
        r = admin_client.get(URL, {'year': today.year, 'month': today.month})
        assert r.data['total_fees'] == 5.0  # só a paga

    def test_aggregates_by_provider(
        self, admin_client, providers, contract, customer, admin_user,
    ):
        today = timezone.now().date()
        asaas, stone = providers
        _make_paid_invoice(contract, customer, admin_user, asaas,
                           Decimal('100'), Decimal('95'), today)
        _make_paid_invoice(contract, customer, admin_user, asaas,
                           Decimal('200'), Decimal('190'), today)
        _make_paid_invoice(contract, customer, admin_user, stone,
                           Decimal('300'), Decimal('291'), today)
        r = admin_client.get(URL, {'year': today.year, 'month': today.month})
        assert r.data['total_fees'] == pytest.approx(24.0)  # 5+10+9
        assert len(r.data['by_provider']) == 2
        # Maior taxa primeiro (ordenado)
        entries = {e['provider_code']: e for e in r.data['by_provider']}
        assert entries['asaas_fees']['fees'] == pytest.approx(15.0)
        assert entries['stone_fees']['fees'] == pytest.approx(9.0)

    def test_provider_filter(
        self, admin_client, providers, contract, customer, admin_user,
    ):
        today = timezone.now().date()
        asaas, stone = providers
        _make_paid_invoice(contract, customer, admin_user, asaas,
                           Decimal('100'), Decimal('95'), today)
        _make_paid_invoice(contract, customer, admin_user, stone,
                           Decimal('200'), Decimal('190'), today)
        r = admin_client.get(URL, {
            'year': today.year, 'month': today.month,
            'provider': asaas.id,
        })
        assert r.data['total_fees'] == pytest.approx(5.0)
        assert len(r.data['by_provider']) == 1
        assert r.data['by_provider'][0]['provider_code'] == 'asaas_fees'

    def test_different_month_not_included(
        self, admin_client, providers, contract, customer, admin_user,
    ):
        today = timezone.now().date()
        asaas, _ = providers
        # Invoice paga no mês atual
        _make_paid_invoice(contract, customer, admin_user, asaas,
                           Decimal('100'), Decimal('95'), today)
        # Invoice paga há 3 meses
        three_ago = today.replace(day=1) - timedelta(days=90)
        _make_paid_invoice(contract, customer, admin_user, asaas,
                           Decimal('500'), Decimal('470'), three_ago)
        r = admin_client.get(URL, {'year': today.year, 'month': today.month})
        assert r.data['total_fees'] == pytest.approx(5.0)  # só a atual
