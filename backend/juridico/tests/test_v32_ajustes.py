"""v32 ajustes (doc 09 itens 05/06/07) — Jurídico.

Cobre:
- Item 05: signal do contrato VINCULA onboarding + proposta aprovada
  (a mais recente); cria mesmo sem proposta; dry_run reporta os vínculos.
- Item 06: LegalCaseEvent (timeline) gravado na criação automática e em cada
  transição (status_change / signed / rejected); serializer expõe events +
  painéis onboarding_data/proposal_data.
- Item 07: modalidade Aditivo — colunas Nova solicitação → Preparação →
  Aguardando → Assinado/Recusado; saídas pro Financeiro (pré-cadastro pendente
  na criação, ativação no assinado, cancelamento no recusado) atrás da flag
  AUTOMATION_FIN_ADITIVO; idempotência.
"""
import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from core.models import AuditLog
from finance.models import Invoice
from juridico.models import LegalCase, LegalCaseEvent
from projects.models import ChangeRequest, Project
from sales.models import ClientOnboarding, Customer, Proposal, Prospect

User = get_user_model()

URL = '/api/v1/juridico/legal-cases/'


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin_ajustes', email='admin@ajustes.com',
        password='admin_pass_123', role='admin',
    )


@pytest.fixture
def juridico_operator(db):
    return User.objects.create_user(
        username='juridico_ajustes', email='juridico@ajustes.com',
        password='juridico_pass_123', role='operator', sectors=['juridico'],
    )


@pytest.fixture
def juridico_client(juridico_operator):
    client = APIClient()
    client.force_authenticate(user=juridico_operator)
    return client


@pytest.fixture
def customer(admin_user):
    return Customer.objects.create(
        company_name='Cliente Ajustes LTDA',
        email='cliente@ajustes.com',
        created_by=admin_user,
    )


def make_prospect(user, customer=None):
    return Prospect.objects.create(
        company_name='Prospect Ajustes Co',
        contact_name='Contato Ajustes',
        contact_email='prospect@ajustes.com',
        source='website',
        status='data_collection',
        customer=customer,
        created_by=user,
    )


def make_proposal(user, prospect=None, customer=None, status='approved'):
    return Proposal.objects.create(
        prospect=prospect, customer=customer,
        number=f'P-{uuid.uuid4().hex[:12]}',
        title='Proposta Ajustes', proposal_type='software_dev',
        billing_type='fixed', total_value=Decimal('15000'),
        status=status, valid_until=date.today() + timedelta(days=30),
        created_by=user,
    )


def make_onboarding(user, prospect, customer=None, status='pending'):
    return ClientOnboarding.objects.create(
        prospect=prospect, customer=customer, status=status, created_by=user,
    )


def make_case(customer, user=None, **kwargs):
    defaults = dict(
        customer=customer, process_type='contrato', source='comercial',
        created_by=user,
    )
    defaults.update(kwargs)
    return LegalCase.objects.create(**defaults)


# ─── Item 05: vínculo onboarding + proposta no signal do contrato ────────────

@pytest.mark.django_db
class TestContratoLinksOnboardingAndProposal:
    def test_links_onboarding_and_latest_approved_proposal(self, settings, admin_user, customer):
        settings.AUTOMATION_JURIDICO_CONTRATO = 'on'
        prospect = make_prospect(admin_user, customer=customer)
        # Duas propostas aprovadas — vincula a mais recente.
        make_proposal(admin_user, prospect=prospect)
        newest = make_proposal(admin_user, prospect=prospect)
        onboarding = make_onboarding(admin_user, prospect, customer=customer)
        onboarding.status = 'submitted'
        onboarding.save()

        case = LegalCase.objects.get(process_type='contrato')
        assert case.onboarding_id == onboarding.id
        assert case.proposal_id == newest.id

    def test_ignores_non_approved_proposal(self, settings, admin_user, customer):
        settings.AUTOMATION_JURIDICO_CONTRATO = 'on'
        prospect = make_prospect(admin_user, customer=customer)
        make_proposal(admin_user, prospect=prospect, status='draft')
        onboarding = make_onboarding(admin_user, prospect, customer=customer)
        onboarding.status = 'submitted'
        onboarding.save()

        case = LegalCase.objects.get(process_type='contrato')
        assert case.onboarding_id == onboarding.id
        assert case.proposal_id is None

    def test_creates_without_proposal(self, settings, admin_user, customer):
        settings.AUTOMATION_JURIDICO_CONTRATO = 'on'
        prospect = make_prospect(admin_user, customer=customer)
        onboarding = make_onboarding(admin_user, prospect, customer=customer)
        onboarding.status = 'submitted'
        onboarding.save()

        case = LegalCase.objects.get(process_type='contrato')
        assert case.onboarding_id == onboarding.id
        assert case.proposal_id is None

    def test_dry_run_reports_links_without_creating(self, settings, admin_user, customer):
        settings.AUTOMATION_JURIDICO_CONTRATO = 'dry_run'
        prospect = make_prospect(admin_user, customer=customer)
        proposal = make_proposal(admin_user, prospect=prospect)
        onboarding = make_onboarding(admin_user, prospect, customer=customer)
        onboarding.status = 'submitted'
        onboarding.save()

        assert LegalCase.objects.count() == 0
        entry = AuditLog.objects.filter(action='legal_case_auto_create_dry_run').first()
        assert entry is not None
        assert entry.new_value['onboarding'] == onboarding.id
        assert entry.new_value['proposal'] == proposal.id


