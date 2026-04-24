"""Testes de regressao da FASE 2 (RBAC hardening).

Cobre:
- F2.1: RegisterView admin-only (nao mais AllowAny)
- F2.2: EmployeeProfile restrito a admin/manager + serializer filtra salario
- F2.3: Absence approve/reject hierarquia + self-approval bloqueado
- F2.4: AbsenceSerializer.user read_only em create (derivado de request.user)
- F2.5: ChangeRequest approve/reject hierarquia + self-approval bloqueado
- F2.6: ProjectTemplate write restrito a admin/manager
- F2.7: 2FA enable exige senha + invalida sessoes
- F2.8: ProjectComment.user read_only em update
"""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

User = get_user_model()


# ─── Fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='s2_admin', email='s2@admin.com',
        password='pass12345', role='admin',
    )


@pytest.fixture
def manager_user(db):
    return User.objects.create_user(
        username='s2_mgr', email='s2@mgr.com',
        password='pass12345', role='manager',
    )


@pytest.fixture
def operator_user(db):
    return User.objects.create_user(
        username='s2_op', email='s2@op.com',
        password='pass12345', role='operator',
    )


@pytest.fixture
def operator2_user(db):
    return User.objects.create_user(
        username='s2_op2', email='s2@op2.com',
        password='pass12345', role='operator',
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username='s2_view', email='s2@view.com',
        password='pass12345', role='viewer',
    )


def _client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


# ─── F2.1: Register admin-only ────────────────────────────────────────────

@pytest.mark.django_db
class TestF2_1_RegisterAdminOnly:
    URL = '/api/v1/accounts/register/'

    def test_anonymous_blocked(self, api_client):
        r = api_client.post(self.URL, {
            'username': 'new1', 'email': 'new1@test.com',
            'password': 'abc12345xyz', 'password_confirm': 'abc12345xyz',
        }, format='json')
        assert r.status_code in (401, 403)

    def test_operator_blocked(self, api_client, operator_user):
        c = _client(api_client, operator_user)
        r = c.post(self.URL, {
            'username': 'new2', 'email': 'new2@test.com',
            'password': 'abc12345xyz', 'password_confirm': 'abc12345xyz',
        }, format='json')
        assert r.status_code == 403

    def test_admin_allowed(self, api_client, admin_user):
        c = _client(api_client, admin_user)
        r = c.post(self.URL, {
            'username': 'new3', 'email': 'new3@test.com',
            'password': 'abc12345xyz', 'password_confirm': 'abc12345xyz',
        }, format='json')
        assert r.status_code == 201


# ─── F2.2: EmployeeProfile restrito ───────────────────────────────────────

@pytest.mark.django_db
class TestF2_2_EmployeeProfile:
    URL = '/api/v1/accounts/employee-profiles/'

    def _make_profile(self, user, salary=Decimal('10000.00')):
        from accounts.models import EmployeeProfile
        return EmployeeProfile.objects.create(
            user=user, position='Dev',
            hourly_cost=Decimal('100'), monthly_salary=salary,
        )

    def test_operator_cannot_list_others(self, api_client, admin_user, operator_user):
        self._make_profile(admin_user)
        self._make_profile(operator_user, salary=Decimal('5000'))
        c = _client(api_client, operator_user)
        r = c.get(self.URL)
        assert r.status_code == 200
        # Operator so ve o proprio perfil
        results = r.data if isinstance(r.data, list) else r.data.get('results', r.data)
        assert len(results) == 1
        assert results[0]['user'] == operator_user.id

    def test_manager_can_list_all(self, api_client, admin_user, operator_user, manager_user):
        self._make_profile(admin_user)
        self._make_profile(operator_user)
        self._make_profile(manager_user)
        c = _client(api_client, manager_user)
        r = c.get(self.URL)
        assert r.status_code == 200

    def test_operator_self_profile_shows_salary(self, api_client, operator_user):
        self._make_profile(operator_user, salary=Decimal('5500'))
        c = _client(api_client, operator_user)
        r = c.get(f'{self.URL}me/')
        assert r.status_code == 200
        # Proprio perfil: ve salario
        assert 'monthly_salary' in r.data

    def test_viewer_cannot_create(self, api_client, viewer_user):
        c = _client(api_client, viewer_user)
        r = c.post(self.URL, {'position': 'X'}, format='json')
        assert r.status_code == 403


