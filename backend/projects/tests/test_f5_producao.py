"""v32 F5 (Produção) — testes do processo de Produção (doc 04).

Cobre:
01° Data migration 0005 (status legado → etapa_atual/situacao, reverse noop)
02° Transições de etapa (ordem do enum, bifurcação por tipo, retorno)
03° GATE Dia 0 / REGRA OURO da Etapa 7 (3 critérios → 400 com motivo)
04° Ação marcar-onboarding-realizado (+ dia_zero quando 3 critérios ok)
05° Receivers em dry_run/on: entrada_paga, LegalCase contrato/validação,
    bifurcação → RecurrenceContract (idempotência)
06° Persistência do Game Plan (ScheduleVersion + 6 ProjectPhase datadas)
07° Entidades novas (versão de doc, submit, approve de auditoria)
08° RBAC por setor (matriz doc 08 §7.2 — testes 403 obrigatórios)
"""
import importlib
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from core.models import AuditLog
from finance.models import Invoice
from juridico.models import LegalCase
from projects import receivers
from projects.models import (
    Project, ProjectDocument, ProjectPhase, RecurrenceContract,
    ScheduleVersion, WeeklyUpdate,
)
from sales.models import Customer, Prospect

User = get_user_model()

PROJECTS_URL = '/api/v1/projects/projects/'


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin_f5', email='admin@f5test.com',
        password='admin_pass_123', role='admin',
    )


@pytest.fixture
def producao_user(db):
    return User.objects.create_user(
        username='producao_f5', email='producao@f5test.com',
        password='producao_pass_123', role='operator', sectors=['producao'],
    )


@pytest.fixture
def suporte_user(db):
    return User.objects.create_user(
        username='suporte_f5', email='suporte@f5test.com',
        password='suporte_pass_123', role='operator', sectors=['suporte'],
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username='viewer_f5', email='viewer@f5test.com',
        password='viewer_pass_123', role='viewer',
    )


@pytest.fixture
def partner_user(db):
    return User.objects.create_user(
        username='partner_f5', email='partner@f5test.com',
        password='partner_pass_123', role='partner',
    )


def make_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def producao_client(producao_user):
    return make_client(producao_user)


@pytest.fixture
def admin_client(admin_user):
    return make_client(admin_user)


@pytest.fixture
def customer(admin_user):
    return Customer.objects.create(
        company_name='Cliente F5 LTDA',
        email='cliente@f5test.com',
        created_by=admin_user,
    )


def make_project(user, customer=None, **kwargs):
    defaults = dict(
        name='Projeto F5',
        customer=customer,
        start_date=date(2026, 6, 1),
        created_by=user,
    )
    defaults.update(kwargs)
    return Project.objects.create(**defaults)


@pytest.fixture
def project(admin_user, customer):
    # v32 ajustes: a 1ª etapa passou a ser 'agendar' (default do model). As
    # suites de transição/gate abaixo testam o fluxo a partir de Planejamento,
    # então a fixture começa em etapa_3_preparacao explicitamente; o
    # comportamento da nova etapa 'agendar' é coberto em TestEtapaAgendar.
    return make_project(admin_user, customer, etapa_atual='etapa_3_preparacao')


def make_signed_baseline(project, user):
    return ProjectDocument.objects.create(
        project=project, version=1, status='signed',
        signed_at=timezone.now(), is_current_baseline=True,
        created_by=user,
    )


def satisfy_dev_gate(project, user):
    project.contrato_assinado_at = timezone.now()
    project.entrada_paga_at = timezone.now()
    project.save(update_fields=['contrato_assinado_at', 'entrada_paga_at'])
    make_signed_baseline(project, user)


def make_invoice(user, customer, **kwargs):
    defaults = dict(
        invoice_type='receivable',
        number=f'F5-{Invoice.objects.count() + 1:04d}',
        customer=customer,
        issue_date=date.today(),
        due_date=date.today(),
        value=Decimal('100'),
        total=Decimal('100'),
        status='paid',
        created_by=user,
    )
    defaults.update(kwargs)
    return Invoice.objects.create(**defaults)


# ─── 01° Data migration 0005 ─────────────────────────────────────────────────

@pytest.mark.django_db
class TestDataMigrationStatusToEtapa:
    def _funcs(self):
        module = importlib.import_module(
            'projects.migrations.0005_status_to_etapa_atual_data')
        return module.forward, module.backward

    @pytest.mark.parametrize('legacy,expected_etapa', [
        ('planning', 'etapa_3_preparacao'),
        ('kickoff', 'etapa_3_preparacao'),
        ('requirements', 'etapa_4_onboarding'),
        ('development', 'etapa_7_desenvolvimento'),
        ('testing', 'etapa_8_auditoria'),
        ('deployment', 'registro_entrega'),
        ('completed', 'etapa_10_graduacao'),
    ])
    def test_forward_maps_status_to_etapa(
        self, admin_user, legacy, expected_etapa,
    ):
        from django.apps import apps
        project = make_project(admin_user, status=legacy)
        forward, _ = self._funcs()
        forward(apps, None)
        project.refresh_from_db()
        assert project.etapa_atual == expected_etapa
        assert project.situacao == 'ativo'
        assert project.status == legacy  # legado intocado (F8)

    @pytest.mark.parametrize('legacy,expected_situacao', [
        ('on_hold', 'em_espera'),
        ('cancelled', 'cancelado'),
    ])
    def test_forward_maps_orthogonal_situacao(
        self, admin_user, legacy, expected_situacao,
    ):
        from django.apps import apps
        project = make_project(admin_user, status=legacy)
        forward, _ = self._funcs()
        forward(apps, None)
        project.refresh_from_db()
        assert project.situacao == expected_situacao
        # etapa fica no default — não sabemos onde o projeto parou
        # (v32 ajustes: o default do model é a nova 1ª etapa 'agendar')
        assert project.etapa_atual == 'agendar'

    def test_backward_is_noop_and_status_intact(self, admin_user):
        from django.apps import apps
        project = make_project(admin_user, status='development')
        forward, backward = self._funcs()
        forward(apps, None)
        backward(apps, None)
        project.refresh_from_db()
        assert project.status == 'development'

    def test_forward_is_idempotent(self, admin_user):
        from django.apps import apps
        project = make_project(admin_user, status='testing')
        forward, _ = self._funcs()
        forward(apps, None)
        forward(apps, None)
        project.refresh_from_db()
        assert project.etapa_atual == 'etapa_8_auditoria'


# ─── 02° Transições de etapa ─────────────────────────────────────────────────

