import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from support.models import SLAPolicy, SupportCategory, SupportTicket

User = get_user_model()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin_test', password='testpass123!', role='admin', email='admin@test.com'
    )


@pytest.fixture
def operator_user(db):
    return User.objects.create_user(
        username='operator_test', password='testpass123!', role='operator', email='op@test.com'
    )


@pytest.fixture
def admin_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def sla_policy(db):
    return SLAPolicy.objects.create(
        name='Standard SLA',
        response_time_low=24,
        response_time_medium=8,
        response_time_high=4,
        response_time_critical=1,
        resolution_time_low=72,
        resolution_time_medium=24,
        resolution_time_high=8,
        resolution_time_critical=4,
    )


@pytest.fixture
def support_category(db):
    return SupportCategory.objects.create(name='Bug Report', description='Report bugs')


@pytest.fixture
def support_ticket(db, admin_user, support_category):
    return SupportTicket.objects.create(
        number='TKT-00001',
        title='Test Ticket',
        description='Test description',
        ticket_type='bug',
        priority='medium',
        status='open',
        category=support_category,
        created_by=admin_user,
    )


class TestSLAPolicy:
    def test_create_sla_policy(self, admin_client):
        data = {
            'name': 'Premium SLA',
            'response_time_low': 12,
            'response_time_medium': 4,
            'response_time_high': 2,
            'response_time_critical': 0.5,
            'resolution_time_low': 48,
            'resolution_time_medium': 12,
            'resolution_time_high': 4,
            'resolution_time_critical': 2,
        }
        response = admin_client.post('/api/v1/support/sla-policies/', data, format='json')
        assert response.status_code == 201
        assert response.data['name'] == 'Premium SLA'

    def test_list_sla_policies(self, admin_client, sla_policy):
        response = admin_client.get('/api/v1/support/sla-policies/')
        assert response.status_code == 200


class TestSupportCategory:
    def test_create_category(self, admin_client):
        data = {'name': 'Feature Request', 'description': 'New features'}
        response = admin_client.post('/api/v1/support/categories/', data, format='json')
        assert response.status_code == 201

    def test_list_categories(self, admin_client, support_category):
        response = admin_client.get('/api/v1/support/categories/')
        assert response.status_code == 200


class TestSupportTicket:
    def test_create_ticket(self, admin_client, support_category):
        data = {
            'title': 'New Bug',
            'description': 'Something is broken',
            'ticket_type': 'bug',
            'priority': 'high',
            'category': support_category.id,
        }
        response = admin_client.post('/api/v1/support/tickets/', data, format='json')
        assert response.status_code == 201

    def test_list_tickets(self, admin_client, support_ticket):
        response = admin_client.get('/api/v1/support/tickets/')
        assert response.status_code == 200

    def test_retrieve_ticket(self, admin_client, support_ticket):
        response = admin_client.get(f'/api/v1/support/tickets/{support_ticket.id}/')
        assert response.status_code == 200
        assert response.data['title'] == 'Test Ticket'

    def test_update_ticket_status(self, admin_client, support_ticket):
        response = admin_client.patch(
            f'/api/v1/support/tickets/{support_ticket.id}/',
            {'status': 'in_progress'},
            format='json',
        )
        assert response.status_code == 200

    def test_ticket_str(self, support_ticket):
        assert str(support_ticket) == '#TKT-00001 - Test Ticket'

    def test_sla_policy_str(self, sla_policy):
        assert str(sla_policy) == 'Standard SLA'
