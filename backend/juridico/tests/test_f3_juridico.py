"""v32 F3 (Jurídico) — testes do app juridico.

Cobre:
- Modelo LegalCase (criação, defaults, __str__)
- Transições válidas via POST /transition/ (ordem das 4 macro-etapas)
- Transições inválidas retornam 400 e NÃO mudam estado
- Campos de sistema read_only no serializer (status/signed_at/autentique)
- RBAC HasSectorAccess: matriz doc 08 §7.2 (403 cross-setor)
- Gatilho ClientOnboarding submitted -> LegalCase(contrato):
  dry_run (default, não cria), on (cria), off (nada), idempotência
- log_audit em criação e em toda transição (+ saída assinado)
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from core.models import AuditLog
from juridico.models import LegalCase
from sales.models import ClientOnboarding, Customer, Prospect

User = get_user_model()

URL = '/api/v1/juridico/legal-cases/'


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin_f3', email='admin@f3test.com',
        password='admin_pass_123', role='admin',
    )


@pytest.fixture
def juridico_operator(db):
    return User.objects.create_user(
        username='juridico_f3', email='juridico@f3test.com',
        password='juridico_pass_123', role='operator', sectors=['juridico'],
    )


@pytest.fixture
def comercial_operator(db):
    return User.objects.create_user(
        username='comercial_f3', email='comercial@f3test.com',
        password='comercial_pass_123', role='operator', sectors=['comercial'],
    )


@pytest.fixture
def suporte_operator(db):
    return User.objects.create_user(
        username='suporte_f3', email='suporte@f3test.com',
        password='suporte_pass_123', role='operator', sectors=['suporte'],
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username='viewer_f3', email='viewer@f3test.com',
        password='viewer_pass_123', role='viewer',
    )


@pytest.fixture
def partner_user(db):
    return User.objects.create_user(
        username='partner_f3', email='partner@f3test.com',
        password='partner_pass_123', role='partner',
    )


def client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def juridico_client(juridico_operator):
    return client_for(juridico_operator)


@pytest.fixture
def customer(admin_user):
    return Customer.objects.create(
        company_name='Cliente Jurídico LTDA',
        email='cliente@juridico.com',
        created_by=admin_user,
    )


def make_case(customer, user=None, **kwargs):
    defaults = dict(
        customer=customer,
        process_type='contrato',
        source='comercial',
        created_by=user,
    )
    defaults.update(kwargs)
    return LegalCase.objects.create(**defaults)


# ─── Modelo ──────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestLegalCaseModel:
    def test_defaults(self, customer):
        case = make_case(customer)
        assert case.status == 'preparacao'
        assert case.source == 'comercial'
        assert case.signed_at is None
        assert case.autentique_id == ''
        assert case.created_by is None  # automação

    def test_str(self, customer, admin_user):
        case = make_case(customer, user=admin_user, process_type='aditivo')
        assert 'Aditivo' in str(case)
        assert 'Preparação' in str(case)

    def test_status_order_is_subset_of_choices(self):
        # Após v32 (doc 09 06/07) há colunas por modalidade — as ordens são
        # subconjuntos das choices (que agregam todas as modalidades).
        valid = {c[0] for c in LegalCase.STATUS_CHOICES}
        for order in (
            LegalCase.STATUS_ORDER,
            LegalCase.STATUS_ORDER_ADITIVO,
            LegalCase.STATUS_ORDER_VALIDACAO,
        ):
            assert set(order).issubset(valid)
        # O fluxo do Contrato permanece o original (retrocompatível).
        assert LegalCase.STATUS_ORDER == [
            'preparacao', 'envio_assinatura', 'aguardando_assinatura', 'assinado',
        ]


# ─── Criação via API ─────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestLegalCaseCreate:
    def test_create_sets_created_by_and_audits(self, juridico_client, juridico_operator, customer):
        response = juridico_client.post(URL, {
            'customer': customer.id,
            'process_type': 'contrato',
            'source': 'comercial',
            'notes': 'Elaborar contrato padrão',
        })
        assert response.status_code == status.HTTP_201_CREATED, response.data
        case = LegalCase.objects.get(id=response.data['id'])
        assert case.created_by == juridico_operator
        assert case.status == 'preparacao'
        entry = AuditLog.objects.filter(
            action='legal_case_create', resource_id=str(case.id),
        ).first()
        assert entry is not None
        assert entry.new_value['process_type'] == 'contrato'

    def test_system_fields_are_read_only_on_create(self, juridico_client, customer):
        """status/signed_at/autentique_* ignorados no POST (read_only)."""
        response = juridico_client.post(URL, {
            'customer': customer.id,
            'process_type': 'contrato',
            'status': 'assinado',
            'signed_at': '2026-01-01T00:00:00Z',
            'autentique_id': 'forged-id',
            'autentique_link': 'https://app.autentique.com.br/d/forged',
        })
        assert response.status_code == status.HTTP_201_CREATED, response.data
        case = LegalCase.objects.get(id=response.data['id'])
        assert case.status == 'preparacao'
        assert case.signed_at is None
        assert case.autentique_id == ''
        assert case.autentique_link == ''

    def test_patch_cannot_change_status(self, juridico_client, customer):
        case = make_case(customer)
        response = juridico_client.patch(f'{URL}{case.id}/', {'status': 'assinado'})
        assert response.status_code == status.HTTP_200_OK
        case.refresh_from_db()
        assert case.status == 'preparacao'  # read_only: ignorado


# ─── Transições ──────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestLegalCaseTransitions:
    @pytest.mark.parametrize('from_status,to_status', [
        ('preparacao', 'envio_assinatura'),
        ('envio_assinatura', 'aguardando_assinatura'),
        ('aguardando_assinatura', 'assinado'),
    ])
    def test_valid_transition(self, juridico_client, customer, from_status, to_status):
        case = make_case(customer, status=from_status)
        response = juridico_client.post(
            f'{URL}{case.id}/transition/', {'status': to_status},
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        case.refresh_from_db()
        assert case.status == to_status

    def test_transition_audits_old_new(self, juridico_client, customer):
        case = make_case(customer)
        juridico_client.post(f'{URL}{case.id}/transition/', {'status': 'envio_assinatura'})
        entry = AuditLog.objects.filter(
            action='legal_case_transition', resource_id=str(case.id),
        ).first()
        assert entry is not None
        assert entry.old_value['status'] == 'preparacao'
        assert entry.new_value['status'] == 'envio_assinatura'

    def test_transition_accepts_autentique_fields(self, juridico_client, customer):
        """Upload no Autentique acontece na transição Preparação → Envio."""
        case = make_case(customer)
        response = juridico_client.post(f'{URL}{case.id}/transition/', {
            'status': 'envio_assinatura',
            'autentique_id': 'doc-abc-123',
            'autentique_link': 'https://app.autentique.com.br/d/doc-abc-123',
        })
        assert response.status_code == status.HTTP_200_OK, response.data
        case.refresh_from_db()
        assert case.autentique_id == 'doc-abc-123'
        assert case.autentique_link == 'https://app.autentique.com.br/d/doc-abc-123'

    def test_transition_to_assinado_sets_signed_at(self, juridico_client, customer):
        case = make_case(customer, status='aguardando_assinatura')
        response = juridico_client.post(f'{URL}{case.id}/transition/', {'status': 'assinado'})
        assert response.status_code == status.HTTP_200_OK
        case.refresh_from_db()
        assert case.signed_at is not None

    @pytest.mark.parametrize('process_type,expected_outcome', [
        ('contrato', 'financeiro_liberar_cobranca'),
        ('validacao_documento', 'producao_liberar_baseline'),
    ])
    def test_signed_output_logged_for_contrato_and_validacao(
        self, juridico_client, customer, process_type, expected_outcome,
    ):
        """SAÍDA assinado: nesta fase só log + audit (consumidores em F4/F5)."""
        case = make_case(customer, status='aguardando_assinatura', process_type=process_type)
        juridico_client.post(f'{URL}{case.id}/transition/', {'status': 'assinado'})
        entry = AuditLog.objects.filter(
            action='legal_case_signed_output', resource_id=str(case.id),
        ).first()
        assert entry is not None
        assert entry.new_value['outcome'] == expected_outcome

    def test_signed_output_not_logged_for_aditivo(self, juridico_client, customer):
        case = make_case(customer, status='aguardando_assinatura', process_type='aditivo')
        juridico_client.post(f'{URL}{case.id}/transition/', {'status': 'assinado'})
        assert not AuditLog.objects.filter(
            action='legal_case_signed_output', resource_id=str(case.id),
        ).exists()

    @pytest.mark.parametrize('from_status,to_status', [
        ('preparacao', 'aguardando_assinatura'),   # pula etapa
        ('preparacao', 'assinado'),                # pula 2 etapas
        ('envio_assinatura', 'assinado'),          # pula etapa
        ('envio_assinatura', 'preparacao'),        # volta
        ('aguardando_assinatura', 'envio_assinatura'),  # volta
        ('preparacao', 'preparacao'),              # repete
    ])
    def test_invalid_transition_returns_400_and_keeps_state(
        self, juridico_client, customer, from_status, to_status,
    ):
        case = make_case(customer, status=from_status)
        response = juridico_client.post(
            f'{URL}{case.id}/transition/', {'status': to_status},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        case.refresh_from_db()
        assert case.status == from_status

    def test_transition_from_assinado_returns_400(self, juridico_client, customer):
        case = make_case(customer, status='assinado')
        response = juridico_client.post(
            f'{URL}{case.id}/transition/', {'status': 'preparacao'},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_transition_with_unknown_status_returns_400(self, juridico_client, customer):
        case = make_case(customer)
        response = juridico_client.post(
            f'{URL}{case.id}/transition/', {'status': 'inexistente'},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        case.refresh_from_db()
        assert case.status == 'preparacao'


# ─── RBAC por setor (matriz doc 08 §7.2, linha LegalCase) ───────────────────

@pytest.mark.django_db
class TestLegalCaseRBAC:
    def test_juridico_operator_can_write(self, juridico_client, customer):
        response = juridico_client.post(URL, {
            'customer': customer.id, 'process_type': 'contrato',
        })
        assert response.status_code == status.HTTP_201_CREATED

    def test_admin_bypass(self, admin_user, customer):
        client = client_for(admin_user)
        response = client.post(URL, {
            'customer': customer.id, 'process_type': 'encerramento',
        })
        assert response.status_code == status.HTTP_201_CREATED

    def test_comercial_operator_reads_but_cannot_write(self, comercial_operator, customer):
        """Matriz: LegalCase = R para comercial."""
        client = client_for(comercial_operator)
        case = make_case(customer)
        assert client.get(URL).status_code == status.HTTP_200_OK
        assert client.get(f'{URL}{case.id}/').status_code == status.HTTP_200_OK
        response = client.post(URL, {'customer': customer.id, 'process_type': 'contrato'})
        assert response.status_code == status.HTTP_403_FORBIDDEN
        response = client.post(f'{URL}{case.id}/transition/', {'status': 'envio_assinatura'})
        assert response.status_code == status.HTTP_403_FORBIDDEN
        case.refresh_from_db()
        assert case.status == 'preparacao'

    def test_suporte_operator_has_no_access(self, suporte_operator, customer):
        """Matriz: LegalCase = n/a para suporte (nem leitura)."""
        client = client_for(suporte_operator)
        case = make_case(customer)
        assert client.get(URL).status_code == status.HTTP_403_FORBIDDEN
        assert client.get(f'{URL}{case.id}/').status_code == status.HTTP_403_FORBIDDEN
        response = client.post(URL, {'customer': customer.id, 'process_type': 'contrato'})
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_operator_without_sectors_falls_back_to_role(self, db, customer):
        """H2 (code review): operador SEM sectors cai no comportamento legado
        role-based (não é trancado no deploy do RBAC). Lê e escreve como
        operator até John atribuir um setor."""
        user = User.objects.create_user(
            username='nosector_f3', email='nosector@f3test.com',
            password='nosector_pass_123', role='operator',
        )
        client = client_for(user)
        assert client.get(URL).status_code == status.HTTP_200_OK
        response = client.post(URL, {'customer': customer.id, 'process_type': 'contrato'})
        assert response.status_code == status.HTTP_201_CREATED

    def test_viewer_reads_globally_but_cannot_write(self, viewer_user, customer):
        client = client_for(viewer_user)
        make_case(customer)
        assert client.get(URL).status_code == status.HTTP_200_OK
        response = client.post(URL, {'customer': customer.id, 'process_type': 'contrato'})
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_partner_has_no_access(self, partner_user, customer):
        client = client_for(partner_user)
        assert client.get(URL).status_code == status.HTTP_403_FORBIDDEN

    def test_anonymous_gets_401(self, db):
        assert APIClient().get(URL).status_code == status.HTTP_401_UNAUTHORIZED

    def test_manager_with_juridico_sector_can_write(self, db, customer):
        user = User.objects.create_user(
            username='mgr_juridico_f3', email='mgrjur@f3test.com',
            password='mgr_pass_123', role='manager', sectors=['juridico'],
        )
        client = client_for(user)
        response = client.post(URL, {'customer': customer.id, 'process_type': 'aditivo'})
        assert response.status_code == status.HTTP_201_CREATED


# ─── Gatilho: ClientOnboarding submitted -> LegalCase(contrato) ──────────────

def make_onboarding(user, customer=None, status='pending'):
    prospect = Prospect.objects.create(
        company_name='Gatilho F3 Co',
        contact_name='Contato Gatilho',
        contact_email='gatilho@f3.com',
        source='website',
        status='data_collection',
        created_by=user,
    )
    return ClientOnboarding.objects.create(
        prospect=prospect, customer=customer, status=status, created_by=user,
    )


@pytest.mark.django_db
class TestOnboardingTrigger:
    def test_dry_run_does_not_create_but_audits(self, settings, admin_user, customer):
        settings.AUTOMATION_JURIDICO_CONTRATO = 'dry_run'
        onboarding = make_onboarding(admin_user, customer=customer)
        onboarding.status = 'submitted'
        onboarding.save()
        assert LegalCase.objects.count() == 0
        assert AuditLog.objects.filter(action='legal_case_auto_create_dry_run').exists()

    def test_off_does_nothing(self, settings, admin_user, customer):
        settings.AUTOMATION_JURIDICO_CONTRATO = 'off'
        onboarding = make_onboarding(admin_user, customer=customer)
        onboarding.status = 'submitted'
        onboarding.save()
        assert LegalCase.objects.count() == 0
        assert not AuditLog.objects.filter(
            action__startswith='legal_case_auto_create',
        ).exists()

    def test_on_creates_legal_case(self, settings, admin_user, customer):
        settings.AUTOMATION_JURIDICO_CONTRATO = 'on'
        onboarding = make_onboarding(admin_user, customer=customer)
        onboarding.status = 'submitted'
        onboarding.save()
        case = LegalCase.objects.get()
        assert case.customer == customer
        assert case.process_type == 'contrato'
        assert case.source == 'comercial'
        assert case.status == 'preparacao'
        assert case.created_by is None  # automação
        assert AuditLog.objects.filter(
            action='legal_case_auto_create', resource_id=str(case.id),
        ).exists()

    def test_on_is_idempotent(self, settings, admin_user, customer):
        """Salvar o onboarding 2x (ou re-submeter) não duplica o caso aberto."""
        settings.AUTOMATION_JURIDICO_CONTRATO = 'on'
        onboarding = make_onboarding(admin_user, customer=customer)
        onboarding.status = 'submitted'
        onboarding.save()
        onboarding.save()  # re-save com mesmo status
        assert LegalCase.objects.filter(
            customer=customer, process_type='contrato',
        ).count() == 1

    def test_on_allows_new_case_after_signed(self, settings, admin_user, customer):
        """Caso assinado (fechado) não bloqueia novo contrato do cliente."""
        settings.AUTOMATION_JURIDICO_CONTRATO = 'on'
        make_case(customer, status='assinado')
        onboarding = make_onboarding(admin_user, customer=customer)
        onboarding.status = 'submitted'
        onboarding.save()
        assert LegalCase.objects.filter(
            customer=customer, process_type='contrato',
        ).count() == 2

    def test_on_without_customer_skips(self, settings, admin_user):
        settings.AUTOMATION_JURIDICO_CONTRATO = 'on'
        onboarding = make_onboarding(admin_user, customer=None)
        onboarding.status = 'submitted'
        onboarding.save()
        assert LegalCase.objects.count() == 0

    def test_pending_status_does_not_fire(self, settings, admin_user, customer):
        settings.AUTOMATION_JURIDICO_CONTRATO = 'on'
        make_onboarding(admin_user, customer=customer, status='pending')
        assert LegalCase.objects.count() == 0


# ─── Filtros do kanban ───────────────────────────────────────────────────────

@pytest.mark.django_db
class TestLegalCaseFilters:
    def test_filter_by_process_type_and_status(self, juridico_client, customer):
        make_case(customer, process_type='contrato')
        make_case(customer, process_type='aditivo', status='envio_assinatura')
        response = juridico_client.get(URL, {'process_type': 'aditivo'})
        assert response.status_code == status.HTTP_200_OK
        results = response.data['results']
        assert len(results) == 1
        assert results[0]['process_type'] == 'aditivo'

        response = juridico_client.get(URL, {'status': 'envio_assinatura'})
        assert len(response.data['results']) == 1
