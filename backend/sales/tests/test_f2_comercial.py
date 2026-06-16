"""v32 F2 (Comercial) — testes do pipeline novo.

Cobre:
- Transições válidas para os 4 status novos (caminho principal doc 01 §3)
- Transição inválida retorna 400 e NÃO muda estado
- log_audit (AuditLog) com old/new em toda mudança de status
- ProspectActivity automática com tipo específico para status novos
- Data migration 0033 (meeting_done -> meeting_1_done) forward e reverse
- Permissões (viewer não escreve; viewer não vê tech_analysis_notes)
- Campos novos no serializer (Reunião 2 + análise técnica)
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from core.models import AuditLog
from sales.models import Customer, Prospect, ProspectActivity

User = get_user_model()


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def manager_user(db):
    return User.objects.create_user(
        username='manager_f2',
        email='manager@f2test.com',
        password='manager_pass_123',
        role='manager',
        sectors=['comercial'],  # P2.8: RBAC por setor no Comercial
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username='viewer_f2',
        email='viewer@f2test.com',
        password='viewer_pass_123',
        role='viewer',
    )


@pytest.fixture
def manager_client(api_client, manager_user):
    api_client.force_authenticate(user=manager_user)
    return api_client


@pytest.fixture
def viewer_client(api_client, viewer_user):
    api_client.force_authenticate(user=viewer_user)
    return api_client


def make_prospect(user, status='new', **kwargs):
    defaults = dict(
        company_name='F2 Test Co',
        contact_name='Contato F2',
        contact_email='contato@f2.com',
        source='website',
        status=status,
        created_by=user,
    )
    defaults.update(kwargs)
    return Prospect.objects.create(**defaults)


URL = '/api/v1/sales/prospects/'


# ─── Transições válidas (caminho principal) ─────────────────────────────────

@pytest.mark.django_db
class TestV32ValidTransitions:
    @pytest.mark.parametrize('from_status,to_status', [
        ('qualified', 'meeting_invite'),
        ('follow_up', 'meeting_invite'),       # reativação
        ('meeting_invite', 'scheduled'),
        ('scheduled', 'pre_meeting'),
        ('pre_meeting', 'meeting_1_done'),
        ('meeting_1_done', 'tech_analysis'),
        ('meeting_done', 'tech_analysis'),     # legado em voo (convivência)
        ('tech_analysis', 'meeting_2_done'),
        ('meeting_2_done', 'proposal'),
        ('won', 'data_collection'),
        ('proposal', 'data_collection'),       # v32: aprovar a proposta -> Coleta
        ('coleta_de_dados', 'data_collection'),  # sinônimos (legado/novo)
    ])
    def test_valid_transition(self, manager_client, manager_user, from_status, to_status):
        prospect = make_prospect(manager_user, status=from_status)
        response = manager_client.patch(f'{URL}{prospect.id}/', {'status': to_status})
        assert response.status_code == status.HTTP_200_OK, response.data
        prospect.refresh_from_db()
        assert prospect.status == to_status

    def test_new_statuses_in_choices(self):
        codes = {c[0] for c in Prospect.STATUS_CHOICES}
        for s in ('meeting_invite', 'meeting_1_done', 'tech_analysis',
                  'meeting_2_done', 'data_collection'):
            assert s in codes
        # Legados permanecem no enum (não deletar do banco)
        for s in ('meeting_done', 'production', 'concluded', 'not_closed', 'lost'):
            assert s in codes

    def test_leaving_new_status_is_free(self, manager_client, manager_user):
        """Escape hatch: sair de um status novo para um status antigo é livre."""
        prospect = make_prospect(manager_user, status='tech_analysis')
        response = manager_client.patch(f'{URL}{prospect.id}/', {'status': 'qualified'})
        assert response.status_code == status.HTTP_200_OK
        prospect.refresh_from_db()
        assert prospect.status == 'qualified'


# ─── Transições inválidas ────────────────────────────────────────────────────

@pytest.mark.django_db
class TestV32InvalidTransitions:
    @pytest.mark.parametrize('from_status,to_status', [
        ('new', 'meeting_invite'),
        ('new', 'tech_analysis'),
        ('qualified', 'meeting_2_done'),
        # ('proposal', 'data_collection') agora é VÁLIDA (v32: aprovar a
        # proposta move para a Coleta — doc 09 §T-E2E P0.2). Ver
        # TestV32ValidTransitions.
        ('scheduled', 'tech_analysis'),
        ('meeting_1_done', 'meeting_2_done'),  # pula a análise técnica
        ('qualifying', 'data_collection'),     # qualifying não é origem válida
    ])
    def test_invalid_transition_returns_400_and_keeps_state(
        self, manager_client, manager_user, from_status, to_status,
    ):
        prospect = make_prospect(manager_user, status=from_status)
        response = manager_client.patch(f'{URL}{prospect.id}/', {'status': to_status})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'status' in response.data
        prospect.refresh_from_db()
        assert prospect.status == from_status  # estado não mudou

    def test_invalid_transition_creates_no_activity_nor_audit(
        self, manager_client, manager_user,
    ):
        prospect = make_prospect(manager_user, status='new')
        before_act = ProspectActivity.objects.filter(prospect=prospect).count()
        before_audit = AuditLog.objects.filter(
            action='prospect_status_change', resource_id=str(prospect.id),
        ).count()
        manager_client.patch(f'{URL}{prospect.id}/', {'status': 'data_collection'})
        assert ProspectActivity.objects.filter(prospect=prospect).count() == before_act
        assert AuditLog.objects.filter(
            action='prospect_status_change', resource_id=str(prospect.id),
        ).count() == before_audit

    def test_same_status_patch_is_noop_allowed(self, manager_client, manager_user):
        """PATCH sem mudar status (ex: editar notas) não dispara validação."""
        prospect = make_prospect(manager_user, status='tech_analysis')
        response = manager_client.patch(
            f'{URL}{prospect.id}/',
            {'status': 'tech_analysis', 'tech_analysis_notes': 'Escopo macro definido'},
        )
        assert response.status_code == status.HTTP_200_OK
        prospect.refresh_from_db()
        assert prospect.tech_analysis_notes == 'Escopo macro definido'


# ─── Auditoria (log_audit old/new) ──────────────────────────────────────────

@pytest.mark.django_db
class TestV32StatusAudit:
    def test_status_change_creates_audit_log_with_old_new(self, manager_client, manager_user):
        prospect = make_prospect(manager_user, status='qualified')
        response = manager_client.patch(f'{URL}{prospect.id}/', {'status': 'meeting_invite'})
        assert response.status_code == status.HTTP_200_OK
        entry = AuditLog.objects.filter(
            action='prospect_status_change', resource_id=str(prospect.id),
        ).order_by('-id').first()
        assert entry is not None
        assert entry.old_value == {'status': 'qualified'}
        assert entry.new_value == {'status': 'meeting_invite'}
        assert entry.resource_type == 'prospect'
        assert entry.user_id == manager_user.id

    def test_legacy_transition_also_audited(self, manager_client, manager_user):
        """Auditoria cobre TODA transição, não só as dos status novos."""
        prospect = make_prospect(manager_user, status='new')
        manager_client.patch(f'{URL}{prospect.id}/', {'status': 'qualifying'})
        entry = AuditLog.objects.filter(
            action='prospect_status_change', resource_id=str(prospect.id),
        ).order_by('-id').first()
        assert entry is not None
        assert entry.old_value == {'status': 'new'}
        assert entry.new_value == {'status': 'qualifying'}

    def test_mark_attended_sets_meeting_1_done_and_audits(self, manager_client, manager_user):
        prospect = make_prospect(manager_user, status='pre_meeting')
        response = manager_client.post(f'{URL}{prospect.id}/mark_attended/', {})
        assert response.status_code == status.HTTP_200_OK
        prospect.refresh_from_db()
        assert prospect.status == 'meeting_1_done'
        assert prospect.meeting_attended is True
        entry = AuditLog.objects.filter(
            action='prospect_status_change', resource_id=str(prospect.id),
        ).order_by('-id').first()
        assert entry is not None
        assert entry.new_value == {'status': 'meeting_1_done'}


# ─── ProspectActivity automática ─────────────────────────────────────────────

@pytest.mark.django_db
class TestV32AutoActivity:
    @pytest.mark.parametrize('from_status,to_status', [
        ('qualified', 'meeting_invite'),
        ('meeting_1_done', 'tech_analysis'),
        ('tech_analysis', 'meeting_2_done'),
        ('won', 'data_collection'),
    ])
    def test_new_status_creates_specific_activity(
        self, manager_client, manager_user, from_status, to_status,
    ):
        prospect = make_prospect(manager_user, status=from_status)
        manager_client.patch(f'{URL}{prospect.id}/', {'status': to_status})
        activity = ProspectActivity.objects.filter(
            prospect=prospect, activity_type=to_status,
        ).first()
        assert activity is not None, f'sem atividade {to_status}'
        assert activity.created_by == manager_user

    def test_legacy_status_change_keeps_generic_activity(self, manager_client, manager_user):
        prospect = make_prospect(manager_user, status='new')
        manager_client.patch(f'{URL}{prospect.id}/', {'status': 'qualifying'})
        assert ProspectActivity.objects.filter(
            prospect=prospect, activity_type='status_changed',
        ).exists()


# ─── Data migration 0033 (meeting_done -> meeting_1_done) ───────────────────

@pytest.mark.django_db
class TestDataMigrationMeetingDone:
    def _get_migration_funcs(self):
        import importlib
        module = importlib.import_module(
            'sales.migrations.0033_rename_meeting_done_data'
        )
        return module.forward, module.backward

    def test_forward_renames_meeting_done(self, manager_user):
        from django.apps import apps
        prospect = make_prospect(manager_user, status='meeting_done')
        other = make_prospect(
            manager_user, status='qualified', company_name='Outro Co',
        )
        forward, _ = self._get_migration_funcs()
        forward(apps, None)
        prospect.refresh_from_db()
        other.refresh_from_db()
        assert prospect.status == 'meeting_1_done'
        assert other.status == 'qualified'  # demais status intocados

    def test_backward_restores_meeting_done(self, manager_user):
        from django.apps import apps
        prospect = make_prospect(manager_user, status='meeting_done')
        forward, backward = self._get_migration_funcs()
        forward(apps, None)
        prospect.refresh_from_db()
        assert prospect.status == 'meeting_1_done'
        backward(apps, None)
        prospect.refresh_from_db()
        assert prospect.status == 'meeting_done'


# ─── Permissões ──────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestV32Permissions:
    def test_viewer_cannot_transition_status(self, viewer_client, manager_user):
        prospect = make_prospect(manager_user, status='qualified')
        response = viewer_client.patch(f'{URL}{prospect.id}/', {'status': 'meeting_invite'})
        assert response.status_code == status.HTTP_403_FORBIDDEN
        prospect.refresh_from_db()
        assert prospect.status == 'qualified'

    def test_anonymous_cannot_transition_status(self, api_client, manager_user):
        prospect = make_prospect(manager_user, status='qualified')
        response = api_client.patch(f'{URL}{prospect.id}/', {'status': 'meeting_invite'})
        assert response.status_code in (
            status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN,
        )

    def test_viewer_can_read_but_not_write_prospects(self, viewer_client, manager_user):
        """P2.8: ProspectViewSet usa HasSectorAccess('comercial') — viewer lê
        globalmente (matriz F3) mas NÃO escreve (PATCH negado)."""
        prospect = make_prospect(manager_user, status='tech_analysis')
        # leitura permitida (F3: viewer = leitura global)
        response = viewer_client.get(f'{URL}{prospect.id}/')
        assert response.status_code == status.HTTP_200_OK
        # escrita negada
        patch = viewer_client.patch(
            f'{URL}{prospect.id}/', {'status': 'meeting_2_done'}, format='json',
        )
        assert patch.status_code == status.HTTP_403_FORBIDDEN

    def test_serializer_redacts_tech_analysis_notes_for_viewer(
        self, viewer_user, manager_user,
    ):
        """tech_analysis_notes entra em _SENSITIVE_FIELDS (LGPD) — ocultado
        na representação para role=viewer (mesma regra do meeting_transcript)."""
        from rest_framework.test import APIRequestFactory
        from sales.serializers import ProspectSerializer

        prospect = make_prospect(
            manager_user, status='tech_analysis',
            tech_analysis_notes='Escopo confidencial',
        )
        request = APIRequestFactory().get('/')
        request.user = viewer_user
        data = ProspectSerializer(prospect, context={'request': request}).data
        assert 'tech_analysis_notes' not in data

    def test_manager_sees_tech_analysis_notes(self, manager_client, manager_user):
        prospect = make_prospect(
            manager_user, status='tech_analysis',
            tech_analysis_notes='Escopo macro',
        )
        response = manager_client.get(f'{URL}{prospect.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['tech_analysis_notes'] == 'Escopo macro'


# ─── Campos novos (Reunião 2 + análise técnica) ─────────────────────────────

@pytest.mark.django_db
class TestV32NewFields:
    def test_patch_meeting_2_and_tech_analysis_fields(self, manager_client, manager_user):
        prospect = make_prospect(manager_user, status='tech_analysis')
        payload = {
            'project_type': 'recorrente',
            'meeting_2_scheduled_at': '2026-06-20T14:00:00-03:00',
            'meeting_2_link': 'https://meet.google.com/abc-defg-hij',
            'meeting_2_attended': True,
            'tech_analysis_notes': 'Escopo: ERP + integração',
            'estimated_deadline_days': 45,
        }
        response = manager_client.patch(f'{URL}{prospect.id}/', payload)
        assert response.status_code == status.HTTP_200_OK, response.data
        prospect.refresh_from_db()
        assert prospect.project_type == 'recorrente'
        assert prospect.meeting_2_link == 'https://meet.google.com/abc-defg-hij'
        assert prospect.meeting_2_attended is True
        assert prospect.tech_analysis_notes == 'Escopo: ERP + integração'
        assert prospect.estimated_deadline_days == 45

    def test_project_type_invalid_choice_rejected(self, manager_client, manager_user):
        prospect = make_prospect(manager_user, status='tech_analysis')
        response = manager_client.patch(f'{URL}{prospect.id}/', {'project_type': 'invalido'})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_pipeline_endpoint_includes_new_statuses(self, manager_client, manager_user):
        make_prospect(manager_user, status='tech_analysis')
        response = manager_client.get(f'{URL}pipeline/')
        assert response.status_code == status.HTTP_200_OK
        statuses = [row['status'] for row in response.data]
        for s in ('meeting_invite', 'meeting_1_done', 'tech_analysis',
                  'meeting_2_done', 'data_collection'):
            assert s in statuses
        # caminho principal vem na ordem do doc
        assert statuses.index('meeting_invite') < statuses.index('scheduled')
        assert statuses.index('won') < statuses.index('data_collection')

    def test_create_onboarding_allowed_in_data_collection(
        self, manager_client, manager_user,
    ):
        prospect = make_prospect(manager_user, status='data_collection')
        response = manager_client.post(f'{URL}{prospect.id}/create-onboarding/', {})
        assert response.status_code in (
            status.HTTP_200_OK, status.HTTP_201_CREATED,
        ), response.data

    @pytest.mark.parametrize('status_value', [
        'coleta_de_dados', 'projeto_fechado', 'em_producao',  # v32 novos
        'won', 'production',                                  # legados
    ])
    def test_create_onboarding_allowed_in_v32_statuses(
        self, manager_client, manager_user, status_value,
    ):
        """P0.2/T01: o link do forms precisa estar disponível em Coleta de
        Dados (status novo coleta_de_dados) e nos demais fechados."""
        prospect = make_prospect(manager_user, status=status_value)
        response = manager_client.post(f'{URL}{prospect.id}/create-onboarding/', {})
        assert response.status_code in (
            status.HTTP_200_OK, status.HTTP_201_CREATED,
        ), (status_value, response.data)

    def test_create_onboarding_rejected_before_collection(
        self, manager_client, manager_user,
    ):
        """Antes da Coleta (ex.: proposta), ainda recusa o cadastro."""
        prospect = make_prospect(manager_user, status='proposal')
        response = manager_client.post(f'{URL}{prospect.id}/create-onboarding/', {})
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ─── SEC-004: masking de PII do Customer para viewer ────────────────────────

def make_customer(user, **kwargs):
    defaults = dict(
        company_name='Cliente SEC Co',
        customer_type='PJ',
        document='12.345.678/0001-99',
        email='financeiro@clientesec.com',
        phone='(41) 98765-4321',
        contacts=[{'name': 'Ana', 'email': 'ana@clientesec.com',
                   'phone': '(41) 91234-5678', 'role': 'Compras'}],
        created_by=user,
    )
    defaults.update(kwargs)
    return Customer.objects.create(**defaults)


@pytest.mark.django_db
class TestCustomerPiiMasking:
    """SEC-004: CustomerSerializer mascara document/email/phone e zera contacts
    para role=viewer; admin/manager/operator mantêm completo. Espelha a regra de
    masking do Prospect (tech_analysis_notes / _SENSITIVE_FIELDS)."""

    def _serialize(self, customer, user):
        from rest_framework.test import APIRequestFactory
        from sales.serializers import CustomerSerializer
        request = APIRequestFactory().get('/')
        request.user = user
        return CustomerSerializer(customer, context={'request': request}).data

    def test_viewer_receives_masked_pii(self, viewer_user, manager_user):
        customer = make_customer(manager_user)
        data = self._serialize(customer, viewer_user)
        assert data['document'] == '***.***.***-99'
        assert data['email'] == 'fi******ro@***.com'
        assert data['phone'] == '(41) *****-4321'
        assert data['contacts'] == []

    def test_manager_receives_full_pii(self, manager_user):
        customer = make_customer(manager_user)
        data = self._serialize(customer, manager_user)
        assert data['document'] == '12.345.678/0001-99'
        assert data['email'] == 'financeiro@clientesec.com'
        assert data['phone'] == '(41) 98765-4321'
        assert len(data['contacts']) == 1


# ─── SEC-014: auditoria de mudança de PII do Customer ───────────────────────

@pytest.mark.django_db
class TestCustomerPiiAudit:
    """SEC-014: PATCH que altera document/email/phone gera registro em
    audit_log (action=customer_pii_change). Espelha _audit_status_change."""

    CUST_URL = '/api/v1/sales/customers/'

    def test_patch_changing_pii_creates_audit_log(self, manager_client, manager_user):
        customer = make_customer(manager_user, email='old@clientesec.com')
        response = manager_client.patch(
            f'{self.CUST_URL}{customer.id}/',
            {'email': 'new@clientesec.com', 'document': '98.765.432/0001-11'},
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        entry = AuditLog.objects.filter(
            action='customer_pii_change', resource_id=str(customer.id),
        ).order_by('-id').first()
        assert entry is not None
        assert entry.resource_type == 'customer'
        assert entry.user_id == manager_user.id
        assert entry.old_value.get('email') == 'old@clientesec.com'
        assert entry.new_value.get('email') == 'new@clientesec.com'
        assert entry.new_value.get('document') == '98.765.432/0001-11'

    def test_patch_without_pii_change_creates_no_audit(self, manager_client, manager_user):
        customer = make_customer(manager_user)
        before = AuditLog.objects.filter(
            action='customer_pii_change', resource_id=str(customer.id),
        ).count()
        response = manager_client.patch(
            f'{self.CUST_URL}{customer.id}/', {'notes': 'apenas uma nota'},
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        assert AuditLog.objects.filter(
            action='customer_pii_change', resource_id=str(customer.id),
        ).count() == before
