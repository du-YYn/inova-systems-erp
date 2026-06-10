"""v32 F4 (Financeiro) — testes das automações de cobrança.

Cobre (doc processo-v32/03-financeiro.md §3):
01° Pré-cadastro: service idempotente + signal ClientOnboarding submitted
    atrás da flag AUTOMATION_FIN_PRECADASTRO (off/dry_run/on)
02° Liberação de cobrança: LegalCase(contrato) assinado -> cobranca_liberada
    atrás da flag AUTOMATION_FIN_LIBERA_COBRANCA + log_audit
03° Evento entrada paga: Invoice da entrada -> paid emite evento interno
    (events.on_entrada_paga) atrás da flag AUTOMATION_FIN_ENTRADA_PAGA,
    com hook lazy projects.receivers.entrada_paga
04° Régua de cobrança: task dunning_reminders (a vencer 3d, vencida 1/7d)
    atrás da flag AUTOMATION_FIN_REGUA
05° Filtro no envio (mark_sent) + campo billing_cycle do serializer
"""
import sys
import types
import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from core.models import AuditLog
from finance import events
from finance.models import BankAccount, Invoice
from finance.serializers import InvoiceSerializer
from finance.services import (
    liberar_cobranca_do_cliente, precadastrar_invoice_da_proposta,
)
from finance.tasks import dunning_reminders
from juridico.models import LegalCase
from notifications.models import Notification
from sales.models import (
    ClientOnboarding, Customer, Proposal, ProposalPaymentPlan, Prospect,
)

User = get_user_model()

INVOICES_URL = '/api/v1/finance/invoices/'


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin_f4', email='admin@f4test.com',
        password='admin_pass_123', role='admin',
    )


@pytest.fixture
def admin_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def customer(admin_user):
    return Customer.objects.create(
        company_name='Cliente F4 LTDA',
        email='cliente@f4test.com',
        created_by=admin_user,
    )


@pytest.fixture
def prospect(admin_user, customer):
    return Prospect.objects.create(
        customer=customer,
        company_name='Cliente F4 LTDA',
        contact_name='Contato F4',
        contact_email='contato@f4test.com',
        source='website',
        status='data_collection',
        created_by=admin_user,
    )


def make_proposal(prospect, user, plan_kwargs=None, **kwargs):
    defaults = dict(
        prospect=prospect,
        number=f'PROP-{uuid.uuid4().hex[:8]}',
        title='Proposta F4',
        proposal_type='software_dev',
        billing_type='fixed',
        total_value=Decimal('10000'),
        status='approved',
        valid_until=date.today() + timedelta(days=30),
        created_by=user,
    )
    defaults.update(kwargs)
    proposal = Proposal.objects.create(**defaults)
    plan_defaults = dict(
        proposal=proposal,
        plan_type='setup_plus_recurring',
        one_time_amount=Decimal('6000'),
        one_time_method='pix',
        one_time_installments=2,
        one_time_first_due=date(2026, 7, 10),
        recurring_amount=Decimal('1500'),
        recurring_method='boleto',
        recurring_duration_months=3,
        recurring_first_due=date(2026, 8, 5),
    )
    plan_defaults.update(plan_kwargs or {})
    ProposalPaymentPlan.objects.create(**plan_defaults)
    return proposal


@pytest.fixture
def approved_proposal(prospect, admin_user):
    return make_proposal(prospect, admin_user)


def make_onboarding(prospect, user, customer=None, status='pending'):
    return ClientOnboarding.objects.create(
        prospect=prospect, customer=customer, status=status, created_by=user,
    )


def make_invoice(user, customer=None, **kwargs):
    defaults = dict(
        invoice_type='receivable',
        number=f'TST-{uuid.uuid4().hex[:8]}',
        customer=customer,
        issue_date=date.today(),
        due_date=date.today(),
        value=Decimal('100'),
        total=Decimal('100'),
        status='pending',
        created_by=user,
    )
    defaults.update(kwargs)
    return Invoice.objects.create(**defaults)


