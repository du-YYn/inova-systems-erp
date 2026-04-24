"""F1 security: integridade de Invoice.

- Backfill: para invoices geradas por finance.invoice_generator (que tinham
  payment_details.gross_charged_to_client), restaura value/total para o
  valor bruto (antes do F4 grava-lo como net por engano).
- UniqueConstraint em (invoice_type, number) para bloquear duplicados.
- Sequence PostgreSQL atomica para geracao de numeros sem race.
"""
from decimal import Decimal, InvalidOperation
from django.db import migrations, models


def backfill_invoice_totals(apps, schema_editor):
    """Restaura Invoice.value/total para valor bruto quando payment_details tem gross_charged_to_client.

    Invoices geradas antes da correcao F1.1 gravavam:
      value = gross (correto)
      total = net (ERRADO — deveria ser gross)

    Agora sincronizamos: total = max(value, total) se houver payment_details indicando
    que a invoice foi gerada pelo invoice_generator.
    """
    Invoice = apps.get_model('finance', 'Invoice')
    fixed = 0
    for inv in Invoice.objects.exclude(payment_details={}).iterator():
        details = inv.payment_details or {}
        gross_str = details.get('gross_charged_to_client')
        if not gross_str:
            continue
        try:
            gross = Decimal(str(gross_str))
        except (InvalidOperation, TypeError):
            continue
        # Se total esta menor que gross e payment_details aponta gross_charged,
        # estava errado — corrige
        if inv.total < gross:
            inv.value = gross
            inv.total = gross
            # Mantem paid_amount como estava (pode ter sido pago com valor liquido;
            # esse caso sera tratado manualmente pela equipe fiscal se necessario)
            inv.save(update_fields=['value', 'total'])
            fixed += 1
    if fixed:
        print(f'  [F1] Backfill: {fixed} invoice(s) corrigidas (total=gross)')


def noop_reverse(apps, schema_editor):
    """Reverso do backfill e no-op: nao ha como recuperar o valor 'errado'
    original, e nem faz sentido (o valor errado era o bug)."""
    pass


def create_invoice_number_sequence(apps, schema_editor):
    """Cria PostgreSQL sequence dedicada para numeracao atomica de invoices.

    A sequence evita race condition em _next_invoice_number() quando multiplas
    transacoes concorrentes geram invoices simultaneamente.

    Uma sequence por tipo (receivable/payable) para manter REC-NNNNN e PAG-NNNNN
    independentes.
    """
    Invoice = apps.get_model('finance', 'Invoice')
    with schema_editor.connection.cursor() as cursor:
        for invoice_type, prefix in (('receivable', 'REC'), ('payable', 'PAG')):
            seq_name = f'invoice_seq_{invoice_type}'
            # Descobre o maior numero existente para iniciar a sequence dali
            last = (
                Invoice.objects
                .filter(invoice_type=invoice_type)
                .order_by('-id')
                .first()
            )
            last_seq = 0
            if last and last.number:
                try:
                    last_seq = int(last.number.split('-')[1])
                except (IndexError, ValueError):
                    last_seq = 0
            start = last_seq + 1
            cursor.execute(
                f'CREATE SEQUENCE IF NOT EXISTS {seq_name} '
                f'START WITH {start} INCREMENT BY 1 MINVALUE 1'
            )
            # Se ja existia, garante que esta pelo menos no ponto correto
            cursor.execute(f"SELECT setval('{seq_name}', GREATEST({start}, nextval('{seq_name}')))")
    print('  [F1] Sequences invoice_seq_receivable/payable criadas')


def drop_invoice_number_sequence(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute('DROP SEQUENCE IF EXISTS invoice_seq_receivable')
        cursor.execute('DROP SEQUENCE IF EXISTS invoice_seq_payable')


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0011_payment_providers'),
    ]

    operations = [
        # 1. Backfill antes da constraint (pode haver duplicados a corrigir manualmente
        # se race ja ocorreu — RunPython vai falhar no UniqueConstraint se houver).
        migrations.RunPython(backfill_invoice_totals, noop_reverse),

        # 2. Adiciona UniqueConstraint em (invoice_type, number)
        migrations.AddConstraint(
            model_name='invoice',
            constraint=models.UniqueConstraint(
                fields=['invoice_type', 'number'],
                name='unique_invoice_type_number',
            ),
        ),

        # 3. Cria sequences PostgreSQL para numeracao atomica
        migrations.RunPython(create_invoice_number_sequence, drop_invoice_number_sequence),
    ]
