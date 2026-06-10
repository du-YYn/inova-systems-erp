"""v32 F3 — trigger Postgres de imutabilidade do AuditLog (doc 08 §7.1).

A migration core.0002 cria trigger BEFORE UPDATE OR DELETE em `audit_log`
que levanta exceção no banco. Antes, a tabela era append-only só por
convenção (QuerySet.update()/delete() e SQL direto passavam).
"""
import pytest
from django.db import DatabaseError, connection, transaction

from core.audit import log_audit
from core.models import AuditLog


@pytest.fixture
def audit_entry(db):
    return log_audit(None, 'immutability_test', 'test_resource', 1)


@pytest.mark.django_db
class TestAuditLogImmutabilityTrigger:
    def test_orm_update_raises_db_error(self, audit_entry):
        with pytest.raises(DatabaseError, match='append-only'):
            with transaction.atomic():
                AuditLog.objects.filter(pk=audit_entry.pk).update(details='adulterado')
        audit_entry.refresh_from_db()
        assert audit_entry.details == ''  # intacto

    def test_orm_queryset_delete_raises_db_error(self, audit_entry):
        """QuerySet.delete() não passa por Model.delete() — o trigger cobre."""
        with pytest.raises(DatabaseError, match='append-only'):
            with transaction.atomic():
                AuditLog.objects.filter(pk=audit_entry.pk).delete()
        assert AuditLog.objects.filter(pk=audit_entry.pk).exists()

    def test_raw_sql_update_raises_db_error(self, audit_entry):
        with pytest.raises(DatabaseError, match='append-only'):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        'UPDATE audit_log SET details = %s WHERE id = %s',
                        ['adulterado via SQL', audit_entry.pk],
                    )

    def test_raw_sql_delete_raises_db_error(self, audit_entry):
        with pytest.raises(DatabaseError, match='append-only'):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        'DELETE FROM audit_log WHERE id = %s', [audit_entry.pk],
                    )
        assert AuditLog.objects.filter(pk=audit_entry.pk).exists()

    def test_model_delete_still_raises_runtime_error(self, audit_entry):
        """Convenção em código permanece: Model.delete() levanta RuntimeError
        antes mesmo de chegar ao banco."""
        with pytest.raises(RuntimeError, match='append-only'):
            audit_entry.delete()

    def test_insert_still_works(self, db):
        entry = log_audit(None, 'insert_after_trigger', 'test_resource', 2)
        assert entry is not None
        assert entry.pk is not None