# ─── 01° Pré-cadastro: service ───────────────────────────────────────────────

@pytest.mark.django_db
class TestPrecadastroService:
    def test_creates_invoices_from_setup_plus_recurring_plan(
        self, prospect, approved_proposal, customer,
    ):
        created = precadastrar_invoice_da_proposta(prospect)
        # 2 parcelas one_time + 3 mensalidades
        assert len(created) == 5
        for inv in created:
            assert inv.invoice_type == 'receivable'
            assert inv.status == 'pending'
            assert inv.precadastro_origem == prospect
            assert inv.cobranca_liberada is False
            assert inv.customer == customer

        entrada = created[0]
        assert entrada.payment_details['precadastro_role'] == 'entrada'
        assert entrada.total == Decimal('3000.00')
        assert entrada.due_date == date(2026, 7, 10)
        assert 'Entrada' in entrada.description

        parcela = created[1]
        assert parcela.payment_details['precadastro_role'] == 'parcela'
        assert parcela.due_date == date(2026, 8, 10)

        mensalidades = created[2:]
        assert all(
            inv.payment_details['precadastro_role'] == 'recorrente'
            for inv in mensalidades
        )
        assert [inv.due_date for inv in mensalidades] == [
            date(2026, 8, 5), date(2026, 9, 5), date(2026, 10, 5),
        ]
        assert all(inv.total == Decimal('1500') for inv in mensalidades)

        entry = AuditLog.objects.filter(action='invoice_precadastro_create').first()
        assert entry is not None
        assert entry.new_value['prospect'] == prospect.id
        assert len(entry.new_value['invoices']) == 5

    def test_is_idempotent(self, prospect, approved_proposal):
        first = precadastrar_invoice_da_proposta(prospect)
        second = precadastrar_invoice_da_proposta(prospect)
        assert len(first) == 5
        assert second == []
        assert Invoice.objects.filter(precadastro_origem=prospect).count() == 5

    def test_installments_rounding_preserves_total(self, prospect, admin_user):
        make_proposal(prospect, admin_user, plan_kwargs={
            'plan_type': 'one_time',
            'one_time_amount': Decimal('1000'),
            'one_time_installments': 3,
            'recurring_amount': Decimal('0'),
        })
        created = precadastrar_invoice_da_proposta(prospect)
        assert len(created) == 3
        assert sum(inv.total for inv in created) == Decimal('1000.00')
        assert created[0].payment_details['precadastro_role'] == 'entrada'
        assert created[1].payment_details['precadastro_role'] == 'parcela'

    def test_recurring_only_first_invoice_is_entrada(self, prospect, admin_user):
        make_proposal(prospect, admin_user, plan_kwargs={
            'plan_type': 'recurring_only',
            'one_time_amount': Decimal('0'),
            'recurring_amount': Decimal('900'),
            'recurring_duration_months': 2,
        })
        created = precadastrar_invoice_da_proposta(prospect)
        assert len(created) == 2
        assert created[0].payment_details['precadastro_role'] == 'entrada'
        assert created[1].payment_details['precadastro_role'] == 'recorrente'

    def test_no_approved_proposal_creates_nothing(self, prospect):
        assert precadastrar_invoice_da_proposta(prospect) == []
        assert Invoice.objects.count() == 0

    def test_draft_proposal_is_ignored(self, prospect, admin_user):
        make_proposal(prospect, admin_user, status='draft')
        assert precadastrar_invoice_da_proposta(prospect) == []

    def test_no_customer_creates_nothing(self, admin_user):
        orphan = Prospect.objects.create(
            company_name='Sem Cliente F4',
            contact_name='Contato',
            source='website',
            status='data_collection',
            created_by=admin_user,
        )
        make_proposal(orphan, admin_user)
        assert precadastrar_invoice_da_proposta(orphan) == []

    def test_dry_run_returns_plan_without_writing(
        self, prospect, approved_proposal,
    ):
        planned = precadastrar_invoice_da_proposta(prospect, dry_run=True)
        assert len(planned) == 5
        assert planned[0]['role'] == 'entrada'
        assert Invoice.objects.count() == 0


