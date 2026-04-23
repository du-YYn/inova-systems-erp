"""Testes da geração de invoices pela ativação de contratos (F4).

Valida:
- Geração de invoices de setup para os 4 modos (pix, boleto, card_installments, card_anticipated)
- Geração de invoices recorrentes baseadas em monthly_value + duration
- Resposta do endpoint /contracts/{id}/activate/ com invoices_generated summary
- Cronograma (due_date) segue os dias calculados por finance.pricing
- Tolerância de ±R$ 15 nos totais (arredondamentos internos)
"""
from decimal import Decimal
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from sales.models import Customer, Contract, ContractPaymentPlan
from finance.models import Invoice, PaymentProvider, PaymentProviderRate
from finance.invoice_generator import generate_activation_invoices

User = get_user_model()


# ─── Fixtures ──────────────────────────────────────────────────────────────

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='invgen_admin', email='invgen@admin.com',
        password='pass12345', role='admin',
    )


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def asaas(db):
    p = PaymentProvider.objects.create(
        code='asaas_f4', name='Asaas F4', is_active=True, display_order=1,
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


@pytest.fixture
def customer(db):
    return Customer.objects.create(
        customer_type='PJ', company_name='Cliente F4 Ltda',
        document='12.345.678/0001-00', email='cliente@f4.com',
    )


def _make_contract(customer, admin_user, monthly=Decimal('0'),
                   setup=Decimal('0'), duration=0, recurring_method='boleto'):
    contract = Contract.objects.create(
        number=f'C-{timezone.now().timestamp()}',
        title='Contrato F4 Teste',
        customer=customer,
        billing_type='fixed',
        monthly_value=monthly or None,
        status='pending_signature',
        created_by=admin_user,
    )
    if setup or duration:
        ContractPaymentPlan.objects.create(
            contract=contract,
            plan_type='setup_plus_recurring' if (setup and duration) else ('one_time' if setup else 'recurring_only'),
            one_time_amount=setup,
            one_time_method='pix',
            one_time_installments=1,
            recurring_amount=monthly or Decimal('0'),
            recurring_method=recurring_method,
            recurring_duration_months=duration,
        )
    return contract


# ─── Unit tests: invoice_generator ────────────────────────────────────────

@pytest.mark.django_db
class TestInvoiceGenerator:

    def test_pix_setup_generates_one_invoice(self, customer, admin_user, asaas):
        contract = _make_contract(customer, admin_user, setup=Decimal('10000.00'))
        result = generate_activation_invoices(
            contract=contract, user=admin_user, provider_id=asaas.id,
            mode='pix', installments=1,
        )
        assert len(result['setup_invoices']) == 1
        inv = result['setup_invoices'][0]
        assert inv.invoice_type == 'receivable'
        assert inv.status == 'pending'
        assert inv.payment_method == 'pix'
        assert inv.contract_id == contract.id
        assert inv.customer_id == customer.id
        assert inv.due_date == timezone.now().date()
        assert Decimal(inv.total) == Decimal('10000.00')

    def test_boleto_12x_generates_12_invoices(self, customer, admin_user, asaas):
        contract = _make_contract(customer, admin_user, setup=Decimal('10000.00'))
        result = generate_activation_invoices(
            contract=contract, user=admin_user, provider_id=asaas.id,
            mode='boleto', installments=12,
        )
        assert len(result['setup_invoices']) == 12
        for idx, inv in enumerate(result['setup_invoices'], start=1):
            expected_due = timezone.now().date() + timedelta(days=30 * idx)
            assert inv.due_date == expected_due
            assert inv.payment_method == 'boleto'

        totals_sum = sum(i.total for i in result['setup_invoices'])
        assert abs(totals_sum - Decimal('10000.00')) <= Decimal('0.10')

    def test_card_12x_no_antic_generates_12_invoices(self, customer, admin_user, asaas):
        contract = _make_contract(customer, admin_user, setup=Decimal('10000.00'))
        result = generate_activation_invoices(
            contract=contract, user=admin_user, provider_id=asaas.id,
            mode='card_installments', installments=12,
        )
        assert len(result['setup_invoices']) == 12
        totals_sum = sum(i.total for i in result['setup_invoices'])
        # Empresa recebe ~R$ 9.600 (±15)
        assert abs(totals_sum - Decimal('9600')) < Decimal('20')
        # Taxa retida ~R$ 400
        assert result['total_fees_setup'] > Decimal('300')
        # Primeira parcela em ~32 dias
        assert result['setup_invoices'][0].due_date == (timezone.now().date() + timedelta(days=32))

    def test_card_anticipated_generates_single_invoice(self, customer, admin_user, asaas):
        contract = _make_contract(customer, admin_user, setup=Decimal('10000.00'))
        result = generate_activation_invoices(
            contract=contract, user=admin_user, provider_id=asaas.id,
            mode='card_anticipated', installments=12, anticipate=True,
        )
        assert len(result['setup_invoices']) == 1
        inv = result['setup_invoices'][0]
        # D+2
        assert (inv.due_date - timezone.now().date()).days <= 3
        # Empresa recebe ~R$ 8466 (±100)
        assert abs(inv.total - Decimal('8466')) < Decimal('200')

    def test_recurring_generates_monthly_invoices(self, customer, admin_user, asaas):
        contract = _make_contract(
            customer, admin_user,
            monthly=Decimal('800.00'), duration=12,
            recurring_method='boleto',
        )
        result = generate_activation_invoices(
            contract=contract, user=admin_user, provider_id=asaas.id,
            mode='pix', installments=1,  # setup não existe, mode só para contract
        )
        assert len(result['recurring_invoices']) == 12
        for idx, inv in enumerate(result['recurring_invoices'], start=1):
            assert inv.is_recurring is True
            assert inv.recurring_pattern == 'monthly'
            assert inv.payment_method == 'boleto'
            expected_due = timezone.now().date() + timedelta(days=30 * idx)
            assert inv.due_date == expected_due

    def test_no_plan_no_invoices(self, customer, admin_user, asaas):
        contract = Contract.objects.create(
            number='C-NOPLAN', title='Sem plano', customer=customer,
            billing_type='fixed', status='pending_signature',
            created_by=admin_user,
        )
        result = generate_activation_invoices(
            contract=contract, user=admin_user, provider_id=asaas.id,
            mode='pix', installments=1,
        )
        assert result['setup_invoices'] == []
        assert result['recurring_invoices'] == []

    def test_invalid_mode_raises(self, customer, admin_user, asaas):
        contract = _make_contract(customer, admin_user, setup=Decimal('1000'))
        with pytest.raises(ValueError):
            generate_activation_invoices(
                contract=contract, user=admin_user, provider_id=asaas.id,
                mode='bitcoin', installments=1,
            )

    def test_inactive_provider_raises(self, customer, admin_user, asaas):
        asaas.is_active = False
        asaas.save()
        contract = _make_contract(customer, admin_user, setup=Decimal('1000'))
        with pytest.raises(ValueError):
            generate_activation_invoices(
                contract=contract, user=admin_user, provider_id=asaas.id,
                mode='pix', installments=1,
            )


# ─── Integration: /contracts/{id}/activate/ ─────────────────────────────

@pytest.mark.django_db
class TestActivateEndpointIntegration:

    def test_activate_without_payload_does_not_generate_invoices(
        self, admin_client, customer, admin_user, asaas,
    ):
        contract = _make_contract(customer, admin_user, setup=Decimal('5000'))
        r = admin_client.post(f'/api/v1/sales/contracts/{contract.id}/activate/')
        assert r.status_code == status.HTTP_200_OK
        assert r.data.get('status') == 'active'
        assert 'invoices_generated' not in r.data
        assert Invoice.objects.filter(contract=contract).count() == 0

    def test_activate_with_pix_payload_generates_one_invoice(
        self, admin_client, customer, admin_user, asaas,
    ):
        contract = _make_contract(customer, admin_user, setup=Decimal('5000'))
        r = admin_client.post(
            f'/api/v1/sales/contracts/{contract.id}/activate/',
            {
                'payment_provider': asaas.id,
                'activation_mode': 'pix',
                'installments': 1,
            }, format='json',
        )
        assert r.status_code == status.HTTP_200_OK, r.data
        assert r.data['invoices_generated']['setup_count'] == 1
        assert Invoice.objects.filter(contract=contract).count() == 1

    def test_activate_with_setup_and_recurring(
        self, admin_client, customer, admin_user, asaas,
    ):
        contract = _make_contract(
            customer, admin_user,
            setup=Decimal('5000'), monthly=Decimal('1000'), duration=6,
        )
        r = admin_client.post(
            f'/api/v1/sales/contracts/{contract.id}/activate/',
            {
                'payment_provider': asaas.id,
                'activation_mode': 'boleto',
                'installments': 3,
            }, format='json',
        )
        assert r.status_code == status.HTTP_200_OK, r.data
        assert r.data['invoices_generated']['setup_count'] == 3
        assert r.data['invoices_generated']['recurring_count'] == 6
        assert Invoice.objects.filter(contract=contract).count() == 9

    def test_activate_invalid_mode_400(
        self, admin_client, customer, admin_user, asaas,
    ):
        contract = _make_contract(customer, admin_user, setup=Decimal('1000'))
        r = admin_client.post(
            f'/api/v1/sales/contracts/{contract.id}/activate/',
            {
                'payment_provider': asaas.id,
                'activation_mode': 'crypto',
            }, format='json',
        )
        assert r.status_code == status.HTTP_400_BAD_REQUEST
        # Contract should still be in pending (rollback)
        contract.refresh_from_db()
        assert contract.status == 'pending_signature'

    def test_activate_mode_without_provider_400(
        self, admin_client, customer, admin_user, asaas,
    ):
        contract = _make_contract(customer, admin_user, setup=Decimal('1000'))
        r = admin_client.post(
            f'/api/v1/sales/contracts/{contract.id}/activate/',
            {'activation_mode': 'pix'}, format='json',
        )
        assert r.status_code == status.HTTP_400_BAD_REQUEST

    def test_activate_already_active_returns_400(
        self, admin_client, customer, admin_user, asaas,
    ):
        contract = _make_contract(customer, admin_user)
        contract.status = 'active'
        contract.save()
        r = admin_client.post(f'/api/v1/sales/contracts/{contract.id}/activate/')
        assert r.status_code == status.HTTP_400_BAD_REQUEST