@pytest.mark.django_db
class TestEtapaTransitions:
    def test_advance_one_step(self, producao_client, project):
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-etapa/',
            {'etapa': 'etapa_4_onboarding'},
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        project.refresh_from_db()
        assert project.etapa_atual == 'etapa_4_onboarding'
        entry = AuditLog.objects.filter(
            action='project_etapa_transition', resource_id=str(project.id),
        ).first()
        assert entry is not None
        assert entry.old_value == {'etapa_atual': 'etapa_3_preparacao'}
        assert entry.new_value['etapa_atual'] == 'etapa_4_onboarding'

    def test_skipping_steps_fails_400_and_keeps_state(
        self, producao_client, project,
    ):
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-etapa/',
            {'etapa': 'etapa_8_auditoria'},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        project.refresh_from_db()
        assert project.etapa_atual == 'etapa_3_preparacao'

    def test_unknown_etapa_fails_400(self, producao_client, project):
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-etapa/', {'etapa': 'banana'},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_same_etapa_fails_400(self, producao_client, project):
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-etapa/',
            {'etapa': 'etapa_3_preparacao'},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_backward_transition_allowed(self, producao_client, project):
        project.etapa_atual = 'etapa_6_validacao_doc'
        project.save(update_fields=['etapa_atual'])
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-etapa/',
            {'etapa': 'etapa_5_documentacao'},
        )
        assert response.status_code == status.HTTP_200_OK
        project.refresh_from_db()
        assert project.etapa_atual == 'etapa_5_documentacao'

    def test_bifurcation_fechado_goes_to_graduacao(
        self, settings, producao_client, project,
    ):
        settings.AUTOMATION_PROD_RECORRENCIA = 'off'
        project.etapa_atual = 'registro_entrega'
        project.tipo = 'fechado'
        project.save(update_fields=['etapa_atual', 'tipo'])
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-etapa/',
            {'etapa': 'etapa_10_graduacao'},
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        project.refresh_from_db()
        assert project.etapa_atual == 'etapa_10_graduacao'
        assert project.recorrencia_tipo == 'suporte_basico'

    def test_bifurcation_recorrente_goes_to_implementacao(
        self, settings, producao_client, project,
    ):
        settings.AUTOMATION_PROD_RECORRENCIA = 'off'
        project.etapa_atual = 'registro_entrega'
        project.tipo = 'recorrente'
        project.save(update_fields=['etapa_atual', 'tipo'])
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-etapa/',
            {'etapa': 'implementacao'},
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        project.refresh_from_db()
        assert project.etapa_atual == 'implementacao'
        assert project.recorrencia_tipo == 'operacao_continua'

    def test_bifurcation_wrong_branch_fails_400(
        self, producao_client, project,
    ):
        project.etapa_atual = 'registro_entrega'
        project.tipo = 'fechado'
        project.save(update_fields=['etapa_atual', 'tipo'])
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-etapa/',
            {'etapa': 'implementacao'},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        project.refresh_from_db()
        assert project.etapa_atual == 'registro_entrega'

    def test_bifurcation_without_tipo_fails_400(
        self, producao_client, project,
    ):
        project.etapa_atual = 'registro_entrega'
        project.save(update_fields=['etapa_atual'])
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-etapa/',
            {'etapa': 'etapa_10_graduacao'},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_graduacao_converges_to_recorrencia(
        self, settings, producao_client, project,
    ):
        settings.AUTOMATION_PROD_RECORRENCIA = 'off'
        project.etapa_atual = 'etapa_10_graduacao'
        project.tipo = 'fechado'
        project.save(update_fields=['etapa_atual', 'tipo'])
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-etapa/',
            {'etapa': 'recorrencia'},
        )
        assert response.status_code == status.HTTP_200_OK
        project.refresh_from_db()
        assert project.etapa_atual == 'recorrencia'

    def test_set_situacao_keeps_etapa(self, producao_client, project):
        project.etapa_atual = 'etapa_5_documentacao'
        project.save(update_fields=['etapa_atual'])
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-situacao/',
            {'situacao': 'em_espera'},
        )
        assert response.status_code == status.HTTP_200_OK
        project.refresh_from_db()
        assert project.situacao == 'em_espera'
        assert project.etapa_atual == 'etapa_5_documentacao'
        assert AuditLog.objects.filter(
            action='project_situacao_change', resource_id=str(project.id),
        ).exists()

    def test_set_situacao_invalid_400(self, producao_client, project):
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-situacao/', {'situacao': 'xpto'},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ─── 03° GATE Dia 0 / REGRA OURO (Etapa 7) ───────────────────────────────────

@pytest.mark.django_db
class TestDevGate:
    def _at_validacao(self, project):
        project.etapa_atual = 'etapa_6_validacao_doc'
        project.save(update_fields=['etapa_atual'])

    def test_gate_blocks_without_any_criteria(self, producao_client, project):
        self._at_validacao(project)
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-etapa/',
            {'etapa': 'etapa_7_desenvolvimento'},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        body = str(response.data)
        assert 'contrato' in body
        assert 'entrada' in body
        assert 'baseline' in body
        project.refresh_from_db()
        assert project.etapa_atual == 'etapa_6_validacao_doc'

    def test_gate_blocks_without_doc_baseline(
        self, producao_client, project,
    ):
        self._at_validacao(project)
        project.contrato_assinado_at = timezone.now()
        project.entrada_paga_at = timezone.now()
        project.save(update_fields=['contrato_assinado_at', 'entrada_paga_at'])
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-etapa/',
            {'etapa': 'etapa_7_desenvolvimento'},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'baseline' in str(response.data)

    def test_gate_blocks_with_unsigned_document(
        self, producao_client, project, admin_user,
    ):
        self._at_validacao(project)
        project.contrato_assinado_at = timezone.now()
        project.entrada_paga_at = timezone.now()
        project.save(update_fields=['contrato_assinado_at', 'entrada_paga_at'])
        ProjectDocument.objects.create(
            project=project, version=1, status='pending_signature',
            created_by=admin_user,
        )
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-etapa/',
            {'etapa': 'etapa_7_desenvolvimento'},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_gate_passes_with_all_3_criteria(
        self, producao_client, project, admin_user,
    ):
        self._at_validacao(project)
        satisfy_dev_gate(project, admin_user)
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-etapa/',
            {'etapa': 'etapa_7_desenvolvimento'},
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        project.refresh_from_db()
        assert project.etapa_atual == 'etapa_7_desenvolvimento'
        # auditoria registra o snapshot dos 3 critérios no momento do gate
        entry = AuditLog.objects.filter(
            action='project_etapa_transition', resource_id=str(project.id),
        ).first()
        assert entry.new_value.get('gate') is not None


# ─── 04° Onboarding realizado + Dia 0 ────────────────────────────────────────