# ─── 01° Pré-cadastro: signal do onboarding (flags) ──────────────────────────

@pytest.mark.django_db
class TestPrecadastroTrigger:
    def submit(self, prospect, admin_user, customer):
        onboarding = make_onboarding(prospect, admin_user, customer=customer)
        onboarding.status = 'submitted'
        onboarding.save()
        return onboarding

    def test_dry_run_does_not_create_but_audits(
        self, settings, prospect, approved_proposal, admin_user, customer,
    ):
        settings.AUTOMATION_FIN_PRECADASTRO = 'dry_run'
        self.submit(prospect, admin_user, customer)
        assert Invoice.objects.count() == 0
        entry = AuditLog.objects.filter(
            action='invoice_precadastro_dry_run',
        ).first()
        assert entry is not None
        assert entry.new_value['dry_run'] is True
        assert len(entry.new_value['invoices']) == 5

    def test_off_does_nothing(
        self, settings, prospect, approved_proposal, admin_user, customer,
    ):
        settings.AUTOMATION_FIN_PRECADASTRO = 'off'
        self.submit(prospect, admin_user, customer)
        assert Invoice.objects.count() == 0
        assert not AuditLog.objects.filter(
            action__startswith='invoice_precadastro',
        ).exists()

    def test_on_creates_invoices(
        self, settings, prospect, approved_proposal, admin_user, customer,
    ):
        settings.AUTOMATION_FIN_PRECADASTRO = 'on'
        self.submit(prospect, admin_user, customer)
        assert Invoice.objects.filter(precadastro_origem=prospect).count() == 5

    def test_on_is_idempotent_on_resave(
        self, settings, prospect, approved_proposal, admin_user, customer,
    ):
        settings.AUTOMATION_FIN_PRECADASTRO = 'on'
        onboarding = self.submit(prospect, admin_user, customer)
        onboarding.save()  # re-save com mesmo status
        assert Invoice.objects.filter(precadastro_origem=prospect).count() == 5

    def test_pending_status_does_not_fire(
        self, settings, prospect, approved_proposal, admin_user, customer,
    ):
        settings.AUTOMATION_FIN_PRECADASTRO = 'on'
        make_onboarding(prospect, admin_user, customer=customer)
        assert Invoice.objects.count() == 0


# ─── 02° Liberação de cobrança ───────────────────────────────────────────────

