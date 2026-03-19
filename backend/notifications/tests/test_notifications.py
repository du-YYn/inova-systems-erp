import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from notifications.models import Notification
from notifications.utils import create_notification

User = get_user_model()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin_notif', password='testpass123!', role='admin', email='admin@notif.com'
    )


@pytest.fixture
def admin_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def notification(db, admin_user):
    return Notification.objects.create(
        user=admin_user,
        notification_type='task_due',
        title='Task Due Tomorrow',
        message='Your task is due tomorrow',
    )


class TestNotificationModel:
    def test_create_notification(self, admin_user):
        notif = Notification.objects.create(
            user=admin_user,
            notification_type='invoice_overdue',
            title='Invoice Overdue',
            message='Invoice #001 is overdue',
        )
        assert notif.is_read is False
        assert str(notif.notification_type) == 'invoice_overdue'

    def test_notification_defaults(self, notification):
        assert notification.is_read is False


class TestNotificationAPI:
    def test_list_notifications(self, admin_client, notification):
        response = admin_client.get('/api/v1/notifications/')
        assert response.status_code == 200

    def test_mark_read(self, admin_client, notification):
        response = admin_client.patch(
            f'/api/v1/notifications/{notification.id}/mark_read/'
        )
        assert response.status_code == 200
        notification.refresh_from_db()
        assert notification.is_read is True

    def test_mark_all_read(self, admin_client, notification):
        response = admin_client.post('/api/v1/notifications/mark_all_read/')
        assert response.status_code == 200
        notification.refresh_from_db()
        assert notification.is_read is True

    def test_unread_count(self, admin_client, notification):
        response = admin_client.get('/api/v1/notifications/unread_count/')
        assert response.status_code == 200
        assert response.data['unread_count'] == 1


class TestNotificationUtils:
    def test_create_notification_util(self, admin_user):
        create_notification(
            user_id=admin_user.id,
            notification_type='task_due',
            title='Test Title',
            message='Test message',
        )
        assert Notification.objects.filter(user=admin_user, title='Test Title').exists()
