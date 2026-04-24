"""Testes do model AuditLog + log_audit() (F3a)."""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory

from core.audit import log_audit
from core.models import AuditLog

User = get_user_model()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='audit_admin', email='audit@admin.com',
        password='pass12345', role='admin',
    )


@pytest.mark.django_db
class TestAuditLog:
    def test_log_audit_persists_to_db(self, admin_user):
        entry = log_audit(
            admin_user, 'test_action', 'test_resource', 42,
            details='teste inicial',
        )
        assert entry is not None
        assert entry.id is not None
        assert entry.user == admin_user
        assert entry.username_snapshot == 'audit_admin'
        assert entry.user_role_snapshot == 'admin'
        assert entry.action == 'test_action'
        assert entry.resource_type == 'test_resource'
        assert entry.resource_id == '42'
        assert entry.details == 'teste inicial'

    def test_log_audit_with_diffs(self, admin_user):
        entry = log_audit(
            admin_user, 'update_rate', 'payment_provider_rate', 1,
            old_value={'installment_fee_pct': '3.99'},
            new_value={'installment_fee_pct': '4.99'},
        )
        assert entry.old_value == {'installment_fee_pct': '3.99'}
        assert entry.new_value == {'installment_fee_pct': '4.99'}

    def test_log_audit_with_request_extracts_ip(self, admin_user):
        factory = APIRequestFactory()
        req = factory.post('/api/v1/test/', HTTP_X_FORWARDED_FOR='203.0.113.10, 10.0.0.1')
        req.user = admin_user
        entry = log_audit(
            admin_user, 'test_ip', 'test', 1, request=req,
        )
        assert entry.ip_address == '203.0.113.10'  # primeiro IP do XFF

    def test_log_audit_anonymous_user(self, db):
        entry = log_audit(
            None, 'system_task', 'cron', 'daily_backup',
            details='executado pelo sistema',
        )
        assert entry.user is None
        assert entry.username_snapshot == ''

    def test_audit_log_cannot_be_deleted_via_orm(self, admin_user):
        entry = log_audit(admin_user, 'test', 'test', 1)
        with pytest.raises(RuntimeError, match='append-only'):
            entry.delete()

    def test_queryset_delete_still_works_but_not_recommended(self, admin_user):
        """QuerySet.delete() contorna o override — documentando limitacao.
        Em producao, o admin do Django eh configurado como read-only para
        evitar isso. Testes podem continuar limpando fixtures."""
        log_audit(admin_user, 'test', 'test', 1)
        # QuerySet.delete bypassa Model.delete() — nao bloqueia
        AuditLog.objects.filter(action='test').delete()
