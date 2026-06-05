"""Testes S7B (RBAC/Mass-assignment) — backend/support.

Cobre:
- S7B.5: TicketComment.is_internal mass-assignment + viewer drift LIST vs DETAIL
- S7B.10: SLAPolicy / SupportCategory — escrita só admin/manager
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from support.models import (
    SLAPolicy, SupportCategory, SupportTicket, TicketComment,
)

User = get_user_model()


# ─── Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='s7b_sup_admin', email='s7b_sup@admin.com',
        password='pass12345', role='admin',
    )


@pytest.fixture
def manager_user(db):
    return User.objects.create_user(
        username='s7b_sup_mgr', email='s7b_sup@mgr.com',
        password='pass12345', role='manager',
    )


@pytest.fixture
def operator_user(db):
    return User.objects.create_user(
        username='s7b_sup_op', email='s7b_sup@op.com',
        password='pass12345', role='operator',
    )


@pytest.fixture
def operator2_user(db):
    return User.objects.create_user(
        username='s7b_sup_op2', email='s7b_sup@op2.com',
        password='pass12345', role='operator',
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username='s7b_sup_view', email='s7b_sup@view.com',
        password='pass12345', role='viewer',
    )


@pytest.fixture
def ticket(db, admin_user):
    return SupportTicket.objects.create(
        number='TKT-S7B-001',
        title='Ticket S7B',
        description='Teste',
        ticket_type='bug',
        priority='medium',
        status='open',
        created_by=admin_user,
    )


def _client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


# ─── S7B.5: TicketComment.is_internal mass-assignment + viewer drift ──────


@pytest.mark.django_db
class TestS7B_5_TicketCommentIsInternal:
    URL = '/api/v1/support/comments/'

    def test_operator_cannot_set_is_internal_on_create(
        self, api_client, ticket, operator_user,
    ):
        c = _client(api_client, operator_user)
        r = c.post(self.URL, {
            'ticket': ticket.id,
            'content': 'comment público forced internal',
            'is_internal': True,
        }, format='json')
        assert r.status_code == 201
        comment = TicketComment.objects.get(id=r.json()['id'])
        # is_internal foi ignorado (read_only no serializer padrão)
        assert comment.is_internal is False

    def test_operator_cannot_flip_is_internal_on_patch(
        self, api_client, ticket, operator_user,
    ):
        comment = TicketComment.objects.create(
            ticket=ticket, user=operator_user,
            content='público', is_internal=False,
        )
        c = _client(api_client, operator_user)
        r = c.patch(
            f'{self.URL}{comment.id}/',
            {'is_internal': True},
            format='json',
        )
        # PATCH passa (status 200) mas o campo é ignorado
        assert r.status_code == 200
        comment.refresh_from_db()
        assert comment.is_internal is False

    def test_admin_can_set_is_internal_via_dedicated_action(
        self, api_client, ticket, admin_user,
    ):
        comment = TicketComment.objects.create(
            ticket=ticket, user=admin_user,
            content='comentário interno via action',
            is_internal=False,
        )
        c = _client(api_client, admin_user)
        r = c.post(
            f'{self.URL}{comment.id}/set_internal/',
            {'is_internal': True},
            format='json',
        )
        assert r.status_code == 200
        comment.refresh_from_db()
        assert comment.is_internal is True

    def test_operator_blocked_from_set_internal_action(
        self, api_client, ticket, operator_user,
    ):
        comment = TicketComment.objects.create(
            ticket=ticket, user=operator_user,
            content='comment', is_internal=False,
        )
        c = _client(api_client, operator_user)
        r = c.post(
            f'{self.URL}{comment.id}/set_internal/',
            {'is_internal': True},
            format='json',
        )
        assert r.status_code == 403
        comment.refresh_from_db()
        assert comment.is_internal is False

    def test_viewer_cannot_list_internal_comments(
        self, api_client, ticket, admin_user, viewer_user,
    ):
        internal = TicketComment.objects.create(
            ticket=ticket, user=admin_user,
            content='internal only', is_internal=True,
        )
        public = TicketComment.objects.create(
            ticket=ticket, user=admin_user,
            content='public', is_internal=False,
        )
        c = _client(api_client, viewer_user)
        r = c.get(f'{self.URL}?ticket={ticket.id}')
        assert r.status_code == 200
        data = r.json()
        ids = [item['id'] for item in (data.get('results') or data)]
        assert internal.id not in ids
        assert public.id in ids

    def test_viewer_cannot_retrieve_internal_comment_directly(
        self, api_client, ticket, admin_user, viewer_user,
    ):
        """S7B.5 drift fix — DETAIL deve filtrar como LIST.

        Antes do fix, viewer fazia GET /comments/<pk>/ e enxergava comentário
        interno (queryset filtrava só em LIST).
        """
        internal = TicketComment.objects.create(
            ticket=ticket, user=admin_user,
            content='internal only', is_internal=True,
        )
        c = _client(api_client, viewer_user)
        r = c.get(f'{self.URL}{internal.id}/')
        assert r.status_code == 404


# ─── S7B.10: SLAPolicy / SupportCategory write admin/manager only ─────────


@pytest.mark.django_db
class TestS7B_10_SLAPolicyWriteRestriction:
    URL = '/api/v1/support/sla-policies/'

    def test_operator_cannot_create(self, api_client, operator_user):
        c = _client(api_client, operator_user)
        r = c.post(self.URL, {
            'name': 'SLA Operator Forced',
            'description': 'should not be created',
        }, format='json')
        assert r.status_code == 403

    def test_operator_cannot_patch(self, api_client, operator_user):
        policy = SLAPolicy.objects.create(name='SLA Test')
        c = _client(api_client, operator_user)
        r = c.patch(
            f'{self.URL}{policy.id}/',
            {'name': 'changed'},
            format='json',
        )
        assert r.status_code == 403
        policy.refresh_from_db()
        assert policy.name == 'SLA Test'

    def test_operator_cannot_delete(self, api_client, operator_user):
        policy = SLAPolicy.objects.create(name='SLA Test Del')
        c = _client(api_client, operator_user)
        r = c.delete(f'{self.URL}{policy.id}/')
        assert r.status_code == 403
        assert SLAPolicy.objects.filter(id=policy.id).exists()

    def test_operator_can_list(self, api_client, operator_user):
        SLAPolicy.objects.create(name='SLA Visible')
        c = _client(api_client, operator_user)
        r = c.get(self.URL)
        assert r.status_code == 200

    def test_manager_can_create(self, api_client, manager_user):
        c = _client(api_client, manager_user)
        r = c.post(self.URL, {
            'name': 'SLA Manager',
            'description': 'allowed',
        }, format='json')
        assert r.status_code == 201

    def test_admin_can_create(self, api_client, admin_user):
        c = _client(api_client, admin_user)
        r = c.post(self.URL, {
            'name': 'SLA Admin',
            'description': 'allowed',
        }, format='json')
        assert r.status_code == 201


@pytest.mark.django_db
class TestS7B_10_SupportCategoryWriteRestriction:
    URL = '/api/v1/support/categories/'

    def test_operator_cannot_create(self, api_client, operator_user):
        c = _client(api_client, operator_user)
        r = c.post(self.URL, {'name': 'Cat Op Forced'}, format='json')
        assert r.status_code == 403

    def test_operator_cannot_patch(self, api_client, operator_user):
        cat = SupportCategory.objects.create(name='Cat Existing')
        c = _client(api_client, operator_user)
        r = c.patch(
            f'{self.URL}{cat.id}/',
            {'name': 'hacked'},
            format='json',
        )
        assert r.status_code == 403
        cat.refresh_from_db()
        assert cat.name == 'Cat Existing'

    def test_admin_can_create(self, api_client, admin_user):
        c = _client(api_client, admin_user)
        r = c.post(self.URL, {'name': 'Cat Admin'}, format='json')
        assert r.status_code == 201

    def test_manager_can_create(self, api_client, manager_user):
        c = _client(api_client, manager_user)
        r = c.post(self.URL, {'name': 'Cat Mgr'}, format='json')
        assert r.status_code == 201

    def test_operator_can_list(self, api_client, operator_user):
        SupportCategory.objects.create(name='Cat Visible')
        c = _client(api_client, operator_user)
        r = c.get(self.URL)
        assert r.status_code == 200