# ─── F2.3 + F2.4: Absence hierarchy + user read-only ─────────────────────

@pytest.mark.django_db
class TestF2_3_Absence:
    URL = '/api/v1/accounts/absences/'

    def _make_absence(self, user, status_='pending'):
        from accounts.models import Absence
        return Absence.objects.create(
            user=user, absence_type='vacation',
            start_date=timezone.now().date(),
            end_date=timezone.now().date(),
            status=status_, reason='teste',
        )

    def test_operator_cannot_self_approve(self, api_client, operator_user):
        absence = self._make_absence(operator_user)
        c = _client(api_client, operator_user)
        r = c.post(f'{self.URL}{absence.id}/approve/')
        # Operator nem deveria acessar approve (hierarquia), mas se fosse admin
        # e fosse dono, deveria bloquear self-approval.
        assert r.status_code in (403, 400)

    def test_manager_cannot_self_approve(self, api_client, manager_user):
        absence = self._make_absence(manager_user)
        c = _client(api_client, manager_user)
        r = c.post(f'{self.URL}{absence.id}/approve/')
        # F2.3: self-approval bloqueado mesmo sendo manager
        assert r.status_code == 403
        absence.refresh_from_db()
        assert absence.status == 'pending'

    def test_manager_can_approve_other(self, api_client, manager_user, operator_user):
        absence = self._make_absence(operator_user)
        c = _client(api_client, manager_user)
        r = c.post(f'{self.URL}{absence.id}/approve/')
        assert r.status_code == 200
        absence.refresh_from_db()
        assert absence.status == 'approved'
        assert absence.approved_by_id == manager_user.id

    def test_create_absence_cannot_spoof_user(
        self, api_client, operator_user, operator2_user,
    ):
        """F2.4: operator nao pode criar ausencia no nome de operator2."""
        c = _client(api_client, operator_user)
        r = c.post(self.URL, {
            'user': operator2_user.id,  # tentativa de spoofing
            'absence_type': 'vacation',
            'start_date': str(timezone.now().date()),
            'end_date': str(timezone.now().date()),
            'reason': 'ferias',
        }, format='json')
        assert r.status_code == 201
        # A ausencia foi criada com user = request.user (operator_user), nao operator2
        from accounts.models import Absence
        absence = Absence.objects.filter(reason='ferias').first()
        assert absence is not None
        assert absence.user_id == operator_user.id
        assert absence.user_id != operator2_user.id


# ─── F2.5: ChangeRequest hierarchy ────────────────────────────────────────

@pytest.mark.django_db
class TestF2_5_ChangeRequest:
    URL = '/api/v1/projects/change-requests/'

    def _make_project(self, admin_user, customer):
        from projects.models import Project
        return Project.objects.create(
            name='Proj S2', customer=customer,
            start_date=timezone.now().date(),
            created_by=admin_user,
        )

    def _make_cr(self, project, created_by):
        from projects.models import ChangeRequest
        return ChangeRequest.objects.create(
            project=project, title='Change S2',
            description='desc',
            created_by=created_by,
        )

    def test_operator_cannot_approve_own_cr(
        self, api_client, admin_user, operator_user,
    ):
        from sales.models import Customer
        cust = Customer.objects.create(
            customer_type='PJ', company_name='C-S2', created_by=admin_user,
        )
        proj = self._make_project(admin_user, cust)
        cr = self._make_cr(proj, operator_user)
        c = _client(api_client, operator_user)
        r = c.post(f'{self.URL}{cr.id}/approve/')
        # F2.5: operator nao tem hierarquia para aprovar
        assert r.status_code == 403

    def test_manager_cannot_approve_own_cr(
        self, api_client, admin_user, manager_user,
    ):
        from sales.models import Customer
        cust = Customer.objects.create(
            customer_type='PJ', company_name='C-S2B', created_by=admin_user,
        )
        proj = self._make_project(admin_user, cust)
        cr = self._make_cr(proj, manager_user)
        c = _client(api_client, manager_user)
        r = c.post(f'{self.URL}{cr.id}/approve/')
        assert r.status_code == 403
        cr.refresh_from_db()
        assert cr.status == 'pending'

    def test_admin_can_approve_others_cr(
        self, api_client, admin_user, operator_user,
    ):
        from sales.models import Customer
        cust = Customer.objects.create(
            customer_type='PJ', company_name='C-S2C', created_by=admin_user,
        )
        proj = self._make_project(admin_user, cust)
        cr = self._make_cr(proj, operator_user)
        c = _client(api_client, admin_user)
        r = c.post(f'{self.URL}{cr.id}/approve/')
        assert r.status_code == 200
        cr.refresh_from_db()
        assert cr.status == 'approved'


