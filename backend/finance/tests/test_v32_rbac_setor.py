"""v32 ajustes (doc 09 §04 RBAC / gap E2E) — RBAC por setor no Financeiro.

O Financeiro deixa de usar role-based puro (IsAdminOrManager) e passa a usar
HasSectorAccess('financeiro') (padrão F3). Consequências validadas aqui:

- operador/gerente DO setor financeiro escreve no Financeiro (antes tomava 403
  por não ser admin/manager global);
- operador de OUTRO setor (ex.: comercial) só lê — não escreve no Financeiro
  (o Financeiro deixa de escrever no Comercial e vice-versa);
- viewer lê globalmente (padrão F3);
- admin mantém bypass total.
"""
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from finance.models import Invoice

User = get_user_model()

INVOICES_URL = '/api/v1/finance/invoices/'


@pytest.fixture
def api_client():
    return APIClient()


def _user(username, role, sectors=None):
    return User.objects.create_user(
        username=username, email=f'{username}@rbac.com',
        password='pass12345', role=role, sectors=sectors or [],
    )


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def admin_user(db):
    return _user('rbac_admin', 'admin')


def _invoice_payload():
    return {
        'invoice_type': 'receivable',
        'description': 'Teste RBAC',
        'value': '100.00',
        'total': '100.00',
        'issue_date': str(date.today()),
        'due_date': str(date.today()),
    }


@pytest.mark.django_db
class TestFinanceSectorRBAC:
    def test_finance_operator_can_create_invoice(self, db):
        """Operador do setor financeiro ESCREVE (gap E2E: tomava 403 antes)."""
        client = _client(_user('fin_op', 'operator', ['financeiro']))
        r = client.post(INVOICES_URL, _invoice_payload(), format='json')
        assert r.status_code == status.HTTP_201_CREATED, r.data

    def test_finance_manager_can_create_invoice(self, db):
        client = _client(_user('fin_mgr', 'manager', ['financeiro']))
        r = client.post(INVOICES_URL, _invoice_payload(), format='json')
        assert r.status_code == status.HTTP_201_CREATED, r.data

    def test_commercial_operator_can_read_but_not_write(self, db, admin_user):
        """Operador comercial LÊ o Financeiro (matriz F3) mas NÃO escreve."""
        Invoice.objects.create(
            invoice_type='receivable', number='REC-RBAC-1',
            issue_date=date.today(), due_date=date.today(),
            value=Decimal('100'), total=Decimal('100'),
            status='pending', created_by=admin_user,
        )
        client = _client(_user('com_op', 'operator', ['comercial']))
        # leitura permitida
        assert client.get(INVOICES_URL).status_code == status.HTTP_200_OK
        # escrita negada (Financeiro não é escrito pelo Comercial)
        r = client.post(INVOICES_URL, _invoice_payload(), format='json')
        assert r.status_code == status.HTTP_403_FORBIDDEN

    def test_operator_without_any_sector_falls_back_to_role(self, db):
        """H2 (code review): operador SEM sectors cai no comportamento legado
        role-based (lê + escreve como operator) — não é trancado no deploy do
        RBAC por setor numa base de produção sem `sectors`. Quando recebe um
        setor, a regra por setor passa a valer."""
        client = _client(_user('no_sector', 'operator', []))
        assert client.get(INVOICES_URL).status_code == status.HTTP_200_OK
        r = client.post(INVOICES_URL, _invoice_payload(), format='json')
        assert r.status_code == status.HTTP_201_CREATED, r.data

    def test_viewer_reads_globally(self, db):
        client = _client(_user('rbac_viewer', 'viewer'))
        assert client.get(INVOICES_URL).status_code == status.HTTP_200_OK
        r = client.post(INVOICES_URL, _invoice_payload(), format='json')
        assert r.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_bypass(self, admin_user):
        client = _client(admin_user)
        r = client.post(INVOICES_URL, _invoice_payload(), format='json')
        assert r.status_code == status.HTTP_201_CREATED, r.data

    def test_partner_has_no_access(self, db):
        client = _client(_user('rbac_partner', 'partner'))
        assert client.get(INVOICES_URL).status_code == status.HTTP_403_FORBIDDEN