# ─── Item 06: timeline LegalCaseEvent ────────────────────────────────────────

@pytest.mark.django_db
class TestLegalCaseTimeline:
    def test_created_event_on_automation(self, settings, admin_user, customer):
        settings.AUTOMATION_JURIDICO_CONTRATO = 'on'
        prospect = make_prospect(admin_user, customer=customer)
        onboarding = make_onboarding(admin_user, prospect, customer=customer)
        onboarding.status = 'submitted'
        onboarding.save()

        case = LegalCase.objects.get(process_type='contrato')
        events = case.events.all()
        assert events.count() == 1
        assert events.first().event_type == 'created'

    def test_transition_records_status_change_event(self, juridico_client, customer):
        case = make_case(customer)
        juridico_client.post(f'{URL}{case.id}/transition/', {'status': 'envio_assinatura'})
        ev = case.events.filter(event_type='status_change').first()
        assert ev is not None
        assert ev.from_status == 'preparacao'
        assert ev.to_status == 'envio_assinatura'

    def test_signed_event_preserves_link_and_date(self, juridico_client, customer):
        case = make_case(customer, status='aguardando_assinatura',
                         autentique_link='https://app.autentique.com.br/d/abc')
        juridico_client.post(f'{URL}{case.id}/transition/', {'status': 'assinado'})
        ev = case.events.filter(event_type='signed').first()
        assert ev is not None
        assert ev.autentique_link == 'https://app.autentique.com.br/d/abc'
        assert ev.signed_at is not None

    def test_serializer_exposes_events_and_panels(self, settings, juridico_client, admin_user, customer):
        settings.AUTOMATION_JURIDICO_CONTRATO = 'on'
        prospect = make_prospect(admin_user, customer=customer)
        proposal = make_proposal(admin_user, prospect=prospect)
        onboarding = make_onboarding(admin_user, prospect, customer=customer)
        onboarding.company_legal_name = 'Razão Social Teste'
        onboarding.status = 'submitted'
        onboarding.save()

        case = LegalCase.objects.get(process_type='contrato')
        resp = juridico_client.get(f'{URL}{case.id}/')
        assert resp.status_code == status.HTTP_200_OK
        assert len(resp.data['events']) == 1
        assert resp.data['onboarding_data']['company_legal_name'] == 'Razão Social Teste'
        assert resp.data['proposal_data']['number'] == proposal.number


# ─── Item 07: modalidade Aditivo (colunas + saídas pro Financeiro) ───────────

def make_aditivo(customer, user, project=None, status='nova_solicitacao'):
    return LegalCase.objects.create(
        customer=customer, process_type='aditivo', source='producao',
        status=status, project=project, created_by=user,
    )


def make_project_with_cr(user, customer, impact_value=Decimal('2500')):
    project = Project.objects.create(
        name='Projeto Aditivo', customer=customer,
        start_date=date(2026, 6, 1), created_by=user,
    )
    ChangeRequest.objects.create(
        project=project, title='Mudança X', description='Nova feature',
        impact_hours=Decimal('20'), impact_value=impact_value,
        status='pending', created_by=user,
    )
    return project


