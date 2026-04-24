"""Testes de regressao da FASE 1 (security hardening financeiro).

Cobre:
- F1.1: invoice_generator grava total=gross (receita bruta)
- F1.3: numero de invoice unico via sequence PostgreSQL (nao gera duplicado)
- F1.4: fee_pct >= 100% retorna 400/ValueError
- F1.5: PATCH em Invoice.status/paid_date/paid_amount/payment_details bloqueado
- F1.6: PATCH em Contract.status bloqueado
- F1.7: mark_paid usa self.get_object (nao bypassa get_queryset)
- F1.8: IDOR fix em prospects/{id}/conclude
"""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from finance.models import (
    Invoice, PaymentProvider, PaymentProviderRate,
)
from finance.pricing import calculate_card
from finance.invoice_generator import generate_activation_invoices, _next_invoice_number
from sales.models import Customer, Prospect, Contract, ContractPaymentPlan

User = get_user_model()


# ─── Fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='s1_admin', email='s1@admin.com',
        password='pass12345', role='admin',
    )


@pytest.fixture
def manager_user(db):
    return User.objects.create_user(
        username='s1_mgr', email='s1@mgr.com',
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
def asaas(db):
    p = PaymentProvider.objects.create(
        code='asaas_s1', name='Asaas S1', is_active=True,
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
def customer_a(db, admin_user):
    return Customer.objects.create(
        customer_type='PJ', company_name='Cliente A',
        document='11.111.111/0001-00', email='a@test.com',
        created_by=admin_user,
    )


@pytest.fixture
def customer_b(db, admin_user):
    return Customer.objects.create(
        customer_type='PJ', company_name='Cliente B',
        document='22.222.222/0001-00', email='b@test.com',
        created_by=admin_user,
    )


def _make_contract(customer, admin_user, setup=Decimal('0'), monthly=Decimal('0'), duration=0):
    contract = Contract.objects.create(
        number=f'C-S1-{timezone.now().timestamp()}',
        title='Contrato S1',
        customer=customer,
        billing_type='fixed',
        start_date=timezone.now().date(),
        monthly_value=monthly,
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
            recurring_amount=monthly,
            recurring_method='boleto',
            recurring_duration_months=duration,
        )
    return contract


# ─── F1.1: total = gross ──────────────────────────────────────────────────

@pytest.mark.django_db
class TestInvoiceTotalGross:
    def test_card_installments_total_equals_gross_per_parcel(
        self, customer_a, admin_user, asaas,
    ):
        contract = _make_contract(customer_a, admin_user, setup=Decimal('10000.00'))
        result = generate_activation_invoices(
            contract=contract, user=admin_user, provider_id=asaas.id,
            mode='card_installments', installments=12,
        )
        # Soma dos totais = gross bruto (client_pays)
        totals = sum(i.total for i in result['setup_invoices'])
        assert abs(totals - Decimal('10000.00')) < Decimal('0.10'), \
            f'Somatorio de totals deveria ser ~10000 (gross), obteve {totals}'

    def test_payment_details_preserves_net(self, customer_a, admin_user, asaas):
        contract = _make_contract(customer_a, admin_user, setup=Decimal('10000.00'))
        result = generate_activation_invoices(
            contract=contract, user=admin_user, provider_id=asaas.id,
            mode='card_installments', installments=12,
        )
        inv = result['setup_invoices'][0]
        net = Decimal(str(inv.payment_details['net_company_receives']))
        assert net < inv.total, 'net deve ser menor que total (houve taxa)'
        assert net > Decimal('700'), f'net ~R$800/parcela (gross ~R$833), obteve {net}'


# ─── F1.3: numero unico ───────────────────────────────────────────────────

@pytest.mark.django_db
class TestInvoiceNumberUnique:
    def test_sequence_generates_unique_numbers(self, db):
        """Geracao direta via _next_invoice_number nao duplica."""
        n1 = _next_invoice_number('receivable')
        n2 = _next_invoice_number('receivable')
        assert n1 != n2, f'{n1} == {n2} (duplicado!)'
        assert n1.startswith('REC-')
        assert n2.startswith('REC-')

    def test_sequence_separate_per_type(self, db):
        rec1 = _next_invoice_number('receivable')
        pag1 = _next_invoice_number('payable')
        assert rec1.startswith('REC-')
        assert pag1.startswith('PAG-')

    def test_unique_constraint_blocks_duplicate(
        self, customer_a, admin_user, db,
    ):
        """UniqueConstraint do DB bloqueia INSERT de (invoice_type, number) duplicado."""
        from django.db import IntegrityError
        Invoice.objects.create(
            invoice_type='receivable', document_type='invoice',
            customer=customer_a, number='REC-DUP-001',
            issue_date=timezone.now().date(),
            due_date=timezone.now().date(),
            value=Decimal('100'), total=Decimal('100'),
            created_by=admin_user,
        )
        with pytest.raises(IntegrityError):
            Invoice.objects.create(
                invoice_type='receivable', document_type='invoice',
                customer=customer_a, number='REC-DUP-001',
                issue_date=timezone.now().date(),
                due_date=timezone.now().date(),
                value=Decimal('100'), total=Decimal('100'),
                created_by=admin_user,
            )


# ─── F1.4: fee_pct bounds ─────────────────────────────────────────────────

@pytest.mark.django_db
class TestFeePctBounds:
    def test_pricing_rejects_fee_pct_100(self):
        with pytest.raises(ValueError, match='fee_pct'):
            calculate_card(
                gross=Decimal('1000'), installments=1,
                fee_pct=Decimal('100'), fee_fixed=Decimal('0'),
                repass_fee=True,
            )

    def test_pricing_rejects_fee_pct_150(self):
        with pytest.raises(ValueError, match='fee_pct'):
            calculate_card(
                gross=Decimal('1000'), installments=1,
                fee_pct=Decimal('150'), fee_fixed=Decimal('0'),
            )

    def test_pricing_accepts_fee_pct_99_99(self):
        # Borda maxima aceita
        r = calculate_card(
            gross=Decimal('1000'), installments=1,
            fee_pct=Decimal('99.99'), fee_fixed=Decimal('0'),
        )
        assert r['method'] == 'credit_card'

    def test_model_validator_rejects_fee_pct_100(self, asaas):
        from django.core.exceptions import ValidationError
        rate = PaymentProviderRate(
            provider=asaas, method='credit_card',
            installment_fee_pct=Decimal('100.00'),
        )
        with pytest.raises(ValidationError):
            rate.full_clean()


# ─── F1.5/F1.6: mass assignment blocked ───────────────────────────────────

@pytest.mark.django_db
class TestMassAssignmentBlocked:
    def test_patch_invoice_status_read_only(
        self, manager_client, customer_a, admin_user,
    ):
        """PATCH em Invoice.status é silenciosamente ignorado (read_only_fields)."""
        inv = Invoice.objects.create(
            invoice_type='receivable', customer=customer_a,
            number='REC-S1-ROTEST', issue_date=timezone.now().date(),
            due_date=timezone.now().date(),
            value=Decimal('100'), total=Decimal('100'),
            status='pending', created_by=admin_user,
        )
        r = manager_client.patch(
            f'/api/v1/finance/invoices/{inv.id}/',
            {'status': 'paid', 'paid_amount': '100.00'},
            format='json',
        )
        assert r.status_code == status.HTTP_200_OK
        inv.refresh_from_db()
        # Campos read_only nao devem ter mudado
        assert inv.status == 'pending', \
            f'status foi alterado via PATCH para {inv.status}'
        assert inv.paid_amount == Decimal('0'), \
            f'paid_amount foi alterado via PATCH para {inv.paid_amount}'

    def test_patch_invoice_payment_details_read_only(
        self, manager_client, customer_a, admin_user,
    ):
        inv = Invoice.objects.create(
            invoice_type='receivable', customer=customer_a,
            number='REC-S1-PDTEST', issue_date=timezone.now().date(),
            due_date=timezone.now().date(),
            value=Decimal('100'), total=Decimal('100'),
            payment_details={'provider_id': 1, 'fee_retained': '5'},
            created_by=admin_user,
        )
        r = manager_client.patch(
            f'/api/v1/finance/invoices/{inv.id}/',
            {'payment_details': {'fee_retained': '-99999'}},
            format='json',
        )
        inv.refresh_from_db()
        # payment_details original preservado
        assert inv.payment_details.get('fee_retained') == '5'

    def test_patch_contract_status_read_only(
        self, manager_client, customer_a, admin_user,
    ):
        """PATCH em Contract.status bypassava /activate; agora read_only."""
        contract = _make_contract(customer_a, admin_user, setup=Decimal('1000'))
        assert contract.status == 'pending_signature'
        r = manager_client.patch(
            f'/api/v1/sales/contracts/{contract.id}/',
            {'status': 'active'},
            format='json',
        )
        assert r.status_code in (status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST)
        contract.refresh_from_db()
        assert contract.status == 'pending_signature', \
            f'status alterado via PATCH, era pending_signature, agora {contract.status}'


# ─── F1.7: mark_paid usa get_object ───────────────────────────────────────

@pytest.mark.django_db
class TestMarkPaidGetObject:
    def test_mark_paid_existing_invoice(
        self, manager_client, customer_a, admin_user,
    ):
        from finance.models import Transaction
        inv = Invoice.objects.create(
            invoice_type='receivable', customer=customer_a,
            number='REC-S1-MP001', issue_date=timezone.now().date(),
            due_date=timezone.now().date(),
            value=Decimal('500'), total=Decimal('500'),
            status='pending', created_by=admin_user,
        )
        r = manager_client.post(
            f'/api/v1/finance/invoices/{inv.id}/mark_paid/',
        )
        assert r.status_code == status.HTTP_200_OK
        inv.refresh_from_db()
        assert inv.status == 'paid'
        # Transaction de contrapartida criada
        assert Transaction.objects.filter(invoice=inv).count() == 1

    def test_mark_paid_nonexistent_returns_404(self, manager_client):
        r = manager_client.post('/api/v1/finance/invoices/999999/mark_paid/')
        assert r.status_code == status.HTTP_404_NOT_FOUND


# ─── F1.8: IDOR conclude ──────────────────────────────────────────────────

@pytest.mark.django_db
class TestConcludeIDOR:
    def test_conclude_rejects_invoice_from_other_customer(
        self, admin_client, customer_a, customer_b, admin_user,
    ):
        """Prospect 'Cliente A' nao pode marcar invoice do 'Cliente B' como paga."""
        # Prospect com company_name bate com customer_a
        prospect = Prospect.objects.create(
            company_name='Cliente A',  # match com customer_a
            contact_name='Contato A',
            contact_email='a@test.com',
            status='production',
            created_by=admin_user,
        )
        # Invoice do customer_b (OUTRO cliente)
        inv_b = Invoice.objects.create(
            invoice_type='receivable', customer=customer_b,
            number='REC-S1-IDOR-B', issue_date=timezone.now().date(),
            due_date=timezone.now().date(),
            value=Decimal('999'), total=Decimal('999'),
            status='pending', created_by=admin_user,
        )
        r = admin_client.post(
            f'/api/v1/sales/prospects/{prospect.id}/conclude/',
            {'invoices': [{'id': inv_b.id, 'action': 'pay'}]},
            format='json',
        )
        # A action deve ser silenciosamente ignorada (customer nao bate)
        assert r.status_code in (status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST)
        inv_b.refresh_from_db()
        assert inv_b.status == 'pending', \
            f'Invoice do customer_b foi marcada como {inv_b.status} via conclude do customer_a'

    def test_conclude_accepts_invoice_from_same_customer(
        self, admin_client, customer_a, admin_user,
    ):
        prospect = Prospect.objects.create(
            company_name='Cliente A',
            contact_name='Contato A',
            contact_email='a@test.com',
            status='production',
            created_by=admin_user,
        )
        inv_a = Invoice.objects.create(
            invoice_type='receivable', customer=customer_a,
            number='REC-S1-IDOR-A', issue_date=timezone.now().date(),
            due_date=timezone.now().date(),
            value=Decimal('500'), total=Decimal('500'),
            status='pending', created_by=admin_user,
        )
        r = admin_client.post(
            f'/api/v1/sales/prospects/{prospect.id}/conclude/',
            {'invoices': [{'id': inv_a.id, 'action': 'pay'}]},
            format='json',
        )
        assert r.status_code == status.HTTP_200_OK
        inv_a.refresh_from_db()
        assert inv_a.status == 'paid', \
            'Invoice do customer correto deveria ter sido marcada como paga'