@pytest.mark.django_db
class TestMarcarOnboardingRealizado:
    def test_sets_timestamp_and_advances_to_etapa_4(
        self, producao_client, project,
    ):
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/marcar-onboarding-realizado/', {},
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        project.refresh_from_db()
        assert project.onboarding_realizado_at is not None
        assert project.etapa_atual == 'etapa_4_onboarding'
        # sem assinatura+pagamento, Dia 0 fica pendente
        assert project.dia_zero is None

    def test_sets_dia_zero_when_signature_and_payment_ok(
        self, producao_client, project,
    ):
        project.contrato_assinado_at = timezone.now()
        project.entrada_paga_at = timezone.now()
        project.save(update_fields=['contrato_assinado_at', 'entrada_paga_at'])
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/marcar-onboarding-realizado/',
            {'data': '2026-06-10'},
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        project.refresh_from_db()
        assert project.dia_zero == date(2026, 6, 10)
        assert AuditLog.objects.filter(
            action='project_dia_zero_set', resource_id=str(project.id),
        ).exists()

    def test_second_call_fails_400(self, producao_client, project):
        producao_client.post(
            f'{PROJECTS_URL}{project.id}/marcar-onboarding-realizado/', {},
        )
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/marcar-onboarding-realizado/', {},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_invalid_date_400(self, producao_client, project):
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/marcar-onboarding-realizado/',
            {'data': '10/06/2026'},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_dia_zero_set_later_when_last_criterion_arrives(
        self, settings, producao_client, project, admin_user, customer,
    ):
        """Onboarding feito antes do pagamento: o Dia 0 nasce quando a
        entrada é paga (receiver), usando a data do onboarding."""
        settings.AUTOMATION_PROD_ENTRADA = 'on'
        project.contrato_assinado_at = timezone.now()
        project.save(update_fields=['contrato_assinado_at'])
        producao_client.post(
            f'{PROJECTS_URL}{project.id}/marcar-onboarding-realizado/',
            {'data': '2026-06-09'},
        )
        project.refresh_from_db()
        assert project.dia_zero is None

        invoice = make_invoice(admin_user, customer)
        receivers.entrada_paga(invoice)
        project.refresh_from_db()
        assert project.entrada_paga_at is not None
        assert project.dia_zero == date(2026, 6, 9)


# ─── 05° Receivers (dry_run / on / off, idempotência) ────────────────────────

@pytest.mark.django_db
class TestEntradaPagaReceiver:
    def test_dry_run_default_logs_without_effect(
        self, project, admin_user, customer,
    ):
        invoice = make_invoice(admin_user, customer)
        receivers.entrada_paga(invoice)
        project.refresh_from_db()
        assert project.entrada_paga_at is None
        entry = AuditLog.objects.filter(
            action='project_entrada_paga_dry_run',
            resource_id=str(project.id),
        ).first()
        assert entry is not None
        assert entry.new_value['dry_run'] is True

    def test_off_does_nothing(self, settings, project, admin_user, customer):
        settings.AUTOMATION_PROD_ENTRADA = 'off'
        invoice = make_invoice(admin_user, customer)
        receivers.entrada_paga(invoice)
        project.refresh_from_db()
        assert project.entrada_paga_at is None
        assert not AuditLog.objects.filter(
            action__startswith='project_entrada_paga').exists()

    def test_on_marks_most_recent_early_project(
        self, settings, admin_user, customer,
    ):
        settings.AUTOMATION_PROD_ENTRADA = 'on'
        older = make_project(admin_user, customer, name='Antigo')
        newer = make_project(admin_user, customer, name='Novo')
        invoice = make_invoice(admin_user, customer)
        receivers.entrada_paga(invoice)
        older.refresh_from_db()
        newer.refresh_from_db()
        assert newer.entrada_paga_at is not None
        assert older.entrada_paga_at is None
        assert AuditLog.objects.filter(
            action='project_entrada_paga', resource_id=str(newer.id),
        ).exists()

    def test_on_skips_projects_past_etapa_4(
        self, settings, admin_user, customer,
    ):
        settings.AUTOMATION_PROD_ENTRADA = 'on'
        project = make_project(
            admin_user, customer, etapa_atual='etapa_7_desenvolvimento')
        invoice = make_invoice(admin_user, customer)
        receivers.entrada_paga(invoice)
        project.refresh_from_db()
        assert project.entrada_paga_at is None

    def test_on_is_idempotent(self, settings, project, admin_user, customer):
        settings.AUTOMATION_PROD_ENTRADA = 'on'
        invoice = make_invoice(admin_user, customer)
        receivers.entrada_paga(invoice)
        project.refresh_from_db()
        first = project.entrada_paga_at
        receivers.entrada_paga(invoice)
        project.refresh_from_db()
        assert project.entrada_paga_at == first
        assert AuditLog.objects.filter(
            action='project_entrada_paga').count() == 1


@pytest.mark.django_db
class TestLegalCaseReceivers:
    def _signed_case(self, customer, process_type, project=None, **kwargs):
        return LegalCase.objects.create(
            customer=customer, project=project, process_type=process_type,
            status='assinado', signed_at=timezone.now(), **kwargs,
        )

    def test_contrato_dry_run_default_no_effect(self, project, customer):
        self._signed_case(customer, 'contrato')
        project.refresh_from_db()
        assert project.contrato_assinado_at is None
        assert AuditLog.objects.filter(
            action='project_contrato_assinado_dry_run').exists()

    def test_contrato_on_sets_contrato_assinado_at(
        self, settings, project, customer,
    ):
        settings.AUTOMATION_PROD_CONTRATO_ASSINADO = 'on'
        case = self._signed_case(customer, 'contrato')
        project.refresh_from_db()
        assert project.contrato_assinado_at == case.signed_at
        assert AuditLog.objects.filter(
            action='project_contrato_assinado', resource_id=str(project.id),
        ).exists()

    def test_contrato_on_idempotent_on_resave(
        self, settings, project, customer,
    ):
        settings.AUTOMATION_PROD_CONTRATO_ASSINADO = 'on'
        case = self._signed_case(customer, 'contrato')
        case.save()  # re-save do caso assinado não duplica efeito
        assert AuditLog.objects.filter(
            action='project_contrato_assinado').count() == 1

    def test_contrato_non_signed_status_ignored(
        self, settings, project, customer,
    ):
        settings.AUTOMATION_PROD_CONTRATO_ASSINADO = 'on'
        LegalCase.objects.create(
            customer=customer, process_type='contrato', status='preparacao',
        )
        project.refresh_from_db()
        assert project.contrato_assinado_at is None

    def test_validacao_on_signs_document_and_sets_baseline(
        self, settings, project, customer, admin_user,
    ):
        settings.AUTOMATION_PROD_DOC_ASSINADA = 'on'
        old_baseline = ProjectDocument.objects.create(
            project=project, version=1, status='signed',
            signed_at=timezone.now(), is_current_baseline=True,
            created_by=admin_user,
        )
        pending = ProjectDocument.objects.create(
            project=project, version=2, status='pending_signature',
            created_by=admin_user,
        )
        self._signed_case(
            customer, 'validacao_documento', project=project,
            autentique_id='AUT-123',
        )
        pending.refresh_from_db()
        old_baseline.refresh_from_db()
        assert pending.status == 'signed'
        assert pending.is_current_baseline is True
        assert pending.autentique_id == 'AUT-123'
        assert pending.signed_at is not None
        assert old_baseline.is_current_baseline is False
        assert AuditLog.objects.filter(
            action='project_document_signed', resource_id=str(pending.id),
        ).exists()

    def test_validacao_dry_run_no_effect(
        self, project, customer, admin_user,
    ):
        pending = ProjectDocument.objects.create(
            project=project, version=1, status='pending_signature',
            created_by=admin_user,
        )
        self._signed_case(customer, 'validacao_documento', project=project)
        pending.refresh_from_db()
        assert pending.status == 'pending_signature'
        assert AuditLog.objects.filter(
            action='project_document_signed_dry_run').exists()

    def test_validacao_without_pending_document_is_noop(
        self, settings, project, customer,
    ):
        settings.AUTOMATION_PROD_DOC_ASSINADA = 'on'
        self._signed_case(customer, 'validacao_documento', project=project)
        assert not AuditLog.objects.filter(
            action='project_document_signed').exists()