@pytest.mark.django_db
class TestAditivoColumns:
    def test_aditivo_status_order(self):
        assert LegalCase.status_order_for('aditivo') == [
            'nova_solicitacao', 'preparacao', 'aguardando_assinatura', 'assinado',
        ]

    @pytest.mark.parametrize('from_status,to_status', [
        ('nova_solicitacao', 'preparacao'),
        ('preparacao', 'aguardando_assinatura'),
        ('aguardando_assinatura', 'assinado'),
    ])
    def test_valid_aditivo_transitions(self, settings, juridico_client, customer,
                                       admin_user, from_status, to_status):
        settings.AUTOMATION_FIN_ADITIVO = 'off'  # isola saídas neste teste
        case = make_aditivo(customer, admin_user, status=from_status)
        resp = juridico_client.post(f'{URL}{case.id}/transition/', {'status': to_status})
        assert resp.status_code == status.HTTP_200_OK, resp.data
        case.refresh_from_db()
        assert case.status == to_status

    def test_aditivo_can_be_refused_from_aguardando(self, settings, juridico_client,
                                                    customer, admin_user):
        settings.AUTOMATION_FIN_ADITIVO = 'off'
        case = make_aditivo(customer, admin_user, status='aguardando_assinatura')
        resp = juridico_client.post(f'{URL}{case.id}/transition/', {'status': 'recusado'})
        assert resp.status_code == status.HTTP_200_OK, resp.data
        case.refresh_from_db()
        assert case.status == 'recusado'
        assert case.events.filter(event_type='rejected').exists()

    def test_aditivo_cannot_skip_to_assinado(self, settings, juridico_client,
                                             customer, admin_user):
        settings.AUTOMATION_FIN_ADITIVO = 'off'
        case = make_aditivo(customer, admin_user, status='nova_solicitacao')
        resp = juridico_client.post(f'{URL}{case.id}/transition/', {'status': 'assinado'})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        case.refresh_from_db()
        assert case.status == 'nova_solicitacao'

    def test_terminal_recusado_blocks_transition(self, settings, juridico_client,
                                                 customer, admin_user):
        settings.AUTOMATION_FIN_ADITIVO = 'off'
        case = make_aditivo(customer, admin_user, status='recusado')
        resp = juridico_client.post(f'{URL}{case.id}/transition/', {'status': 'preparacao'})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST


def make_validacao(customer, user, status='preparacao'):
    return LegalCase.objects.create(
        customer=customer, process_type='validacao_documento', source='producao',
        status=status, created_by=user,
    )


@pytest.mark.django_db
class TestValidacaoColumns:
    """Validação (doc 06): 5ª coluna `aprovado_dev` deve ser alcançável a partir
    de `assinado` — `assinado` é terminal só p/ Contrato/Aditivo, não p/ Validação.
    """

    def test_validacao_status_order(self):
        assert LegalCase.status_order_for('validacao_documento') == [
            'preparacao', 'envio_assinatura', 'aguardando_assinatura',
            'assinado', 'aprovado_dev',
        ]

    def test_assinado_advances_to_aprovado_dev(self, juridico_client, customer, admin_user):
        case = make_validacao(customer, admin_user, status='assinado')
        resp = juridico_client.post(f'{URL}{case.id}/transition/', {'status': 'aprovado_dev'})
        assert resp.status_code == status.HTTP_200_OK, resp.data
        case.refresh_from_db()
        assert case.status == 'aprovado_dev'
        assert case.events.filter(event_type='status_change',
                                  to_status='aprovado_dev').exists()

    def test_aprovado_dev_is_terminal(self, juridico_client, customer, admin_user):
        case = make_validacao(customer, admin_user, status='aprovado_dev')
        resp = juridico_client.post(f'{URL}{case.id}/transition/', {'status': 'preparacao'})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        case.refresh_from_db()
        assert case.status == 'aprovado_dev'

    def test_validacao_cannot_skip_to_aprovado_dev(self, juridico_client, customer, admin_user):
        case = make_validacao(customer, admin_user, status='aguardando_assinatura')
        resp = juridico_client.post(f'{URL}{case.id}/transition/', {'status': 'aprovado_dev'})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        case.refresh_from_db()
        assert case.status == 'aguardando_assinatura'

    def test_contrato_assinado_remains_terminal(self, juridico_client, customer, admin_user):
        # Regressão: `assinado` continua terminal para Contrato (não vaza p/ aprovado_dev).
        case = make_case(customer, admin_user, status='assinado')
        resp = juridico_client.post(f'{URL}{case.id}/transition/', {'status': 'aprovado_dev'})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        case.refresh_from_db()
        assert case.status == 'assinado'


