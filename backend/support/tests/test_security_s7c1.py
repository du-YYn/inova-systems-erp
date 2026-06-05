"""Testes de regressao Sprint S7-C1 (CRITICAL batch 1) - support.

Cobre vulnerabilidade de mass assignment em SupportTicket que burlava
o ciclo de vida (open -> in_progress -> resolved -> closed) e os
deadlines de SLA monitorados por Celery beat.

- S7C1.4: SupportTicket.status via PATCH (bypassa actions resolve/close)
- S7C1.5: SupportTicket.resolved_at / closed_at via PATCH
- S7C1.6: SupportTicket.sla_*_deadline / first_response_at via PATCH
"""
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from support.models import SupportTicket
from sales.models import Customer

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def operator_user(db):
    return User.objects.create_user(
        username='s7c1_sup_op', email='s7c1@supop.com',
        password='pass12345', role='operator',
    )


@pytest.fixture
def operator_client(api_client, operator_user):
    api_client.force_authenticate(user=operator_user)
    return api_client


@pytest.fixture
def customer(db, operator_user):
    return Customer.objects.create(
        name='Cliente Sup S7C1', email='cli@sup-s7c1.com',
        document='12345678000111', customer_type='PJ',
        created_by=operator_user,
    )


@pytest.fixture
def ticket(db, customer, operator_user):
    deadline = timezone.now() + timedelta(hours=24)
    return SupportTicket.objects.create(
        number='TKT-S7C1-1',
        title='Ticket S7C1', description='desc',
        customer=customer,
        ticket_type='bug', priority='high', status='open',
        sla_response_deadline=deadline,
        sla_resolution_deadline=deadline,
        created_by=operator_user,
    )


# ─── S7C1.4 + S7C1.5 + S7C1.6: SupportTicket mass assignment ─────────────

@pytest.mark.django_db
class TestSupportTicketMassAssignment:
    """Operator nao deve transicionar status / falsificar SLA via PATCH."""

    def test_patch_status_to_closed_is_ignored(self, operator_client, ticket):
        url = f'/api/v1/support/tickets/{ticket.id}/'
        resp = operator_client.patch(url, {'status': 'closed'}, format='json')
        assert resp.status_code in (status.HTTP_200_OK, status.HTTP_403_FORBIDDEN)
        ticket.refresh_from_db()
        assert ticket.status == 'open', (
            'status deveria ser read_only — atacante bypassa action close/resolve'
        )

    def test_patch_resolved_at_is_ignored(self, operator_client, ticket):
        url = f'/api/v1/support/tickets/{ticket.id}/'
        resp = operator_client.patch(
            url, {'resolved_at': '2099-01-01T00:00:00Z'}, format='json',
        )
        assert resp.status_code in (status.HTTP_200_OK, status.HTTP_403_FORBIDDEN)
        ticket.refresh_from_db()
        assert ticket.resolved_at is None

    def test_patch_closed_at_is_ignored(self, operator_client, ticket):
        url = f'/api/v1/support/tickets/{ticket.id}/'
        resp = operator_client.patch(
            url, {'closed_at': '2099-01-01T00:00:00Z'}, format='json',
        )
        assert resp.status_code in (status.HTTP_200_OK, status.HTTP_403_FORBIDDEN)
        ticket.refresh_from_db()
        assert ticket.closed_at is None

    def test_patch_first_response_at_is_ignored(self, operator_client, ticket):
        url = f'/api/v1/support/tickets/{ticket.id}/'
        resp = operator_client.patch(
            url, {'first_response_at': '2099-01-01T00:00:00Z'}, format='json',
        )
        assert resp.status_code in (status.HTTP_200_OK, status.HTTP_403_FORBIDDEN)
        ticket.refresh_from_db()
        assert ticket.first_response_at is None

    def test_patch_sla_resolution_deadline_is_ignored(self, operator_client, ticket):
        """Adulterar SLA deadline para futuro distante zera breach do dashboard."""
        original_deadline = ticket.sla_resolution_deadline
        url = f'/api/v1/support/tickets/{ticket.id}/'
        resp = operator_client.patch(
            url, {'sla_resolution_deadline': '2099-01-01T00:00:00Z'}, format='json',
        )
        assert resp.status_code in (status.HTTP_200_OK, status.HTTP_403_FORBIDDEN)
        ticket.refresh_from_db()
        assert ticket.sla_resolution_deadline == original_deadline, (
            'sla_resolution_deadline deveria ser read_only — atacante zera breach'
        )

    def test_patch_sla_response_deadline_is_ignored(self, operator_client, ticket):
        original_deadline = ticket.sla_response_deadline
        url = f'/api/v1/support/tickets/{ticket.id}/'
        resp = operator_client.patch(
            url, {'sla_response_deadline': '2099-01-01T00:00:00Z'}, format='json',
        )
        assert resp.status_code in (status.HTTP_200_OK, status.HTTP_403_FORBIDDEN)
        ticket.refresh_from_db()
        assert ticket.sla_response_deadline == original_deadline

    def test_patch_title_still_editable_for_legit_edits(self, operator_client, ticket):
        """Sanity: campos editaveis continuam funcionando."""
        url = f'/api/v1/support/tickets/{ticket.id}/'
        resp = operator_client.patch(url, {'title': 'Titulo editado'}, format='json')
        assert resp.status_code == status.HTTP_200_OK
        ticket.refresh_from_db()
        assert ticket.title == 'Titulo editado'