@pytest.mark.django_db
class TestLiberacaoCobranca:
    def sign_contract(self, customer):
        case = LegalCase.objects.create(
            customer=customer, process_type='contrato',
            status='aguardando_assinatura',
        )
        case.status = 'assinado'
        case.save()
        return case

    def test_on_liberates_pending_invoices_and_audits(
        self, settings, prospect, approved_proposal, customer,
    ):
        settings.AUTOMATION_FIN_LIBERA_COBRANCA = 'on'
        precadastrar_invoice_da_proposta(prospect)
        case = self.sign_contract(customer)
        invoices = Invoice.objects.filter(precadastro_origem=prospect)
        assert invoices.count() == 5
        assert all(inv.cobranca_liberada for inv in invoices)
        entry = AuditLog.objects.filter(
            action='invoice_cobranca_liberada',
        ).first()
        assert entry is not None
        assert entry.old_value['cobranca_liberada'] is False
        assert entry.new_value['cobranca_liberada'] is True
        assert entry.new_value['legal_case'] == case.id

    def test_dry_run_does_not_liberate_but_audits(
        self, settings, prospect, approved_proposal, customer,
    ):
        settings.AUTOMATION_FIN_LIBERA_COBRANCA = 'dry_run'
        precadastrar_invoice_da_proposta(prospect)
        self.sign_contract(customer)
        assert not Invoice.objects.filter(cobranca_liberada=True).exists()
        entry = AuditLog.objects.filter(
            action='invoice_cobranca_liberada_dry_run',
        ).first()
        assert entry is not None
        assert len(entry.new_value['invoices']) == 5

    def test_off_does_nothing(
        self, settings, prospect, approved_proposal, customer,
    ):
        settings.AUTOMATION_FIN_LIBERA_COBRANCA = 'off'
        precadastrar_invoice_da_proposta(prospect)
        self.sign_contract(customer)
        assert not Invoice.objects.filter(cobranca_liberada=True).exists()
        assert not AuditLog.objects.filter(
            action__startswith='invoice_cobranca_liberada',
        ).exists()

    def test_paid_and_cancelled_invoices_are_not_liberated(
        self, settings, admin_user, customer,
    ):
        settings.AUTOMATION_FIN_LIBERA_COBRANCA = 'on'
        paid = make_invoice(admin_user, customer, status='paid')
        cancelled = make_invoice(admin_user, customer, status='cancelled')
        pending = make_invoice(admin_user, customer, status='pending')
        self.sign_contract(customer)
        paid.refresh_from_db()
        cancelled.refresh_from_db()
        pending.refresh_from_db()
        assert paid.cobranca_liberada is False
        assert cancelled.cobranca_liberada is False
        assert pending.cobranca_liberada is True

    def test_aditivo_signed_does_not_liberate(
        self, settings, admin_user, customer,
    ):
        settings.AUTOMATION_FIN_LIBERA_COBRANCA = 'on'
        make_invoice(admin_user, customer, status='pending')
        case = LegalCase.objects.create(
            customer=customer, process_type='aditivo',
            status='aguardando_assinatura',
        )
        case.status = 'assinado'
        case.save()
        assert not Invoice.objects.filter(cobranca_liberada=True).exists()

    def test_signal_is_idempotent_on_resave(
        self, settings, prospect, approved_proposal, customer,
    ):
        settings.AUTOMATION_FIN_LIBERA_COBRANCA = 'on'
        precadastrar_invoice_da_proposta(prospect)
        case = self.sign_contract(customer)
        case.save()  # re-save do caso assinado
        assert AuditLog.objects.filter(
            action='invoice_cobranca_liberada',
        ).count() == 1

    def test_service_returns_liberated_ids(self, admin_user, customer):
        inv = make_invoice(admin_user, customer, status='pending')
        ids = liberar_cobranca_do_cliente(customer)
        assert ids == [inv.id]
        assert liberar_cobranca_do_cliente(customer) == []  # idempotente


# ─── 03° Evento entrada paga ─────────────────────────────────────────────────

def make_entrada(user, customer, prospect, **kwargs):
    defaults = dict(
        precadastro_origem=prospect,
        payment_details={'precadastro_role': 'entrada', 'sequence': 1,
                         'total_installments': 2},
        cobranca_liberada=True,
    )
    defaults.update(kwargs)
    return make_invoice(user, customer, **defaults)


