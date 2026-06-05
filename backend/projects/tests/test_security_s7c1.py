"""Testes de regressao Sprint S7-C1 (CRITICAL batch 1).

Cobre vulnerabilidades de mass assignment que burlavam actions com
self-approval/state machine:

- S7C1.1: Milestone.is_completed / completed_at via PATCH (bypassa action complete)
- S7C1.2: Milestone.invoice via PATCH permite linkar invoice de outro projeto/cliente
- S7C1.3: ChangeRequest.status / approved_at via PATCH (bypassa action approve)
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from projects.models import Project, Milestone, ChangeRequest
from sales.models import Customer

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def operator_user(db):
    return User.objects.create_user(
        username='s7c1_op', email='s7c1@op.com',
        password='pass12345', role='operator',
    )


@pytest.fixture
def operator_client(api_client, operator_user):
    api_client.force_authenticate(user=operator_user)
    return api_client


@pytest.fixture
def customer(db, operator_user):
    return Customer.objects.create(
        name='Cliente S7C1', email='cli@s7c1.com',
        document='12345678000100', customer_type='PJ',
        created_by=operator_user,
    )


@pytest.fixture
def project(db, customer, operator_user):
    return Project.objects.create(
        name='Projeto S7C1', customer=customer,
        status='active', billing_type='fixed',
        start_date=date.today(), deadline=date.today() + timedelta(days=30),
        budget_value=Decimal('10000'), created_by=operator_user,
    )


@pytest.fixture
def milestone(db, project):
    return Milestone.objects.create(
        project=project, name='M1', due_date=date.today() + timedelta(days=10),
        is_completed=False,
    )


@pytest.fixture
def change_request(db, project, operator_user):
    return ChangeRequest.objects.create(
        project=project, title='CR1', description='desc',
        impact_hours=Decimal('10'), impact_value=Decimal('1000'),
        status='pending', requested_by=operator_user, created_by=operator_user,
    )


# ─── S7C1.1 + S7C1.2: Milestone mass assignment ──────────────────────────

@pytest.mark.django_db
class TestMilestoneMassAssignment:
    """Operator nao deve marcar milestone como concluido via PATCH direto."""

    def test_patch_is_completed_is_ignored(self, operator_client, milestone):
        url = f'/api/v1/projects/milestones/{milestone.id}/'
        resp = operator_client.patch(url, {'is_completed': True}, format='json')
        # PATCH pode retornar 200, mas o campo NAO deve ter sido alterado.
        assert resp.status_code in (status.HTTP_200_OK, status.HTTP_403_FORBIDDEN)
        milestone.refresh_from_db()
        assert milestone.is_completed is False, (
            'is_completed deveria ser read_only — atacante bypassa action complete'
        )

    def test_patch_completed_at_is_ignored(self, operator_client, milestone):
        url = f'/api/v1/projects/milestones/{milestone.id}/'
        resp = operator_client.patch(
            url, {'completed_at': '2099-01-01T00:00:00Z'}, format='json',
        )
        assert resp.status_code in (status.HTTP_200_OK, status.HTTP_403_FORBIDDEN)
        milestone.refresh_from_db()
        assert milestone.completed_at is None

    def test_patch_invoice_fk_is_ignored(self, operator_client, operator_user, milestone, project, customer):
        """Linkar invoice via PATCH direto nao deve ser possivel.

        Mesmo se o ID for valido, deve ser ignorado/proibido — o link
        legitimo vem de action `complete` com validacao de customer.
        """
        from finance.models import Invoice
        # Cria invoice de OUTRO cliente para tentar exploitar
        other_customer = Customer.objects.create(
            name='Outro', email='outro@x.com',
            document='98765432000100', customer_type='PJ',
            created_by=operator_user,
        )
        invoice = Invoice.objects.create(
            customer=other_customer,
            issue_date=date.today(),
            due_date=date.today() + timedelta(days=30),
            total=Decimal('5000'),
            status='pending',
        )
        url = f'/api/v1/projects/milestones/{milestone.id}/'
        resp = operator_client.patch(url, {'invoice': invoice.id}, format='json')
        assert resp.status_code in (status.HTTP_200_OK, status.HTTP_403_FORBIDDEN)
        milestone.refresh_from_db()
        assert milestone.invoice_id is None, (
            'invoice deveria ser read_only — atacante linkaria invoice alheio'
        )


# ─── S7C1.3: ChangeRequest mass assignment ───────────────────────────────

@pytest.mark.django_db
class TestChangeRequestMassAssignment:
    """Operator nao deve auto-aprovar CR via PATCH (bypassa F2.5 self-block)."""

    def test_patch_status_to_approved_is_ignored(self, operator_client, change_request):
        url = f'/api/v1/projects/change-requests/{change_request.id}/'
        resp = operator_client.patch(url, {'status': 'approved'}, format='json')
        assert resp.status_code in (status.HTTP_200_OK, status.HTTP_403_FORBIDDEN)
        change_request.refresh_from_db()
        assert change_request.status == 'pending', (
            'status deveria ser read_only — atacante bypassa action approve '
            'que tem self-approval block (F2.5)'
        )

    def test_patch_approved_at_is_ignored(self, operator_client, change_request):
        url = f'/api/v1/projects/change-requests/{change_request.id}/'
        resp = operator_client.patch(
            url, {'approved_at': '2099-01-01T00:00:00Z'}, format='json',
        )
        assert resp.status_code in (status.HTTP_200_OK, status.HTTP_403_FORBIDDEN)
        change_request.refresh_from_db()
        assert change_request.approved_at is None

    def test_patch_impact_value_still_editable_for_legit_edits(
        self, operator_client, change_request
    ):
        """Sanity: campos legitimamente editaveis continuam funcionando."""
        url = f'/api/v1/projects/change-requests/{change_request.id}/'
        resp = operator_client.patch(
            url, {'impact_value': '2000.00'}, format='json',
        )
        # impact_value nao e read_only — PATCH deve funcionar
        assert resp.status_code == status.HTTP_200_OK
        change_request.refresh_from_db()
        assert change_request.impact_value == Decimal('2000.00')
