"""Testes do endpoint de exportação de dados em PDF (admin-only).

GET /api/v1/core/export-data/
- admin           → 200 + application/pdf + corpo começa com b'%PDF'
- viewer/operator → 403
- anônimo         → 401/403
"""
from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from sales.models import Customer, Prospect, Proposal, Contract
from projects.models import Project
from finance.models import Invoice

User = get_user_model()

EXPORT_URL = '/api/v1/core/export-data/'


# ─── FIXTURES ────────────────────────────────────────────────────────────────

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='export_admin', email='export_admin@test.com',
        password='admin_pass_123', role='admin',
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username='export_viewer', email='export_viewer@test.com',
        password='viewer_pass_123', role='viewer',
    )


@pytest.fixture
def operator_user(db):
    return User.objects.create_user(
        username='export_operator', email='export_operator@test.com',
        password='operator_pass_123', role='operator',
    )


@pytest.fixture
def sample_data(db, admin_user):
    """Cria um registro de cada modelo exportado para garantir que as
    tabelas do PDF sejam renderizadas com dados reais."""
    customer = Customer.objects.create(
        company_name='ACME Exportações Ltda',
        customer_type='PJ',
        document='12.345.678/0001-99',
        email='contato@acme.com',
        phone='(11) 99999-0000',
        city='São Paulo',
        state='SP',
        contract_value='5000.00',
        created_by=admin_user,
    )

    prospect = Prospect.objects.create(
        company_name='Lead Quente S/A',
        contact_name='João da Silva',
        contact_email='joao@leadquente.com',
        contact_phone='(21) 98888-1111',
        source='website',
        status='new',
        estimated_value='12000.00',
        created_by=admin_user,
    )

    proposal = Proposal.objects.create(
        customer=customer,
        number='PROP-0001',
        title='Proposta de Sistema Web',
        proposal_type='software_dev',
        billing_type='fixed',
        total_value='25000.00',
        valid_until=date.today() + timedelta(days=30),
        created_by=admin_user,
    )

    contract = Contract.objects.create(
        customer=customer,
        number='CTR-0001',
        title='Contrato de Manutenção Mensal',
        billing_type='monthly',
        start_date=date.today(),
        monthly_value='3000.00',
        status='active',
        created_by=admin_user,
    )

    project = Project.objects.create(
        name='Projeto ERP Interno',
        customer=customer,
        project_type='custom_dev',
        status='development',
        start_date=date.today(),
        deadline=date.today() + timedelta(days=90),
        budget_value='40000.00',
        progress=35,
        created_by=admin_user,
    )

    invoice = Invoice.objects.create(
        invoice_type='receivable',
        customer=customer,
        number='INV-0001',
        issue_date=date.today(),
        due_date=date.today() + timedelta(days=15),
        value='3000.00',
        total='3000.00',
        status='pending',
        created_by=admin_user,
    )

    return {
        'customer': customer, 'prospect': prospect, 'proposal': proposal,
        'contract': contract, 'project': project, 'invoice': invoice,
    }


# ─── TESTES ──────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestExportData:
    def test_admin_gets_pdf(self, api_client, admin_user, sample_data):
        api_client.force_authenticate(user=admin_user)
        res = api_client.get(EXPORT_URL)

        assert res.status_code == status.HTTP_200_OK
        assert res['Content-Type'] == 'application/pdf'
        assert 'attachment' in res['Content-Disposition']
        assert 'inova-export-dados.pdf' in res['Content-Disposition']

        body = res.getvalue() if hasattr(res, 'getvalue') else b''.join(res)
        assert body.startswith(b'%PDF')
        assert len(body) > 1000  # PDF com tabelas não é trivialmente pequeno

    def test_admin_gets_pdf_with_no_data(self, api_client, admin_user):
        """Sem registros, o PDF ainda deve ser gerado (seções vazias)."""
        api_client.force_authenticate(user=admin_user)
        res = api_client.get(EXPORT_URL)

        assert res.status_code == status.HTTP_200_OK
        assert res['Content-Type'] == 'application/pdf'
        body = res.getvalue() if hasattr(res, 'getvalue') else b''.join(res)
        assert body.startswith(b'%PDF')

    def test_viewer_forbidden(self, api_client, viewer_user, sample_data):
        api_client.force_authenticate(user=viewer_user)
        res = api_client.get(EXPORT_URL)
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_operator_forbidden(self, api_client, operator_user, sample_data):
        api_client.force_authenticate(user=operator_user)
        res = api_client.get(EXPORT_URL)
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_anonymous_denied(self, api_client):
        res = api_client.get(EXPORT_URL)
        assert res.status_code in (
            status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN,
        )
