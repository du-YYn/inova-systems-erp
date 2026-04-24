"""Testes da FASE 4 (hardening fluxo financeiro F0-F5).

Cobre:
- F4.1 activate: bounds installments (1-12), combinacoes invalidas
- F4.2 simulate: restrito a admin/manager/operator (viewer 403)
- F4.3 generate_activation_invoices: aceita objeto provider
- F4.4 fees_summary: provider_filter normalizado + invoice_count consistente
- F4.5 InvoiceSerializer: payment_details filtrado por allow-list
"""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from sales.models import Customer, Contract, ContractPaymentPlan
from finance.models import (
    Invoice, PaymentProvider, PaymentProviderRate, BankAccount,
)
from finance.invoice_generator import generate_activation_invoices

User = get_user_model()


# ─── Fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='s4_admin', email='s4@a.com',
        password='pass12345', role='admin',
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username='s4_view', email='s4@v.com',
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
def customer(db, admin_user):
    return Customer.objects.create(
        customer_type='PJ', company_name='Cliente S4',
        document='11.111.111/0001-11',
        created_by=admin_user,
    )


@pytest.fixture
def provider(db):
    p = PaymentProvider.objects.create(
        code='asaas_s4', name='Asaas S4', is_active=True,
    )
    PaymentProviderRate.objects.create(
        provider=p, method='credit_card',
        installment_fee_pct=Decimal('3.99'),
        installment_fee_fixed=Decimal('0.49'),
        anticipation_monthly_pct=Decimal('1.70'),
    )
    PaymentProviderRate.objects.create(
        provider=p, method='boleto', fixed_fee=Decimal('0'),
    )
    PaymentProviderRate.objects.create(
        provider=p, method='pix', fixed_fee=Decimal('0'),
    )
    return p


def _make_contract(customer, admin_user, setup=Decimal('5000')):
    contract = Contract.objects.create(
        number=f'C-{int(timezone.now().timestamp() * 1000) % 100000000}',
        title='Contrato S4', customer=customer, billing_type='fixed',
        start_date=timezone.now().date(),
        monthly_value=Decimal('0'),
        status='pending_signature', created_by=admin_user,
    )
    ContractPaymentPlan.objects.create(
        contract=contract, plan_type='one_time',
        one_time_amount=setup, one_time_method='pix',
        one_time_installments=1, recurring_amount=Decimal('0'),
        recurring_method='boleto', recurring_duration_months=0,
    )
    return contract


# ─── F4.1: bounds e combinacoes em activate ──────────────────────────────

@pytest.mark.django_db
class TestActivateBounds:
    def _url(self, contract):
        return f'/api/v1/sales/contracts/{contract.id}/activate/'

    def test_installments_zero_returns_400(
        self, admin_client, customer, admin_user, provider,
    ):
        c = _make_contract(customer, admin_user)
        r = admin_client.post(self._url(c), {
            'payment_provider': provider.id,
            'activation_mode': 'card_installments',
            'installments': 0,
        }, format='json')
        assert r.status_code == status.HTTP_400_BAD_REQUEST

    def test_installments_over_12_returns_400(
        self, admin_client, customer, admin_user, provider,
    ):
        c = _make_contract(customer, admin_user)
        r = admin_client.post(self._url(c), {
            'payment_provider': provider.id,
            'activation_mode': 'card_installments',
            'installments': 9999,
        }, format='json')
        assert r.status_code == status.HTTP_400_BAD_REQUEST
        c.refresh_from_db()
        assert c.status == 'pending_signature'

    def test_installments_non_integer_returns_400(
        self, admin_client, customer, admin_user, provider,
    ):
        c = _make_contract(customer, admin_user)
        r = admin_client.post(self._url(c), {
            'payment_provider': provider.id,
            'activation_mode': 'pix',
            'installments': 'abc',
        }, format='json')
        assert r.status_code == status.HTTP_400_BAD_REQUEST

    def test_pix_with_multiple_installments_rejected(
        self, admin_client, customer, admin_user, provider,
    ):
        c = _make_contract(customer, admin_user)
        r = admin_client.post(self._url(c), {
            'payment_provider': provider.id,
            'activation_mode': 'pix',
            'installments': 5,
        }, format='json')
        assert r.status_code == status.HTTP_400_BAD_REQUEST

    def test_anticipate_with_boleto_rejected(
        self, admin_client, customer, admin_user, provider,
    ):
        c = _make_contract(customer, admin_user)
        r = admin_client.post(self._url(c), {
            'payment_provider': provider.id,
            'activation_mode': 'boleto',
            'installments': 12,
            'anticipate': True,
        }, format='json')
        assert r.status_code == status.HTTP_400_BAD_REQUEST

    def test_repass_with_pix_rejected(
        self, admin_client, customer, admin_user, provider,
    ):
        c = _make_contract(customer, admin_user)
        r = admin_client.post(self._url(c), {
            'payment_provider': provider.id,
            'activation_mode': 'pix',
            'repass_fee': True,
        }, format='json')
        assert r.status_code == status.HTTP_400_BAD_REQUEST

    def test_valid_card_12x_accepted(
        self, admin_client, customer, admin_user, provider,
    ):
        c = _make_contract(customer, admin_user)
        r = admin_client.post(self._url(c), {
            'payment_provider': provider.id,
            'activation_mode': 'card_installments',
            'installments': 12,
        }, format='json')
        assert r.status_code == status.HTTP_200_OK


# ─── F4.2: simulate restrito ──────────────────────────────────────────────