@pytest.mark.django_db
class TestEntradaPagaEvent:
    def test_transition_to_paid_emits_event_when_on(
        self, settings, admin_user, customer, prospect,
    ):
        settings.AUTOMATION_FIN_ENTRADA_PAGA = 'on'
        invoice = make_entrada(admin_user, customer, prospect)
        invoice.status = 'paid'
        invoice.paid_date = date.today()
        invoice.save(update_fields=['status', 'paid_date'])
        entry = AuditLog.objects.filter(
            action='fin_entrada_paga', resource_id=str(invoice.id),
        ).first()
        assert entry is not None
        assert entry.old_value['status'] == 'pending'
        assert entry.new_value['prospect'] == prospect.id
        # F5: o hook projects.receivers.entrada_paga existe agora (era False
        # na F4); com AUTOMATION_PROD_ENTRADA default dry_run não há efeito.
        assert entry.new_value['hook_called'] is True

    def test_dry_run_audits_without_hook(
        self, settings, admin_user, customer, prospect,
    ):
        settings.AUTOMATION_FIN_ENTRADA_PAGA = 'dry_run'
        invoice = make_entrada(admin_user, customer, prospect)
        invoice.status = 'paid'
        invoice.save(update_fields=['status'])
        entry = AuditLog.objects.filter(
            action='fin_entrada_paga_dry_run', resource_id=str(invoice.id),
        ).first()
        assert entry is not None
        assert entry.new_value['dry_run'] is True

    def test_off_does_nothing(self, settings, admin_user, customer, prospect):
        settings.AUTOMATION_FIN_ENTRADA_PAGA = 'off'
        invoice = make_entrada(admin_user, customer, prospect)
        invoice.status = 'paid'
        invoice.save(update_fields=['status'])
        assert not AuditLog.objects.filter(
            action__startswith='fin_entrada_paga',
        ).exists()

    def test_non_entrada_invoice_does_not_emit(
        self, settings, admin_user, customer, prospect,
    ):
        settings.AUTOMATION_FIN_ENTRADA_PAGA = 'on'
        invoice = make_invoice(
            admin_user, customer,
            precadastro_origem=prospect,
            payment_details={'precadastro_role': 'parcela'},
        )
        invoice.status = 'paid'
        invoice.save(update_fields=['status'])
        assert not AuditLog.objects.filter(action='fin_entrada_paga').exists()

    def test_invoice_without_precadastro_does_not_emit(
        self, settings, admin_user, customer,
    ):
        settings.AUTOMATION_FIN_ENTRADA_PAGA = 'on'
        invoice = make_invoice(admin_user, customer)
        invoice.status = 'paid'
        invoice.save(update_fields=['status'])
        assert not AuditLog.objects.filter(action='fin_entrada_paga').exists()

    def test_resave_of_paid_invoice_does_not_emit_twice(
        self, settings, admin_user, customer, prospect,
    ):
        settings.AUTOMATION_FIN_ENTRADA_PAGA = 'on'
        invoice = make_entrada(admin_user, customer, prospect)
        invoice.status = 'paid'
        invoice.save(update_fields=['status'])
        invoice.save(update_fields=['status'])  # paid -> paid
        assert AuditLog.objects.filter(action='fin_entrada_paga').count() == 1

    def test_mark_paid_endpoint_emits_event(
        self, settings, admin_client, admin_user, customer, prospect,
    ):
        settings.AUTOMATION_FIN_ENTRADA_PAGA = 'on'
        bank = BankAccount.objects.create(
            name='Conta F4', bank='Banco F4', account_type='checking',
        )
        invoice = make_entrada(
            admin_user, customer, prospect, bank_account=bank,
        )
        response = admin_client.post(f'{INVOICES_URL}{invoice.id}/mark_paid/')
        assert response.status_code == status.HTTP_200_OK, response.data
        assert AuditLog.objects.filter(
            action='fin_entrada_paga', resource_id=str(invoice.id),
        ).exists()

    def test_on_calls_projects_hook_when_it_exists(
        self, settings, monkeypatch, admin_user, customer, prospect,
    ):
        settings.AUTOMATION_FIN_ENTRADA_PAGA = 'on'
        calls = []
        stub = types.ModuleType('projects.receivers')
        stub.entrada_paga = lambda invoice: calls.append(invoice.id)
        import projects
        monkeypatch.setitem(sys.modules, 'projects.receivers', stub)
        monkeypatch.setattr(projects, 'receivers', stub, raising=False)

        invoice = make_entrada(admin_user, customer, prospect)
        invoice.status = 'paid'
        invoice.save(update_fields=['status'])

        assert calls == [invoice.id]
        entry = AuditLog.objects.filter(action='fin_entrada_paga').first()
        assert entry.new_value['hook_called'] is True

    def test_hook_failure_does_not_break_payment(
        self, settings, monkeypatch, admin_user, customer, prospect,
    ):
        settings.AUTOMATION_FIN_ENTRADA_PAGA = 'on'

        def broken_hook(invoice):
            raise RuntimeError('hook quebrado')

        stub = types.ModuleType('projects.receivers')
        stub.entrada_paga = broken_hook
        import projects
        monkeypatch.setitem(sys.modules, 'projects.receivers', stub)
        monkeypatch.setattr(projects, 'receivers', stub, raising=False)

        invoice = make_entrada(admin_user, customer, prospect)
        invoice.status = 'paid'
        invoice.save(update_fields=['status'])  # não pode levantar exceção
        invoice.refresh_from_db()
        assert invoice.status == 'paid'
        entry = AuditLog.objects.filter(action='fin_entrada_paga').first()
        assert entry.new_value['hook_called'] is False

    def test_is_entrada_helper(self, admin_user, customer, prospect):
        entrada = make_entrada(admin_user, customer, prospect)
        normal = make_invoice(admin_user, customer)
        assert events.is_entrada(entrada) is True
        assert events.is_entrada(normal) is False


