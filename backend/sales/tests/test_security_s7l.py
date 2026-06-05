"""Testes Sprint S7-L — Prospect/Sales residuais.

Cobre:
- S7L.5: ProspectViewSet filtra por assigned_to/created_by para operator
- S7L.6: DynamicPageSizePagination.max_page_size = 100 (era 500)
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from sales.models import Prospect
from sales.views import DynamicPageSizePagination

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def operator(db):
    return User.objects.create_user(
        username='s7l_op', email='s7l@op.com',
        password='SenhaFort3!@', role='operator',
    )


@pytest.fixture
def operator2(db):
    return User.objects.create_user(
        username='s7l_op2', email='s7l@op2.com',
        password='SenhaFort3!@', role='operator',
    )


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        username='s7l_admin', email='s7l@admin.com',
        password='SenhaFort3!@', role='admin',
    )


# ─── S7L.5: ProspectViewSet operator filter ────────────────────────

@pytest.mark.django_db
class TestProspectOperatorFilter:
    """Operator ve apenas prospects de que e responsavel (assigned_to/created_by)."""

    def test_operator_sees_only_own_prospects(self, api_client, operator, operator2):
        # Prospect do operator
        mine = Prospect.objects.create(
            company_name='Meu Lead', contact_name='Joao',
            assigned_to=operator, created_by=operator,
        )
        # Prospect do colega
        theirs = Prospect.objects.create(
            company_name='Lead Alheio', contact_name='Maria',
            assigned_to=operator2, created_by=operator2,
        )
        api_client.force_authenticate(user=operator)
        resp = api_client.get('/api/v1/sales/prospects/')
        assert resp.status_code == status.HTTP_200_OK
        ids = {p['id'] for p in resp.json().get('results', resp.json())}
        assert mine.id in ids
        assert theirs.id not in ids, (
            'operator viu prospect de outro time (escalada de PII)'
        )

    def test_admin_sees_all_prospects(self, api_client, admin, operator, operator2):
        Prospect.objects.create(
            company_name='Lead 1', contact_name='A',
            assigned_to=operator, created_by=operator,
        )
        Prospect.objects.create(
            company_name='Lead 2', contact_name='B',
            assigned_to=operator2, created_by=operator2,
        )
        api_client.force_authenticate(user=admin)
        resp = api_client.get('/api/v1/sales/prospects/')
        assert resp.status_code == status.HTTP_200_OK
        results = resp.json().get('results', resp.json())
        assert len(results) >= 2

    def test_operator_assigned_but_not_creator_still_sees(self, api_client, operator, operator2):
        """Operator nao criou mas e o assigned_to → deve ver."""
        p = Prospect.objects.create(
            company_name='Assigned Lead', contact_name='C',
            assigned_to=operator,  # operator e o responsavel
            created_by=operator2,  # outra pessoa criou
        )
        api_client.force_authenticate(user=operator)
        resp = api_client.get('/api/v1/sales/prospects/')
        ids = {x['id'] for x in resp.json().get('results', resp.json())}
        assert p.id in ids


# ─── S7L.6: max_page_size cap ──────────────────────────────────────

class TestPaginationCap:
    def test_max_page_size_is_100(self):
        assert DynamicPageSizePagination.max_page_size == 100, (
            'Era 500; reduzido para 100 (S7L) para limitar DoS/exfiltracao'
        )