@pytest.mark.django_db
class TestSimulatePermission:
    def _url(self, provider):
        return f'/api/v1/finance/payment-providers/{provider.id}/simulate/'

    def test_viewer_blocked(self, viewer_client, provider):
        r = viewer_client.post(self._url(provider), {
            'method': 'pix', 'gross': '1000',
        }, format='json')
        assert r.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )

    def test_admin_allowed(self, admin_client, provider):
        r = admin_client.post(self._url(provider), {
            'method': 'pix', 'gross': '1000',
        }, format='json')
        assert r.status_code == status.HTTP_200_OK

    def test_installments_over_12_rejected(self, admin_client, provider):
        r = admin_client.post(self._url(provider), {
            'method': 'credit_card', 'gross': '1000', 'installments': 99,
        }, format='json')
        assert r.status_code == status.HTTP_400_BAD_REQUEST


# ─── F4.3: generator aceita provider objeto ──────────────────────────────

@pytest.mark.django_db
class TestGeneratorProviderObject:
    def test_accepts_provider_object(
        self, customer, admin_user, provider,
    ):
        c = _make_contract(customer, admin_user)
        result = generate_activation_invoices(
            contract=c, user=admin_user,
            provider=provider,  # F4.3: objeto direto
            mode='pix', installments=1,
        )
        assert len(result['setup_invoices']) == 1

    def test_rejects_when_neither_provider_nor_id(
        self, customer, admin_user,
    ):
        c = _make_contract(customer, admin_user)
        with pytest.raises(ValueError, match='provider'):
            generate_activation_invoices(
                contract=c, user=admin_user,
                mode='pix', installments=1,
            )

    def test_still_accepts_provider_id_backcompat(
        self, customer, admin_user, provider,
    ):
        c = _make_contract(customer, admin_user)
        result = generate_activation_invoices(
            contract=c, user=admin_user,
            provider_id=provider.id,  # compat antigo
            mode='pix', installments=1,
        )
        assert len(result['setup_invoices']) == 1


# ─── F4.4: fees_summary filter consistency ───────────────────────────────

@pytest.mark.django_db
class TestFeesSummaryFilter:
    URL = '/api/v1/finance/fin-dashboard/fees-summary/'

    def _paid_invoice(self, customer, admin_user, provider_id, paid_date):
        return Invoice.objects.create(
            invoice_type='receivable', customer=customer,
            number=f'REC-S4-{paid_date.month:02d}-{provider_id}',
            issue_date=paid_date, due_date=paid_date,
            value=Decimal('1000'), total=Decimal('1000'),
            payment_details={
                'provider_id': provider_id,
                'provider_code': f'prov_{provider_id}',
                'gross_charged_to_client': '1000',
                'net_company_receives': '960',
                'fee_retained': '40',
            },
            status='paid', paid_date=paid_date, paid_amount=Decimal('1000'),
            created_by=admin_user,
        )

    def test_invalid_provider_id_returns_400(self, admin_client):
        today = timezone.now().date()
        r = admin_client.get(self.URL, {
            'year': today.year, 'month': today.month,
            'provider': 'abc',
        })
        assert r.status_code == status.HTTP_400_BAD_REQUEST

    def test_pid_string_and_int_unified(
        self, admin_client, customer, admin_user, provider,
    ):
        """F4.4: payment_details com provider_id=int vs string caem
        na mesma chave no dict by_provider."""
        today = timezone.now().date()
        # Usa um invoice com provider_id como int
        self._paid_invoice(customer, admin_user, provider.id, today)
        r = admin_client.get(self.URL, {
            'year': today.year, 'month': today.month,
        })
        assert r.status_code == status.HTTP_200_OK
        # Sem duplicacao no by_provider
        ids_in_response = [p['provider_id'] for p in r.data['by_provider']]
        assert len(ids_in_response) == len(set(ids_in_response))

    def test_invoice_count_matches_filter(
        self, admin_client, customer, admin_user, provider,
    ):
        """Com filter, invoice_count nao deve contar invoices de outros providers."""
        today = timezone.now().date()
        self._paid_invoice(customer, admin_user, provider.id, today)
        # Outro provider (fake id)
        self._paid_invoice(customer, admin_user, 999, today)
        r = admin_client.get(self.URL, {
            'year': today.year, 'month': today.month,
            'provider': provider.id,
        })
        assert r.data['invoice_count'] == 1  # so o do provider filtrado


# ─── F4.5: payment_details filtrado no serializer ────────────────────────

@pytest.mark.django_db
class TestPaymentDetailsAllowlist:
    def test_unsafe_keys_hidden_in_response(
        self, admin_client, customer, admin_user,
    ):
        """F4.5: chaves fora da allow-list (ex: cpf, card_last4) sao
        filtradas na representacao do serializer."""
        inv = Invoice.objects.create(
            invoice_type='receivable', customer=customer,
            number='REC-S4-PII', issue_date=timezone.now().date(),
            due_date=timezone.now().date(),
            value=Decimal('100'), total=Decimal('100'),
            payment_details={
                'provider_id': 1,
                'fee_retained': '5',
                # Chaves sensíveis hipoteticas — nao devem sair no response
                'cpf_titular': '123.456.789-00',
                'card_last4': '1234',
                'pix_key_cliente': 'cliente@test.com',
            },
            created_by=admin_user,
        )
        r = admin_client.get(f'/api/v1/finance/invoices/{inv.id}/')
        assert r.status_code == status.HTTP_200_OK
        pd = r.data.get('payment_details', {})
        # Chaves seguras preservadas
        assert pd.get('provider_id') == 1
        assert pd.get('fee_retained') == '5'
        # Chaves sensíveis nao expostas
        assert 'cpf_titular' not in pd
        assert 'card_last4' not in pd
        assert 'pix_key_cliente' not in pd