# ─── 04° Régua de cobrança ───────────────────────────────────────────────────

@pytest.mark.django_db
class TestDunningReminders:
    def seed(self, admin_user, customer, prospect):
        today = date.today()
        return {
            'due_3d': make_invoice(
                admin_user, customer, due_date=today + timedelta(days=3),
            ),
            'overdue_1d': make_invoice(
                admin_user, customer, due_date=today - timedelta(days=1),
                status='overdue',
            ),
            'overdue_7d': make_invoice(
                admin_user, customer, due_date=today - timedelta(days=7),
            ),
            # Fora das janelas — não lembra
            'overdue_10d': make_invoice(
                admin_user, customer, due_date=today - timedelta(days=10),
            ),
            # Pré-cadastro NÃO liberado — não é enviável, fica fora da régua
            'precadastro_bloqueado': make_invoice(
                admin_user, customer, due_date=today + timedelta(days=3),
                precadastro_origem=prospect,
            ),
            # Pré-cadastro liberado — entra na régua
            'precadastro_liberado': make_invoice(
                admin_user, customer, due_date=today + timedelta(days=3),
                precadastro_origem=prospect, cobranca_liberada=True,
            ),
            # Paga — fora
            'paga': make_invoice(
                admin_user, customer, due_date=today + timedelta(days=3),
                status='paid',
            ),
        }

    def test_dry_run_counts_without_notifications(
        self, settings, admin_user, customer, prospect,
    ):
        settings.AUTOMATION_FIN_REGUA = 'dry_run'
        invoices = self.seed(admin_user, customer, prospect)
        count = dunning_reminders()
        assert count == 4  # due_3d, overdue_1d, overdue_7d, precadastro_liberado
        assert Notification.objects.count() == 0
        entry = AuditLog.objects.filter(
            action='fin_regua_cobranca_dry_run',
        ).first()
        assert entry is not None
        reminded_ids = {r['invoice'] for r in entry.new_value['reminders']}
        assert invoices['precadastro_bloqueado'].id not in reminded_ids
        assert invoices['overdue_10d'].id not in reminded_ids
        assert invoices['due_3d'].id in reminded_ids

    def test_on_creates_notifications_for_admins(
        self, settings, admin_user, customer, prospect,
    ):
        settings.AUTOMATION_FIN_REGUA = 'on'
        self.seed(admin_user, customer, prospect)
        count = dunning_reminders()
        assert count == 4
        # admin_user é o único admin/manager ativo neste teste
        assert Notification.objects.filter(user=admin_user).count() == 4
        assert AuditLog.objects.filter(action='fin_regua_cobranca').exists()
        overdue_notification = Notification.objects.filter(
            notification_type='invoice_overdue',
        )
        assert overdue_notification.count() == 2  # 1d e 7d

    def test_off_does_nothing(self, settings, admin_user, customer, prospect):
        settings.AUTOMATION_FIN_REGUA = 'off'
        self.seed(admin_user, customer, prospect)
        assert dunning_reminders() == 0
        assert Notification.objects.count() == 0
        assert not AuditLog.objects.filter(
            action__startswith='fin_regua_cobranca',
        ).exists()

    def test_no_invoices_in_windows_returns_zero(
        self, settings, admin_user, customer,
    ):
        settings.AUTOMATION_FIN_REGUA = 'on'
        make_invoice(admin_user, customer, due_date=date.today())
        assert dunning_reminders() == 0


