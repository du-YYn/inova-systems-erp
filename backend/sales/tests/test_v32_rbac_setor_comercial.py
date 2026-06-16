"""v32 ajustes (doc 09 §T-E2E P2.8) — RBAC por setor no Comercial.

O Comercial deixa de usar role-based puro (IsAdminOrManagerOrOperatorStrict)
e passa a usar HasSectorAccess('comercial') (padrão F3), espelhando o
Financeiro. Consequências validadas aqui:

- operador/gerente DO setor comercial escreve no CRM (antes qualquer
  operator/manager global escrevia — segregação inexistente);
- operador de OUTRO setor (ex.: financeiro) só LÊ — não cria/edita prospect.
  Fecha o bug do teste E2E (fran/financeiro conseguia criar prospect);
- viewer lê globalmente (padrão F3);
- admin mantém bypass total;
- partner não acessa recursos de setor.

Os endpoints PÚBLICOS (website-lead) e n8n NÃO usam estas ViewSets — vivem
em views_public.py / n8n_views.py com auth própria — então continuam intactos
e não são exercitados aqui (cobertos pelos seus próprios testes).
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from sales.models import Prospect

User = get_user_model()

PROSPECTS_URL = '/api/v1/sales/prospects/'


def _user(username, role, sectors=None):
    return User.objects.create_user(
        username=username, email=f'{username}@rbaccom.com',
        password='pass12345', role=role, sectors=sectors or [],
    )


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def admin_user(db):
    return _user('rbaccom_admin', 'admin')


def _prospect_payload():
    return {
        'company_name': 'RBAC Comercial Co',
        'contact_name': 'Contato RBAC',
        'contact_email': 'contato@rbaccom.com',
        'source': 'website',
        'status': 'new',
    }


@pytest.mark.django_db
class TestCommercialSectorRBAC:
    def test_commercial_operator_can_create_prospect(self, db):
        """Operador do setor comercial ESCREVE no CRM."""
        client = _client(_user('com_op', 'operator', ['comercial']))
        r = client.post(PROSPECTS_URL, _prospect_payload(), format='json')
        assert r.status_code == status.HTTP_201_CREATED, r.data

    def test_commercial_manager_can_create_prospect(self, db):
        client = _client(_user('com_mgr', 'manager', ['comercial']))
        r = client.post(PROSPECTS_URL, _prospect_payload(), format='json')
        assert r.status_code == status.HTTP_201_CREATED, r.data

    def test_finance_operator_can_read_but_not_write(self, db, admin_user):
        """BUG E2E: financeiro NÃO pode criar prospect (só lê o Comercial)."""
        Prospect.objects.create(
            company_name='Lead Visível', contact_name='C',
            source='website', status='new', created_by=admin_user,
        )
        client = _client(_user('fin_op', 'operator', ['financeiro']))
        # leitura permitida (matriz F3: financeiro lê comercial)
        assert client.get(PROSPECTS_URL).status_code == status.HTTP_200_OK
        # escrita negada (Comercial não é escrito pelo Financeiro)
        r = client.post(PROSPECTS_URL, _prospect_payload(), format='json')
        assert r.status_code == status.HTTP_403_FORBIDDEN

    def test_operator_without_any_sector_reads_but_write_fail_closed(self, db):
        """SEC-002: operador SEM sectors mantém a LEITURA legada (não é trancado
        no deploy numa base de produção sem `sectors`), mas a ESCRITA é
        fail-closed (403). Assim que recebe um setor, a regra por setor passa a
        valer (ver test_finance_operator_can_read_but_not_write)."""
        client = _client(_user('no_sector_com', 'operator', []))
        assert client.get(PROSPECTS_URL).status_code == status.HTTP_200_OK
        r = client.post(PROSPECTS_URL, _prospect_payload(), format='json')
        assert r.status_code == status.HTTP_403_FORBIDDEN

    def test_viewer_reads_globally(self, db):
        client = _client(_user('rbaccom_viewer', 'viewer'))
        assert client.get(PROSPECTS_URL).status_code == status.HTTP_200_OK
        r = client.post(PROSPECTS_URL, _prospect_payload(), format='json')
        assert r.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_bypass(self, admin_user):
        client = _client(admin_user)
        r = client.post(PROSPECTS_URL, _prospect_payload(), format='json')
        assert r.status_code == status.HTTP_201_CREATED, r.data

    def test_partner_has_no_access(self, db):
        client = _client(_user('rbaccom_partner', 'partner'))
        assert client.get(PROSPECTS_URL).status_code == status.HTTP_403_FORBIDDEN
        r = client.post(PROSPECTS_URL, _prospect_payload(), format='json')
        assert r.status_code == status.HTTP_403_FORBIDDEN

    def test_proposals_endpoint_also_segregated(self, db):
        """A segregação cobre todas as ViewSets do Comercial (não só prospects)."""
        client = _client(_user('fin_op2', 'operator', ['financeiro']))
        # financeiro lê propostas mas não escreve
        assert client.get(
            '/api/v1/sales/proposals/').status_code == status.HTTP_200_OK
        r = client.post('/api/v1/sales/proposals/', {
            'title': 'Bloqueada', 'proposal_type': 'software_dev',
            'total_value': '1000.00', 'customer': None,
        }, format='json')
        assert r.status_code == status.HTTP_403_FORBIDDEN