# ─── F2.6: ProjectTemplate restrito ───────────────────────────────────────

@pytest.mark.django_db
class TestF2_6_ProjectTemplate:
    URL = '/api/v1/projects/templates/'

    def test_operator_can_read_but_not_write(self, api_client, operator_user):
        c = _client(api_client, operator_user)
        r = c.get(self.URL)
        assert r.status_code == 200
        r = c.post(self.URL, {
            'name': 'Template X', 'description': 'desc',
        }, format='json')
        assert r.status_code == 403

    def test_manager_can_write(self, api_client, manager_user):
        c = _client(api_client, manager_user)
        r = c.post(self.URL, {
            'name': 'Template Mgr', 'description': 'desc',
        }, format='json')
        assert r.status_code in (200, 201)


# ─── F2.7: 2FA enable exige senha ─────────────────────────────────────────

@pytest.mark.django_db
class TestF2_7_TwoFactorEnable:
    URL = '/api/v1/accounts/2fa/setup/'

    def test_enable_without_password_blocked(self, api_client, operator_user):
        assert not operator_user.is_2fa_enabled
        c = _client(api_client, operator_user)
        r = c.post(self.URL, {}, format='json')
        assert r.status_code == 400
        operator_user.refresh_from_db()
        assert not operator_user.is_2fa_enabled

    def test_enable_wrong_password_blocked(self, api_client, operator_user):
        c = _client(api_client, operator_user)
        r = c.post(self.URL, {'password': 'wrong'}, format='json')
        assert r.status_code == 400
        operator_user.refresh_from_db()
        assert not operator_user.is_2fa_enabled

    def test_enable_correct_password_works(self, api_client, operator_user):
        c = _client(api_client, operator_user)
        r = c.post(self.URL, {'password': 'pass12345'}, format='json')
        assert r.status_code == 200
        assert 'secret' in r.data
        assert r.data.get('enabled') is True
        operator_user.refresh_from_db()
        assert operator_user.is_2fa_enabled


# ─── F2.8: ProjectComment.user read_only ──────────────────────────────────

@pytest.mark.django_db
class TestF2_8_ProjectComment:
    URL = '/api/v1/projects/project-comments/'

    def test_user_cannot_be_changed_via_patch(
        self, api_client, admin_user, operator_user, operator2_user,
    ):
        from sales.models import Customer
        from projects.models import Project, ProjectComment
        cust = Customer.objects.create(
            customer_type='PJ', company_name='C-S2-CMT', created_by=admin_user,
        )
        proj = Project.objects.create(
            name='Proj Comment', customer=cust,
            start_date=timezone.now().date(),
            created_by=admin_user,
        )
        comment = ProjectComment.objects.create(
            project=proj, user=operator_user, content='original',
        )
        c = _client(api_client, operator_user)
        r = c.patch(
            f'{self.URL}{comment.id}/',
            {'user': operator2_user.id, 'content': 'editado'},
            format='json',
        )
        assert r.status_code in (200, 403, 404)  # depende da permissao do viewset
        comment.refresh_from_db()
        # F2.8: user nao mudou
        assert comment.user_id == operator_user.id