@pytest.mark.django_db
class TestAditivoFinanceOutputs:
    def test_precadastro_on_creation_when_on(self, settings, admin_user, customer):
        settings.AUTOMATION_FIN_ADITIVO = 'on'
        project = make_project_with_cr(admin_user, customer, Decimal('2500'))
        case = make_aditivo(customer, admin_user, project=project)
        inv = Invoice.objects.get(payment_details__aditivo_legal_case=case.id)
        assert inv.status == 'pending'
        assert inv.cobranca_liberada is False
        assert inv.total == Decimal('2500')

    def test_precadastro_dry_run_does_not_create_but_audits(self, settings, admin_user, customer):
        settings.AUTOMATION_FIN_ADITIVO = 'dry_run'
        project = make_project_with_cr(admin_user, customer)
        case = make_aditivo(customer, admin_user, project=project)
        assert not Invoice.objects.filter(payment_details__aditivo_legal_case=case.id).exists()
        assert AuditLog.objects.filter(action='aditivo_precadastro_dry_run').exists()

    def test_precadastro_off_does_nothing(self, settings, admin_user, customer):
        settings.AUTOMATION_FIN_ADITIVO = 'off'
        project = make_project_with_cr(admin_user, customer)
        case = make_aditivo(customer, admin_user, project=project)
        assert not Invoice.objects.filter(payment_details__aditivo_legal_case=case.id).exists()

    def test_precadastro_idempotent(self, settings, admin_user, customer):
        settings.AUTOMATION_FIN_ADITIVO = 'on'
        project = make_project_with_cr(admin_user, customer)
        case = make_aditivo(customer, admin_user, project=project)
        case.notes = 'resave'
        case.save()  # re-save não duplica
        assert Invoice.objects.filter(payment_details__aditivo_legal_case=case.id).count() == 1

    def test_no_invoice_without_value(self, settings, admin_user, customer):
        settings.AUTOMATION_FIN_ADITIVO = 'on'
        project = Project.objects.create(
            name='Proj sem CR', customer=customer,
            start_date=date(2026, 6, 1), created_by=admin_user,
        )
        case = make_aditivo(customer, admin_user, project=project)
        assert not Invoice.objects.filter(payment_details__aditivo_legal_case=case.id).exists()

    def test_signed_activates_charge(self, settings, juridico_client, admin_user, customer):
        settings.AUTOMATION_FIN_ADITIVO = 'on'
        project = make_project_with_cr(admin_user, customer)
        # Nasce em nova_solicitacao (pré-cadastra), depois sobe até aguardando.
        case = make_aditivo(customer, admin_user, project=project)
        case.status = 'aguardando_assinatura'
        case.save()  # update, não dispara o pré-cadastro de novo
        juridico_client.post(f'{URL}{case.id}/transition/', {'status': 'assinado'})
        inv = Invoice.objects.get(payment_details__aditivo_legal_case=case.id)
        assert inv.cobranca_liberada is True
        assert AuditLog.objects.filter(action='aditivo_cobranca_ativada').exists()

    def test_refused_cancels_precadastro(self, settings, juridico_client, admin_user, customer):
        settings.AUTOMATION_FIN_ADITIVO = 'on'
        project = make_project_with_cr(admin_user, customer)
        case = make_aditivo(customer, admin_user, project=project)
        case.status = 'aguardando_assinatura'
        case.save()
        juridico_client.post(f'{URL}{case.id}/transition/', {'status': 'recusado'})
        inv = Invoice.objects.get(payment_details__aditivo_legal_case=case.id)
        assert inv.status == 'cancelled'
        assert AuditLog.objects.filter(action='aditivo_precadastro_cancelado').exists()


# ─── P1.5: Aditivo assinado aprova o ChangeRequest vinculado ─────────────────