@pytest.mark.django_db
class TestContratoAutocreatesProject:
    """P0.4 (doc 09 §T-E2E): a assinatura do contrato CRIA o Project de
    Produção quando não existe um pré-dev — antes era no-op silencioso."""

    def _signed_contrato(self, customer, **kwargs):
        return LegalCase.objects.create(
            customer=customer, process_type='contrato', status='assinado',
            signed_at=timezone.now(), **kwargs,
        )

    def test_on_creates_project_when_none_exists(
        self, settings, customer,
    ):
        settings.AUTOMATION_PROD_CONTRATO_ASSINADO = 'on'
        assert not Project.objects.filter(customer=customer).exists()

        case = self._signed_contrato(customer)

        project = Project.objects.filter(customer=customer).first()
        assert project is not None, 'Project de Produção não foi criado'
        assert project.etapa_atual == 'agendar'
        assert project.situacao == 'ativo'
        assert project.contrato_assinado_at == case.signed_at
        assert AuditLog.objects.filter(
            action='project_autocreate_on_contrato',
            resource_id=str(project.id),
        ).exists()
        assert AuditLog.objects.filter(
            action='project_contrato_assinado', resource_id=str(project.id),
        ).exists()

    def test_created_project_inherits_tipo_from_prospect(
        self, settings, customer, admin_user,
    ):
        settings.AUTOMATION_PROD_CONTRATO_ASSINADO = 'on'
        Prospect.objects.create(
            customer=customer, company_name='Cliente F5 LTDA',
            contact_name='C', source='website', status='coleta_de_dados',
            project_type='recorrente', created_by=admin_user,
        )
        self._signed_contrato(customer)
        project = Project.objects.filter(customer=customer).first()
        assert project is not None
        assert project.tipo == 'recorrente'

    def test_idempotent_does_not_create_second_project(
        self, settings, customer,
    ):
        settings.AUTOMATION_PROD_CONTRATO_ASSINADO = 'on'
        case = self._signed_contrato(customer)
        case.save()  # re-save não cria outro projeto
        assert Project.objects.filter(customer=customer).count() == 1

    def test_dry_run_does_not_create_project(self, settings, customer):
        settings.AUTOMATION_PROD_CONTRATO_ASSINADO = 'dry_run'
        self._signed_contrato(customer)
        assert not Project.objects.filter(customer=customer).exists()
        assert AuditLog.objects.filter(
            action='project_autocreate_on_contrato_dry_run').exists()

    def test_existing_predev_project_is_used_not_duplicated(
        self, settings, customer, admin_user,
    ):
        settings.AUTOMATION_PROD_CONTRATO_ASSINADO = 'on'
        existing = make_project(
            admin_user, customer, etapa_atual='etapa_3_preparacao')
        self._signed_contrato(customer)
        assert Project.objects.filter(customer=customer).count() == 1
        existing.refresh_from_db()
        assert existing.contrato_assinado_at is not None


@pytest.mark.django_db
class TestBifurcationRecurrenceContract:
    def _deliver(self, project, tipo):
        project.etapa_atual = 'registro_entrega'
        project.tipo = tipo
        project.save(update_fields=['etapa_atual', 'tipo'])

    def test_dry_run_default_creates_nothing(
        self, producao_client, project,
    ):
        self._deliver(project, 'fechado')
        producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-etapa/',
            {'etapa': 'etapa_10_graduacao'},
        )
        assert RecurrenceContract.objects.count() == 0
        assert AuditLog.objects.filter(
            action='recurrence_contract_create_dry_run').exists()

    def test_on_creates_suporte_basico_for_fechado(
        self, settings, producao_client, project, customer,
    ):
        settings.AUTOMATION_PROD_RECORRENCIA = 'on'
        self._deliver(project, 'fechado')
        producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-etapa/',
            {'etapa': 'etapa_10_graduacao'},
        )
        contract = RecurrenceContract.objects.get(project=project)
        assert contract.kind == 'suporte_basico'
        assert contract.customer == customer
        assert contract.status == 'ativo'
        assert contract.started_at is not None

    def test_on_creates_operacao_continua_for_recorrente(
        self, settings, producao_client, project,
    ):
        settings.AUTOMATION_PROD_RECORRENCIA = 'on'
        self._deliver(project, 'recorrente')
        producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-etapa/',
            {'etapa': 'implementacao'},
        )
        contract = RecurrenceContract.objects.get(project=project)
        assert contract.kind == 'operacao_continua'

    def test_on_is_idempotent_one_active_per_project(
        self, settings, project, customer, admin_user,
    ):
        settings.AUTOMATION_PROD_RECORRENCIA = 'on'
        self._deliver(project, 'fechado')
        project.etapa_atual = 'etapa_10_graduacao'
        project.save(update_fields=['etapa_atual'])
        receivers.create_recurrence_contract(project, user=admin_user)
        receivers.create_recurrence_contract(project, user=admin_user)
        assert RecurrenceContract.objects.filter(project=project).count() == 1

    # ─── P1.7: monthly_value herdado do ProposalPaymentPlan ──────────────────

    @staticmethod
    def _approved_proposal_with_plan(user, customer, recurring=Decimal('990')):
        import uuid as _uuid

        from sales.models import Proposal, ProposalPaymentPlan
        proposal = Proposal.objects.create(
            customer=customer, number=f'P-{_uuid.uuid4().hex[:12]}',
            title='Proposta Recorrente', proposal_type='software_dev',
            billing_type='monthly', total_value=Decimal('990'),
            status='approved', valid_until=date(2026, 12, 31), created_by=user,
        )
        ProposalPaymentPlan.objects.create(
            proposal=proposal, plan_type='recurring_only',
            recurring_amount=recurring,
        )
        return proposal

    def test_monthly_value_inherited_from_payment_plan(
        self, settings, project, customer, admin_user,
    ):
        settings.AUTOMATION_PROD_RECORRENCIA = 'on'
        self._approved_proposal_with_plan(admin_user, customer, Decimal('990'))
        self._deliver(project, 'recorrente')
        project.etapa_atual = 'implementacao'
        project.save(update_fields=['etapa_atual'])
        contract = receivers.create_recurrence_contract(project, user=admin_user)
        assert contract.monthly_value == Decimal('990')

    def test_monthly_value_zero_without_recurring_plan(
        self, settings, project, customer, admin_user,
    ):
        # Sem proposta recorrente vinculável -> 0.00 (default), sem erro.
        settings.AUTOMATION_PROD_RECORRENCIA = 'on'
        self._deliver(project, 'fechado')
        project.etapa_atual = 'etapa_10_graduacao'
        project.save(update_fields=['etapa_atual'])
        contract = receivers.create_recurrence_contract(project, user=admin_user)
        assert contract.monthly_value == Decimal('0.00')

    def test_monthly_value_ignores_non_approved_proposal(
        self, settings, project, customer, admin_user,
    ):
        import uuid as _uuid

        from sales.models import Proposal, ProposalPaymentPlan
        settings.AUTOMATION_PROD_RECORRENCIA = 'on'
        draft = Proposal.objects.create(
            customer=customer, number=f'P-{_uuid.uuid4().hex[:12]}',
            title='Draft', proposal_type='software_dev', billing_type='monthly',
            total_value=Decimal('500'), status='draft',
            valid_until=date(2026, 12, 31), created_by=admin_user,
        )
        ProposalPaymentPlan.objects.create(
            proposal=draft, plan_type='recurring_only',
            recurring_amount=Decimal('500'),
        )
        self._deliver(project, 'recorrente')
        project.etapa_atual = 'implementacao'
        project.save(update_fields=['etapa_atual'])
        contract = receivers.create_recurrence_contract(project, user=admin_user)
        assert contract.monthly_value == Decimal('0.00')


