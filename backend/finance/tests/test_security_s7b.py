"""Testes S7B (RBAC) — backend/finance.

Cobre:
- S7B.10: CategoryViewSet — escrita só admin/manager (operator era write-eligible
  no IsAdminOrManagerOrOperator, podendo recriar plano de contas).
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from finance.models import Category

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='s7b_fin_admin', email='s7b_fin@admin.com',
        password='pass12345', role='admin',
    )


@pytest.fixture
def manager_user(db):
    return User.objects.create_user(
        username='s7b_fin_mgr', email='s7b_fin@mgr.com',
        password='pass12345', role='manager',
    )


@pytest.fixture
def operator_user(db):
    return User.objects.create_user(
        username='s7b_fin_op', email='s7b_fin@op.com',
        password='pass12345', role='operator',
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username='s7b_fin_view', email='s7b_fin@view.com',
        password='pass12345', role='viewer',
    )


def _client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


@pytest.mark.django_db
class TestS7B_10_FinanceCategoryWriteRestriction:
    URL = '/api/v1/finance/categories/'

    def test_operator_cannot_create(self, api_client, operator_user):
        c = _client(api_client, operator_user)
        r = c.post(self.URL, {
            'name': 'Cat Op',
            'category_type': 'income',
        }, format='json')
        assert r.status_code == 403

    def test_operator_cannot_patch(self, api_client, operator_user):
        cat = Category.objects.create(name='Cat Original', category_type='income')
        c = _client(api_client, operator_user)
        r = c.patch(
            f'{self.URL}{cat.id}/',
            {'name': 'cat hacked'},
            format='json',
        )
        assert r.status_code == 403
        cat.refresh_from_db()
        assert cat.name == 'Cat Original'

    def test_operator_cannot_delete(self, api_client, operator_user):
        cat = Category.objects.create(name='Cat Del', category_type='expense')
        c = _client(api_client, operator_user)
        r = c.delete(f'{self.URL}{cat.id}/')
        assert r.status_code == 403
        # is_active filter no queryset → DELETE faz soft-delete? Verifica que
        # persiste mesmo após chamada.
        assert Category.objects.filter(id=cat.id).exists()

    def test_operator_can_list(self, api_client, operator_user):
        Category.objects.create(name='Visible', category_type='income')
        c = _client(api_client, operator_user)
        r = c.get(self.URL)
        assert r.status_code == 200

    def test_viewer_can_list(self, api_client, viewer_user):
        Category.objects.create(name='View OK', category_type='income')
        c = _client(api_client, viewer_user)
        r = c.get(self.URL)
        assert r.status_code == 200

    def test_admin_can_create(self, api_client, admin_user):
        c = _client(api_client, admin_user)
        r = c.post(self.URL, {
            'name': 'Cat Admin',
            'category_type': 'income',
        }, format='json')
        assert r.status_code == 201

    def test_manager_can_create(self, api_client, manager_user):
        c = _client(api_client, manager_user)
        r = c.post(self.URL, {
            'name': 'Cat Mgr',
            'category_type': 'expense',
        }, format='json')
        assert r.status_code == 201