# ─── 05° Filtro no envio (mark_sent) + billing_cycle ─────────────────────────

@pytest.mark.django_db
class TestMarkSentGate:
    def test_precadastro_nao_liberado_cannot_be_sent(
        self, admin_client, admin_user, customer, prospect,
    ):
        invoice = make_invoice(admin_user, customer, precadastro_origem=prospect)
        response = admin_client.post(f'{INVOICES_URL}{invoice.id}/mark_sent/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        invoice.refresh_from_db()
        assert invoice.status == 'pending'

    def test_precadastro_liberado_can_be_sent(
        self, admin_client, admin_user, customer, prospect,
    ):
        invoice = make_invoice(
            admin_user, customer,
            precadastro_origem=prospect, cobranca_liberada=True,
        )
        response = admin_client.post(f'{INVOICES_URL}{invoice.id}/mark_sent/')
        assert response.status_code == status.HTTP_200_OK, response.data
        invoice.refresh_from_db()
        assert invoice.status == 'sent'
        assert AuditLog.objects.filter(
            action='invoice_mark_sent', resource_id=str(invoice.id),
        ).exists()

    def test_invoice_without_precadastro_can_be_sent(
        self, admin_client, admin_user, customer,
    ):
        invoice = make_invoice(admin_user, customer)
        response = admin_client.post(f'{INVOICES_URL}{invoice.id}/mark_sent/')
        assert response.status_code == status.HTTP_200_OK

    def test_paid_invoice_cannot_be_sent(
        self, admin_client, admin_user, customer,
    ):
        invoice = make_invoice(admin_user, customer, status='paid')
        response = admin_client.post(f'{INVOICES_URL}{invoice.id}/mark_sent/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_system_fields_read_only_via_patch(
        self, admin_client, admin_user, customer, prospect,
    ):
        """precadastro_origem/cobranca_liberada não mudam via PATCH."""
        invoice = make_invoice(admin_user, customer, precadastro_origem=prospect)
        response = admin_client.patch(f'{INVOICES_URL}{invoice.id}/', {
            'cobranca_liberada': True,
            'precadastro_origem': None,
        }, format='json')
        assert response.status_code == status.HTTP_200_OK, response.data
        invoice.refresh_from_db()
        assert invoice.cobranca_liberada is False
        assert invoice.precadastro_origem == prospect


@pytest.mark.django_db
class TestBillingCycleField:
    def cycle(self, invoice):
        return InvoiceSerializer(invoice).data['billing_cycle']

    def test_pre_cadastro(self, admin_user, customer, prospect):
        invoice = make_invoice(admin_user, customer, precadastro_origem=prospect)
        assert self.cycle(invoice) == 'pre_cadastro'

    def test_aguardando_assinatura(self, admin_user, customer, prospect):
        LegalCase.objects.create(
            customer=customer, process_type='contrato',
            status='aguardando_assinatura',
        )
        invoice = make_invoice(admin_user, customer, precadastro_origem=prospect)
        assert self.cycle(invoice) == 'aguardando_assinatura'

    def test_cobranca_ativa_quando_liberada(self, admin_user, customer, prospect):
        invoice = make_invoice(
            admin_user, customer,
            precadastro_origem=prospect, cobranca_liberada=True,
        )
        assert self.cycle(invoice) == 'cobranca_ativa'

    def test_cobranca_ativa_sem_precadastro(self, admin_user, customer):
        invoice = make_invoice(admin_user, customer)
        assert self.cycle(invoice) == 'cobranca_ativa'

    def test_paga(self, admin_user, customer, prospect):
        invoice = make_invoice(
            admin_user, customer, precadastro_origem=prospect, status='paid',
        )
        assert self.cycle(invoice) == 'paga'

    def test_payable_and_cancelled_return_none(self, admin_user, customer):
        payable = make_invoice(admin_user, customer, invoice_type='payable')
        cancelled = make_invoice(admin_user, customer, status='cancelled')
        assert self.cycle(payable) is None
        assert self.cycle(cancelled) is None