@pytest.mark.django_db
class TestAditivoApprovesChangeRequest:
    """P1.5 (doc 09 §T-E2E): assinar o aditivo marca o ChangeRequest como
    `approved` ("Mudança Aprovada") com approved_at/by de sistema, contornando
    o self-approval guard (é a automação, não o criador)."""

    def _signed_aditivo(self, juridico_client, customer, admin_user, project):
        case = make_aditivo(customer, admin_user, project=project)
        case.status = 'aguardando_assinatura'
        case.save()
        juridico_client.post(f'{URL}{case.id}/transition/', {'status': 'assinado'})
        return case

    def test_signed_approves_change_request(self, settings, juridico_client,
                                            admin_user, customer):
        settings.AUTOMATION_FIN_ADITIVO = 'on'
        project = make_project_with_cr(admin_user, customer)
        cr = ChangeRequest.objects.get(project=project)
        self._signed_aditivo(juridico_client, customer, admin_user, project)
        cr.refresh_from_db()
        assert cr.status == 'approved'
        assert cr.approved_at is not None
        assert AuditLog.objects.filter(action='change_request_auto_approve').exists()

    def test_bypasses_self_approval_guard(self, settings, customer, admin_user):
        """A automação aprova mesmo quando o usuário é o criador do CR — o
        guard de self-approval só vale para a action manual approve."""
        settings.AUTOMATION_FIN_ADITIVO = 'on'
        from juridico.services import approve_change_request_for_aditivo
        project = make_project_with_cr(admin_user, customer)
        cr = ChangeRequest.objects.get(project=project)
        assert cr.created_by_id == admin_user.id  # mesmo usuário
        case = make_aditivo(customer, admin_user, project=project, status='aguardando_assinatura')
        approve_change_request_for_aditivo(case, user=admin_user)
        cr.refresh_from_db()
        assert cr.status == 'approved'
        assert cr.approved_by_id == admin_user.id

    def test_resolves_cr_via_event_metadata(self, settings, customer, admin_user):
        """Vínculo preferencial: change_request na metadata do evento de criação
        (como o produtor de Produção grava). Usa esse CR mesmo com outro pending
        no projeto."""
        settings.AUTOMATION_FIN_ADITIVO = 'on'
        from juridico.services import approve_change_request_for_aditivo
        project = make_project_with_cr(admin_user, customer)
        linked = ChangeRequest.objects.create(
            project=project, title='Mudança vinculada', description='x',
            impact_value=Decimal('100'), status='pending', created_by=admin_user,
        )
        case = make_aditivo(customer, admin_user, project=project,
                            status='aguardando_assinatura')
        case.record_event('created', metadata={'change_request': linked.id})
        approve_change_request_for_aditivo(case, user=admin_user)
        linked.refresh_from_db()
        assert linked.status == 'approved'

    def test_idempotent_already_approved(self, settings, customer, admin_user):
        settings.AUTOMATION_FIN_ADITIVO = 'on'
        from juridico.services import approve_change_request_for_aditivo
        project = make_project_with_cr(admin_user, customer)
        cr = ChangeRequest.objects.get(project=project)
        case = make_aditivo(customer, admin_user, project=project,
                            status='aguardando_assinatura')
        assert approve_change_request_for_aditivo(case, user=admin_user) == cr.id
        # 2ª chamada: já approved -> no-op, sem novo audit.
        assert approve_change_request_for_aditivo(case, user=admin_user) is None
        assert AuditLog.objects.filter(action='change_request_auto_approve').count() == 1

    def test_dry_run_does_not_approve(self, settings, customer, admin_user):
        settings.AUTOMATION_FIN_ADITIVO = 'dry_run'
        from juridico.services import approve_change_request_for_aditivo
        project = make_project_with_cr(admin_user, customer)
        cr = ChangeRequest.objects.get(project=project)
        case = make_aditivo(customer, admin_user, project=project,
                            status='aguardando_assinatura')
        approve_change_request_for_aditivo(case, user=admin_user)
        cr.refresh_from_db()
        assert cr.status == 'pending'
        assert AuditLog.objects.filter(action='change_request_auto_approve_dry_run').exists()

    def test_off_does_nothing(self, settings, customer, admin_user):
        settings.AUTOMATION_FIN_ADITIVO = 'off'
        from juridico.services import approve_change_request_for_aditivo
        project = make_project_with_cr(admin_user, customer)
        cr = ChangeRequest.objects.get(project=project)
        case = make_aditivo(customer, admin_user, project=project,
                            status='aguardando_assinatura')
        assert approve_change_request_for_aditivo(case, user=admin_user) is None
        cr.refresh_from_db()
        assert cr.status == 'pending'

    def test_no_cr_no_error(self, settings, customer, admin_user):
        settings.AUTOMATION_FIN_ADITIVO = 'on'
        from juridico.services import approve_change_request_for_aditivo
        project = Project.objects.create(
            name='Proj sem CR p1.5', customer=customer,
            start_date=date(2026, 6, 1), created_by=admin_user,
        )
        case = make_aditivo(customer, admin_user, project=project,
                            status='aguardando_assinatura')
        assert approve_change_request_for_aditivo(case, user=admin_user) is None
