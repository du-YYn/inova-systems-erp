"""Testes S7B (RBAC/IDOR) — backend/projects.

Cobre:
- S7B.1: TimeEntry IDOR — operator só vê/edita as próprias horas
- S7B.6: DeliveryApproval token-confusion — não aceita pk como token

Fixtures padronizadas conforme `backend/accounts/tests/test_security_s2.py`.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from projects.models import (
    DeliveryApproval, Milestone, Project, ProjectTask, TimeEntry,
)
from sales.models import Customer

User = get_user_model()


# ─── Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='s7b_proj_admin', email='s7b_proj@admin.com',
        password='pass12345', role='admin',
    )


@pytest.fixture
def manager_user(db):
    return User.objects.create_user(
        username='s7b_proj_mgr', email='s7b_proj@mgr.com',
        password='pass12345', role='manager',
    )


@pytest.fixture
def operator_user(db):
    return User.objects.create_user(
        username='s7b_proj_op', email='s7b_proj@op.com',
        password='pass12345', role='operator',
    )


@pytest.fixture
def operator2_user(db):
    return User.objects.create_user(
        username='s7b_proj_op2', email='s7b_proj@op2.com',
        password='pass12345', role='operator',
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username='s7b_proj_view', email='s7b_proj@view.com',
        password='pass12345', role='viewer',
    )


@pytest.fixture
def customer(db, admin_user):
    return Customer.objects.create(
        company_name='ACME S7B Projects',
        customer_type='PJ',
        email='acme-proj-s7b@test.com',
        created_by=admin_user,
    )


@pytest.fixture
def project(db, admin_user, customer):
    return Project.objects.create(
        name='Projeto S7B',
        customer=customer,
        start_date=date.today(),
        created_by=admin_user,
    )


def _client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


# ─── S7B.1: TimeEntry IDOR ────────────────────────────────────────────────


@pytest.mark.django_db
class TestS7B_1_TimeEntryIDOR:
    URL = '/api/v1/projects/time-entries/'

    def _make_entry(self, project, user, hours=Decimal('2.00')):
        return TimeEntry.objects.create(
            project=project, user=user,
            hours=hours, date=date.today(),
            description=f'Time entry from {user.username}',
        )

    def test_operator_list_only_own_entries(
        self, api_client, project, operator_user, operator2_user,
    ):
        own = self._make_entry(project, operator_user)
        other = self._make_entry(project, operator2_user, hours=Decimal('3.00'))

        c = _client(api_client, operator_user)
        r = c.get(self.URL)
        assert r.status_code == 200
        data = r.json()
        ids = [item['id'] for item in (data.get('results') or data)]
        assert own.id in ids
        assert other.id not in ids

    def test_operator_cannot_retrieve_peer_entry(
        self, api_client, project, operator_user, operator2_user,
    ):
        other = self._make_entry(project, operator2_user)
        c = _client(api_client, operator_user)
        r = c.get(f'{self.URL}{other.id}/')
        # queryset filtra → 404 (não 403, para não vazar existência)
        assert r.status_code == 404

    def test_operator_cannot_patch_peer_entry(
        self, api_client, project, operator_user, operator2_user,
    ):
        other = self._make_entry(project, operator2_user)
        c = _client(api_client, operator_user)
        r = c.patch(
            f'{self.URL}{other.id}/',
            {'hours': '10.00'}, format='json',
        )
        assert r.status_code == 404
        other.refresh_from_db()
        assert other.hours == Decimal('2.00')

    def test_operator_cannot_delete_peer_entry(
        self, api_client, project, operator_user, operator2_user,
    ):
        other = self._make_entry(project, operator2_user)
        c = _client(api_client, operator_user)
        r = c.delete(f'{self.URL}{other.id}/')
        assert r.status_code == 404
        assert TimeEntry.objects.filter(id=other.id).exists()

    def test_admin_sees_all_entries(
        self, api_client, project, admin_user, operator_user, operator2_user,
    ):
        e1 = self._make_entry(project, operator_user)
        e2 = self._make_entry(project, operator2_user)
        c = _client(api_client, admin_user)
        r = c.get(self.URL)
        assert r.status_code == 200
        data = r.json()
        ids = [item['id'] for item in (data.get('results') or data)]
        assert e1.id in ids
        assert e2.id in ids

    def test_manager_sees_all_entries(
        self, api_client, project, manager_user, operator_user, operator2_user,
    ):
        e1 = self._make_entry(project, operator_user)
        e2 = self._make_entry(project, operator2_user)
        c = _client(api_client, manager_user)
        r = c.get(self.URL)
        assert r.status_code == 200
        data = r.json()
        ids = [item['id'] for item in (data.get('results') or data)]
        assert e1.id in ids
        assert e2.id in ids

    def test_admin_can_edit_peer_entry(
        self, api_client, project, admin_user, operator_user,
    ):
        entry = self._make_entry(project, operator_user)
        c = _client(api_client, admin_user)
        r = c.patch(
            f'{self.URL}{entry.id}/',
            {'hours': '5.00'}, format='json',
        )
        assert r.status_code == 200
        entry.refresh_from_db()
        assert entry.hours == Decimal('5.00')


# ─── S7B.6: DeliveryApproval token-confusion ──────────────────────────────


@pytest.mark.django_db
class TestS7B_6_DeliveryApprovalTokenConfusion:
    """O fix moveu `respond` para detail=False (sem pk na URL) e exige token
    explícito no body. Endpoint público sem auth."""

    URL = '/api/v1/projects/delivery-approvals/respond/'

    def _make_approval(self, project, admin_user, token='tok_' + 'x' * 32):
        milestone = Milestone.objects.create(
            project=project, name='Marco 1',
            due_date=date.today() + timedelta(days=30),
        )
        return DeliveryApproval.objects.create(
            milestone=milestone,
            project=project,
            token=token,
            expires_at=timezone.now() + timedelta(days=30),
            created_by=admin_user,
        )

    def test_pk_in_body_rejected_as_token(self, api_client, project, admin_user):
        """Garante que enviar id numérico (string curta) é 400."""
        self._make_approval(project, admin_user)
        # Mesmo enviando "1" (que seria um pk), tem que ser rejeitado por
        # tamanho mínimo de token.
        r = api_client.post(
            self.URL, {'token': '1', 'status': 'approved'}, format='json',
        )
        assert r.status_code == 400

    def test_missing_token_returns_400(self, api_client, project, admin_user):
        self._make_approval(project, admin_user)
        r = api_client.post(
            self.URL, {'status': 'approved'}, format='json',
        )
        assert r.status_code == 400
        assert 'token' in (r.json().get('error') or '').lower()

    def test_valid_token_accepted(self, api_client, project, admin_user):
        token = 'valid_tok_' + 'a' * 32
        approval = self._make_approval(project, admin_user, token=token)
        r = api_client.post(
            self.URL,
            {
                'token': token, 'status': 'approved',
                'client_name': 'Cliente Test',
                'client_email': 'cliente@test.com',
            },
            format='json',
        )
        assert r.status_code == 200
        approval.refresh_from_db()
        assert approval.status == 'approved'

    def test_unknown_token_returns_404(self, api_client):
        r = api_client.post(
            self.URL,
            {'token': 'unknown_' + 'z' * 32, 'status': 'approved'},
            format='json',
        )
        assert r.status_code == 404