# ─── 06° Game Plan persistente (ScheduleVersion + ProjectPhase) ─────────────

@pytest.mark.django_db
class TestCronogramaPersistente:
    URL = PROJECTS_URL + '{id}/cronograma/'

    def test_post_without_dia_zero_or_body_date_400(
        self, producao_client, project,
    ):
        response = producao_client.post(
            self.URL.format(id=project.id), {},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert ScheduleVersion.objects.count() == 0

    def test_post_with_body_date_creates_version_and_phases(
        self, producao_client, project,
    ):
        response = producao_client.post(
            self.URL.format(id=project.id),
            {'data_onboarding': '2026-06-10'},
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        version = ScheduleVersion.objects.get(project=project)
        assert version.params['data_onboarding'] == '2026-06-10'
        assert version.params['prazo_total'] == 45
        assert version.game_plan['entrega']
        assert len(version.game_plan['fases']) == 6

        phases = ProjectPhase.objects.filter(project=project).order_by('order')
        assert phases.count() == 6
        assert [p.order for p in phases] == [1, 2, 3, 4, 5, 6]
        assert phases[0].name == 'Documentação'
        assert phases[0].start_date is not None
        assert phases[5].end_date is not None
        # entrega do plano == fim da última fase
        assert str(phases[5].end_date) == version.game_plan['entrega']

        assert AuditLog.objects.filter(
            action='project_cronograma_generate',
            resource_id=str(project.id),
        ).exists()

    def test_post_uses_dia_zero_when_set(self, producao_client, project):
        project.dia_zero = date(2026, 6, 10)
        project.save(update_fields=['dia_zero'])
        response = producao_client.post(self.URL.format(id=project.id), {})
        assert response.status_code == status.HTTP_201_CREATED, response.data
        version = ScheduleVersion.objects.get(project=project)
        assert version.params['data_onboarding'] == '2026-06-10'

    def test_regenerate_updates_phases_without_duplicating(
        self, producao_client, project,
    ):
        producao_client.post(
            self.URL.format(id=project.id), {'data_onboarding': '2026-06-10'},
        )
        first_end = ProjectPhase.objects.get(
            project=project, name='Documentação').end_date
        project.prazo_total = 90
        project.save(update_fields=['prazo_total'])
        response = producao_client.post(
            self.URL.format(id=project.id), {'data_onboarding': '2026-06-10'},
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert ScheduleVersion.objects.filter(project=project).count() == 2
        assert ProjectPhase.objects.filter(project=project).count() == 6
        second_end = ProjectPhase.objects.get(
            project=project, name='Documentação').end_date
        assert second_end != first_end

    def test_get_lists_versions_history(self, producao_client, project):
        producao_client.post(
            self.URL.format(id=project.id), {'data_onboarding': '2026-06-10'},
        )
        producao_client.post(
            self.URL.format(id=project.id), {'data_onboarding': '2026-06-11'},
        )
        response = producao_client.get(self.URL.format(id=project.id))
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 2
        # mais recente primeiro
        assert response.data[0]['params']['data_onboarding'] == '2026-06-11'

    def test_get_empty_until_post_even_with_dia_zero(
        self, producao_client, project,
    ):
        """P2.10 (doc 09 §T-E2E): GET cronograma vem VAZIO até o POST gerar,
        mesmo com o Dia 0 cravado. O Game Plan NÃO é auto-materializado quando
        dia_zero é setado — é gerado/regerado explicitamente pelo POST (assim a
        remarcação preserva o histórico de ScheduleVersion). Era o que o E2E
        observou ("GET vazio após âncora + Dia 0"): faltava o POST, não há gap.
        """
        project.dia_zero = date(2026, 6, 10)
        project.save(update_fields=['dia_zero'])
        # GET antes de qualquer POST: vazio (Dia 0 setado não materializa nada)
        before = producao_client.get(self.URL.format(id=project.id))
        assert before.status_code == status.HTTP_200_OK
        assert before.data == []
        assert ScheduleVersion.objects.filter(project=project).count() == 0
        assert ProjectPhase.objects.filter(project=project).count() == 0
        # POST gera e persiste; GET passa a refletir a versão materializada
        post = producao_client.post(self.URL.format(id=project.id), {})
        assert post.status_code == status.HTTP_201_CREATED, post.data
        after = producao_client.get(self.URL.format(id=project.id))
        assert len(after.data) == 1
        assert ProjectPhase.objects.filter(project=project).count() == 6


# ─── 07° Entidades novas ─────────────────────────────────────────────────────

@pytest.mark.django_db
class TestProjectDocumentLifecycle:
    DOCS_URL = '/api/v1/projects/documents/'

    def test_create_auto_increments_version(
        self, producao_client, project, admin_user,
    ):
        ProjectDocument.objects.create(
            project=project, version=1, status='draft', created_by=admin_user,
        )
        response = producao_client.post(
            self.DOCS_URL, {'project': project.id, 'content': {}},
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data['version'] == 2
        assert response.data['status'] == 'draft'

    def test_content_rejects_unknown_sections(
        self, producao_client, project,
    ):
        response = producao_client.post(
            self.DOCS_URL,
            {'project': project.id, 'content': {'secao_fake': 'x'}},
            format='json',
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_content_accepts_known_sections(self, producao_client, project):
        response = producao_client.post(
            self.DOCS_URL,
            {
                'project': project.id,
                'content': {'visao_geral': 'ERP', 'objetivos': 'Automatizar'},
            },
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data

    def test_submit_advances_status_but_never_signs(
        self, producao_client, project, admin_user,
    ):
        document = ProjectDocument.objects.create(
            project=project, version=1, status='draft', created_by=admin_user,
        )
        url = f'{self.DOCS_URL}{document.id}/submit/'
        assert producao_client.post(url).data['status'] == 'pending_validation'
        assert producao_client.post(url).data['status'] == 'pending_signature'
        response = producao_client.post(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        document.refresh_from_db()
        assert document.status == 'pending_signature'

    def test_patch_cannot_forge_signed_status(
        self, producao_client, project, admin_user,
    ):
        document = ProjectDocument.objects.create(
            project=project, version=1, status='draft', created_by=admin_user,
        )
        response = producao_client.patch(
            f'{self.DOCS_URL}{document.id}/',
            {'status': 'signed', 'is_current_baseline': True},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        document.refresh_from_db()
        assert document.status == 'draft'  # read_only ignorado
        assert document.is_current_baseline is False


@pytest.mark.django_db
class TestProjectAuditApprove:
    AUDITS_URL = '/api/v1/projects/audits/'

    def test_approve_sets_marco(self, producao_client, producao_user, project):
        response = producao_client.post(
            self.AUDITS_URL,
            {'project': project.id, 'checklist': [], 'findings': ''},
            format='json',
        )
        audit_id = response.data['id']
        response = producao_client.post(
            f'{self.AUDITS_URL}{audit_id}/approve/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['approved_at'] is not None
        assert response.data['approved_by'] == producao_user.id
        # aprovar 2x falha
        response = producao_client.post(
            f'{self.AUDITS_URL}{audit_id}/approve/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestOnboardingFormAndWeeklyUpdate:
    def test_onboarding_form_crud(self, producao_client, project):
        response = producao_client.post(
            '/api/v1/projects/onboarding-forms/',
            {
                'project': project.id,
                'contexto_negocio': 'Indústria de cosméticos',
                'dores_objetivos': 'Planilhas manuais',
            },
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        # OneToOne: segundo form para o mesmo projeto falha
        response = producao_client.post(
            '/api/v1/projects/onboarding-forms/', {'project': project.id},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_weekly_update_crud_and_filter(self, producao_client, project,
                                           admin_user, customer):
        other = make_project(admin_user, customer, name='Outro')
        producao_client.post('/api/v1/projects/weekly-updates/', {
            'project': project.id, 'week_start': '2026-06-08',
            'summary': 'Semana 1: módulo de cadastro concluído.',
        })
        producao_client.post('/api/v1/projects/weekly-updates/', {
            'project': other.id, 'week_start': '2026-06-08',
            'summary': 'Outro projeto.',
        })
        response = producao_client.get(
            f'/api/v1/projects/weekly-updates/?project={project.id}')
        results = response.data.get('results', response.data)
        assert len(results) == 1
        assert results[0]['project'] == project.id
        assert WeeklyUpdate.objects.count() == 2


# ─── 08° RBAC por setor (matriz doc 08 §7.2) ────────────────────────────────

@pytest.mark.django_db
class TestSectorRBAC:
    WEEKLY_URL = '/api/v1/projects/weekly-updates/'

    def test_operator_without_sector_cannot_write(self, db, project):
        user = User.objects.create_user(
            username='semsetor_f5', email='semsetor@f5test.com',
            password='x_pass_123', role='operator', sectors=[],
        )
        client = make_client(user)
        response = client.post(self.WEEKLY_URL, {
            'project': project.id, 'week_start': '2026-06-08', 'summary': 'x',
        })
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_suporte_operator_reads_but_cannot_write(
        self, suporte_user, project,
    ):
        client = make_client(suporte_user)
        assert client.get(self.WEEKLY_URL).status_code == status.HTTP_200_OK
        response = client.post(self.WEEKLY_URL, {
            'project': project.id, 'week_start': '2026-06-08', 'summary': 'x',
        })
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_suporte_operator_cannot_set_etapa(self, suporte_user, project):
        client = make_client(suporte_user)
        response = client.post(
            f'{PROJECTS_URL}{project.id}/set-etapa/',
            {'etapa': 'etapa_4_onboarding'},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        project.refresh_from_db()
        assert project.etapa_atual == 'etapa_3_preparacao'

    def test_viewer_reads_but_cannot_write(self, viewer_user, project):
        client = make_client(viewer_user)
        assert client.get(self.WEEKLY_URL).status_code == status.HTTP_200_OK
        response = client.post(self.WEEKLY_URL, {
            'project': project.id, 'week_start': '2026-06-08', 'summary': 'x',
        })
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_partner_has_no_access_at_all(self, partner_user):
        client = make_client(partner_user)
        assert client.get(self.WEEKLY_URL).status_code == status.HTTP_403_FORBIDDEN

    def test_anonymous_unauthorized(self, db):
        client = APIClient()
        response = client.get(self.WEEKLY_URL)
        assert response.status_code in (
            status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN,
        )

    def test_producao_operator_cannot_generate_cronograma_of_nothing(
        self, producao_client,
    ):
        # objeto inexistente → 404 (sem vazamento de info)
        response = producao_client.post(
            f'{PROJECTS_URL}99999/cronograma/', {'data_onboarding': '2026-06-10'},
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_admin_bypasses_matrix(self, admin_client, project):
        response = admin_client.post(
            f'{PROJECTS_URL}{project.id}/set-etapa/',
            {'etapa': 'etapa_4_onboarding'},
        )
        assert response.status_code == status.HTTP_200_OK


# ─── Serializer do Project: campos de sistema read-only ─────────────────────

@pytest.mark.django_db
class TestProjectSerializerReadOnly:
    def test_patch_cannot_forge_gate_criteria_nor_etapa(
        self, admin_client, project,
    ):
        response = admin_client.patch(
            f'{PROJECTS_URL}{project.id}/',
            {
                'etapa_atual': 'etapa_7_desenvolvimento',
                'situacao': 'cancelado',
                'contrato_assinado_at': '2026-06-01T00:00:00Z',
                'entrada_paga_at': '2026-06-01T00:00:00Z',
                'onboarding_realizado_at': '2026-06-01T00:00:00Z',
                'dia_zero': '2026-06-01',
            },
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        project.refresh_from_db()
        assert project.etapa_atual == 'etapa_3_preparacao'
        assert project.situacao == 'ativo'
        assert project.contrato_assinado_at is None
        assert project.entrada_paga_at is None
        assert project.dia_zero is None

    def test_patch_game_plan_params_within_ranges(
        self, admin_client, project,
    ):
        response = admin_client.patch(
            f'{PROJECTS_URL}{project.id}/',
            {'prazo_total': 90, 'pct_doc': 20, 'tipo': 'fechado'},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        project.refresh_from_db()
        assert project.prazo_total == 90
        assert project.pct_doc == 20
        assert project.tipo == 'fechado'

    def test_patch_game_plan_params_out_of_range_400(
        self, admin_client, project,
    ):
        response = admin_client.patch(
            f'{PROJECTS_URL}{project.id}/', {'prazo_total': 1000},
            format='json',
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ─── Integração: evento do Financeiro chama o hook real ─────────────────────

@pytest.mark.django_db
class TestFinanceEventIntegration:
    def test_fin_event_on_calls_real_receiver(
        self, settings, admin_user, customer, project,
    ):
        """Caminho completo F4→F5: invoice da entrada paga → hook real →
        entrada_paga_at no projeto (ambas as flags em on)."""
        settings.AUTOMATION_FIN_ENTRADA_PAGA = 'on'
        settings.AUTOMATION_PROD_ENTRADA = 'on'
        from finance import events
        invoice = make_invoice(admin_user, customer)
        # marca como entrada de pré-cadastro (precadastro_role)
        events_called = events.on_entrada_paga
        invoice.payment_details = {'precadastro_role': 'entrada'}
        events_called(invoice)
        project.refresh_from_db()
        assert project.entrada_paga_at is not None


# ─── v32 ajustes (doc 09 item 08 + doc 10) ──────────────────────────────────

@pytest.mark.django_db
class TestEtapaChoicesV32:
    """Etapa 'agendar' aditiva + labels atualizados (chaves intocadas)."""

    def test_agendar_is_first_choice_and_default(self):
        keys = [k for k, _ in Project.ETAPA_CHOICES]
        assert keys[0] == 'agendar'
        assert Project._meta.get_field('etapa_atual').default == 'agendar'

    def test_legacy_keys_preserved(self):
        keys = {k for k, _ in Project.ETAPA_CHOICES}
        # nenhuma chave legada foi renomeada/removida (produção, só aditivo)
        for legacy in (
            'etapa_3_preparacao', 'etapa_4_onboarding', 'etapa_5_documentacao',
            'etapa_6_validacao_doc', 'etapa_7_desenvolvimento',
            'etapa_8_auditoria', 'etapa_9_apresentacao', 'homologacao',
            'registro_entrega', 'etapa_10_graduacao', 'implementacao',
            'recorrencia',
        ):
            assert legacy in keys

    def test_labels_updated(self):
        labels = dict(Project.ETAPA_CHOICES)
        assert labels['etapa_3_preparacao'] == 'Planejamento'
        assert labels['etapa_9_apresentacao'] == 'Reunião de Apresentação'
        assert labels['homologacao'] == 'Janela de teste'
        assert labels['registro_entrega'] == 'Re-Update'
        assert labels['etapa_10_graduacao'] == 'Homologação'
        assert labels['implementacao'] == 'Concluído'
        assert labels['recorrencia'] == 'Implementado'


@pytest.mark.django_db
class TestEtapaAgendar:
    """Nova 1ª etapa + âncora provisória do cronograma (Visão 2)."""

    def test_new_project_starts_in_agendar(self, admin_user, customer):
        project = make_project(admin_user, customer)
        assert project.etapa_atual == 'agendar'

    def test_set_onboarding_agendado_sets_anchor_and_advances(
        self, producao_client, admin_user, customer,
    ):
        project = make_project(admin_user, customer)  # etapa 'agendar'
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-onboarding-agendado/',
            {'onboarding_agendado_em': '2026-07-01'},
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        project.refresh_from_db()
        assert project.onboarding_agendado_em is not None
        # avança 'agendar' → Planejamento
        assert project.etapa_atual == 'etapa_3_preparacao'
        assert AuditLog.objects.filter(
            action='project_onboarding_agendado',
            resource_id=str(project.id),
        ).exists()

    def test_set_onboarding_agendado_requires_value(
        self, producao_client, admin_user, customer,
    ):
        project = make_project(admin_user, customer)
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/set-onboarding-agendado/', {},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_onboarding_agendado_em_is_read_only_on_patch(
        self, producao_client, admin_user, customer,
    ):
        project = make_project(admin_user, customer)
        producao_client.patch(
            f'{PROJECTS_URL}{project.id}/',
            {'onboarding_agendado_em': '2026-07-01T12:00:00Z'},
            format='json',
        )
        project.refresh_from_db()
        assert project.onboarding_agendado_em is None  # read_only ignorado

    def test_cronograma_preview_uses_provisional_anchor(
        self, producao_client, admin_user, customer,
    ):
        """Sem dia_zero, o cronograma usa onboarding_agendado_em (preview)."""
        project = make_project(admin_user, customer)
        project.onboarding_agendado_em = timezone.make_aware(
            timezone.datetime(2026, 7, 1, 12, 0))
        project.save(update_fields=['onboarding_agendado_em'])
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/cronograma/', {},
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data['is_preview'] is True
        version = ScheduleVersion.objects.get(project=project)
        assert version.params['data_onboarding'] == '2026-07-01'

    def test_cronograma_dia_zero_overrides_preview(
        self, producao_client, admin_user, customer,
    ):
        project = make_project(admin_user, customer)
        project.onboarding_agendado_em = timezone.make_aware(
            timezone.datetime(2026, 7, 1, 12, 0))
        project.dia_zero = date(2026, 6, 20)
        project.save(update_fields=['onboarding_agendado_em', 'dia_zero'])
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/cronograma/', {},
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data['is_preview'] is False
        version = ScheduleVersion.objects.get(project=project)
        assert version.params['data_onboarding'] == '2026-06-20'


@pytest.mark.django_db
class TestProjectEtapaActions:
    """Checklist de ações por etapa no card (doc 10)."""

    URL = '/api/v1/projects/etapa-actions/'

    def test_seed_creates_default_actions(self, producao_client, project):
        response = producao_client.post(
            f'{self.URL}seed/', {'project': project.id}, format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        from projects.models import ProjectEtapaAction
        # 'agendar' tem 1 ação; etapas a definir (9/12/13) não semeiam nada
        agendar_actions = ProjectEtapaAction.objects.filter(
            project=project, etapa='agendar')
        assert agendar_actions.count() == 1
        assert not ProjectEtapaAction.objects.filter(
            project=project, etapa='etapa_9_apresentacao').exists()
        assert not ProjectEtapaAction.objects.filter(
            project=project, etapa='recorrencia').exists()

    def test_seed_is_idempotent(self, producao_client, project):
        producao_client.post(
            f'{self.URL}seed/', {'project': project.id}, format='json')
        from projects.models import ProjectEtapaAction
        count_first = ProjectEtapaAction.objects.filter(project=project).count()
        response = producao_client.post(
            f'{self.URL}seed/', {'project': project.id}, format='json')
        assert response.data['seeded'] == 0
        assert ProjectEtapaAction.objects.filter(
            project=project).count() == count_first

    def test_seed_single_etapa(self, producao_client, project):
        response = producao_client.post(
            f'{self.URL}seed/',
            {'project': project.id, 'etapa': 'etapa_3_preparacao'},
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED
        from projects.models import ProjectEtapaAction
        etapas = set(ProjectEtapaAction.objects.filter(
            project=project).values_list('etapa', flat=True))
        assert etapas == {'etapa_3_preparacao'}

    def test_toggle_marks_done_with_who_and_when(
        self, producao_client, producao_user, project,
    ):
        from projects.models import ProjectEtapaAction
        action_obj = ProjectEtapaAction.objects.create(
            project=project, etapa='agendar', ordem=1, texto='X')
        response = producao_client.post(f'{self.URL}{action_obj.id}/toggle/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['feito'] is True
        assert response.data['feito_por'] == producao_user.id
        assert response.data['feito_em'] is not None
        # toggle de novo desmarca
        response = producao_client.post(f'{self.URL}{action_obj.id}/toggle/')
        assert response.data['feito'] is False
        assert response.data['feito_em'] is None

    def test_data_prevista_is_read_only(self, producao_client, project):
        response = producao_client.post(
            self.URL,
            {'project': project.id, 'etapa': 'agendar', 'ordem': 1,
             'texto': 'Ação', 'data_prevista': '2026-07-01'},
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data['data_prevista'] is None  # read_only ignorado

    def test_filter_by_project_and_etapa(self, producao_client, project):
        producao_client.post(
            f'{self.URL}seed/', {'project': project.id}, format='json')
        response = producao_client.get(
            f'{self.URL}?project={project.id}&etapa=agendar')
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get('results', response.data)
        assert all(a['etapa'] == 'agendar' for a in results)
        assert len(results) == 1


@pytest.mark.django_db
class TestValidacaoProducer:
    """Producer Produção → Jurídico: doc enviada pra validação cria LegalCase."""

    DOCS_URL = '/api/v1/projects/documents/'

    def test_dry_run_default_creates_no_case(
        self, settings, producao_client, project, admin_user,
    ):
        settings.AUTOMATION_PROD_VALIDACAO_JURIDICO = 'dry_run'
        document = ProjectDocument.objects.create(
            project=project, version=1, status='draft', created_by=admin_user)
        producao_client.post(f'{self.DOCS_URL}{document.id}/submit/')
        assert not LegalCase.objects.filter(
            process_type='validacao_documento').exists()
        assert AuditLog.objects.filter(
            action='legal_case_validacao_producer_dry_run').exists()

    def test_on_creates_validacao_case(
        self, settings, producao_client, project, customer, admin_user,
    ):
        settings.AUTOMATION_PROD_VALIDACAO_JURIDICO = 'on'
        document = ProjectDocument.objects.create(
            project=project, version=1, status='draft', created_by=admin_user)
        producao_client.post(f'{self.DOCS_URL}{document.id}/submit/')
        case = LegalCase.objects.get(
            process_type='validacao_documento', project=project)
        assert case.customer == customer
        assert case.source == 'producao'
        assert case.status == 'preparacao'
        assert case.events.filter(event_type='created').exists()

    def test_on_is_idempotent(
        self, settings, producao_client, project, admin_user,
    ):
        settings.AUTOMATION_PROD_VALIDACAO_JURIDICO = 'on'
        doc1 = ProjectDocument.objects.create(
            project=project, version=1, status='draft', created_by=admin_user)
        producao_client.post(f'{self.DOCS_URL}{doc1.id}/submit/')
        doc2 = ProjectDocument.objects.create(
            project=project, version=2, status='draft', created_by=admin_user)
        producao_client.post(f'{self.DOCS_URL}{doc2.id}/submit/')
        assert LegalCase.objects.filter(
            process_type='validacao_documento', project=project).count() == 1

    def test_off_creates_nothing(
        self, settings, producao_client, project, admin_user,
    ):
        settings.AUTOMATION_PROD_VALIDACAO_JURIDICO = 'off'
        document = ProjectDocument.objects.create(
            project=project, version=1, status='draft', created_by=admin_user)
        producao_client.post(f'{self.DOCS_URL}{document.id}/submit/')
        assert not LegalCase.objects.filter(
            process_type='validacao_documento').exists()


@pytest.mark.django_db
class TestSolicitarMudancaProducer:
    """Botão Solicitar Mudança: ChangeRequest sempre; LegalCase(aditivo) c/ flag."""

    def _payload(self):
        return {'title': 'Nova tela', 'description': 'Adicionar relatório',
                'impact_hours': 10, 'impact_value': '1500.00'}

    def test_creates_change_request_always(
        self, settings, producao_client, project,
    ):
        settings.AUTOMATION_PROD_ADITIVO_JURIDICO = 'off'
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/solicitar-mudanca/',
            self._payload(), format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        from projects.models import ChangeRequest
        cr = ChangeRequest.objects.get(project=project)
        assert cr.title == 'Nova tela'
        assert cr.status == 'pending'
        # flag off: nenhum LegalCase aditivo
        assert response.data['legal_case_id'] is None
        assert not LegalCase.objects.filter(process_type='aditivo').exists()

    def test_dry_run_creates_cr_but_no_case(
        self, settings, producao_client, project,
    ):
        settings.AUTOMATION_PROD_ADITIVO_JURIDICO = 'dry_run'
        producao_client.post(
            f'{PROJECTS_URL}{project.id}/solicitar-mudanca/',
            self._payload(), format='json',
        )
        from projects.models import ChangeRequest
        assert ChangeRequest.objects.filter(project=project).count() == 1
        assert not LegalCase.objects.filter(process_type='aditivo').exists()
        assert AuditLog.objects.filter(
            action='legal_case_aditivo_producer_dry_run').exists()

    def test_on_creates_cr_and_aditivo_case(
        self, settings, producao_client, project, customer,
    ):
        settings.AUTOMATION_PROD_ADITIVO_JURIDICO = 'on'
        settings.AUTOMATION_FIN_ADITIVO = 'off'  # isola o pré-cadastro F4
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/solicitar-mudanca/',
            self._payload(), format='json',
        )
        assert response.data['legal_case_id'] is not None
        case = LegalCase.objects.get(process_type='aditivo', project=project)
        assert case.customer == customer
        assert case.status == 'nova_solicitacao'
        assert case.source == 'producao'

    def test_on_links_original_contract(
        self, settings, producao_client, project, customer,
    ):
        settings.AUTOMATION_PROD_ADITIVO_JURIDICO = 'on'
        settings.AUTOMATION_FIN_ADITIVO = 'off'
        contrato = LegalCase.objects.create(
            customer=customer, process_type='contrato', status='assinado',
            signed_at=timezone.now(),
        )
        producao_client.post(
            f'{PROJECTS_URL}{project.id}/solicitar-mudanca/',
            self._payload(), format='json',
        )
        case = LegalCase.objects.get(process_type='aditivo', project=project)
        event = case.events.get(event_type='created')
        assert event.metadata['contrato_original'] == contrato.id

    def test_requires_title_and_description(
        self, producao_client, project,
    ):
        response = producao_client.post(
            f'{PROJECTS_URL}{project.id}/solicitar-mudanca/',
            {'title': 'só título'}, format='json',
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_suporte_operator_cannot_solicitar_mudanca(
        self, suporte_user, project,
    ):
        client = make_client(suporte_user)
        response = client.post(
            f'{PROJECTS_URL}{project.id}/solicitar-mudanca/',
            self._payload(), format='json',
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
