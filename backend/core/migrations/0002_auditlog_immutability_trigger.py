"""v32 F3 — imutabilidade reforçada do AuditLog (doc 08 §7.1, achado #8).

O que faz: cria função + trigger Postgres na tabela `audit_log` que bloqueia
UPDATE e DELETE em nível de banco (RAISE EXCEPTION). Antes a tabela era
append-only só por convenção (Model.delete() levanta RuntimeError, mas
QuerySet.update()/delete() e SQL direto passavam).

Aditiva: não altera schema de dados — apenas adiciona função + trigger.
Sem backfill. Sem lock relevante (CREATE TRIGGER em tabela pequena).

Reverse: DROP TRIGGER + DROP FUNCTION (estado anterior restaurado por
completo). Comando: `python manage.py migrate core 0001`.

Trade-off assumido (doc 08 §7.1): testes/rotinas que tentarem limpar audit
quebram (não devem) e a tabela só cresce; arquivamento por ano avaliado na F8.
"""
from django.db import migrations

CREATE_TRIGGER_SQL = """
CREATE OR REPLACE FUNCTION audit_log_block_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_log e append-only: % bloqueado pelo trigger de imutabilidade (v32 F3)', TG_OP
        USING ERRCODE = 'raise_exception';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;
CREATE TRIGGER audit_log_immutable
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();
"""

DROP_TRIGGER_SQL = """
DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;
DROP FUNCTION IF EXISTS audit_log_block_mutation();
"""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.RunSQL(sql=CREATE_TRIGGER_SQL, reverse_sql=DROP_TRIGGER_SQL),
    ]
