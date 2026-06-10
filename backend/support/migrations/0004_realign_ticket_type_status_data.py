"""v32 F6 (doc 05 §1/§2): data migration — realinha registros do Suporte.

O que faz (mapeamentos validados no doc 05):

    ticket_type:  question → duvida · feature → mudanca ·
                  performance/integration/other → bug
    status:       open → aberto · in_progress → analise ·
                  pending_client → resolvido · resolved → resolvido ·
                  closed → fechado

Reverse (documentado e implementado): inverte pelos mapas REVERSE_*.
Perdas conhecidas e aceitas no reverse (mapeamentos N→1):
- pending_client e resolved colapsam em `resolvido` → reverse devolve
  `resolved` para ambos;
- performance/integration/other colapsam em `bug` → reverse mantém `bug`
  (bug já existia como valor; não há como distinguir a origem).
Antes de rodar em produção: relatório de contagem por status/tipo
(doc 08 §4.3) para John conferir o volume.

Exige backfill: não — tabela support_tickets é pequena; UPDATEs em lote
único dentro da migration (padrão da 0033 do sales).
"""
from django.db import migrations

# Mapas exportados para os testes (test_f6_suporte.py importa daqui — a
# especificação executável é a migration, não uma cópia).
TYPE_FORWARD = {
    'question': 'duvida',
    'feature': 'mudanca',
    'performance': 'bug',
    'integration': 'bug',
    'other': 'bug',
}
TYPE_REVERSE = {
    'duvida': 'question',
    'mudanca': 'feature',
    # bug colapsado: não reversível (bug já era valor legítimo)
}

STATUS_FORWARD = {
    'open': 'aberto',
    'in_progress': 'analise',
    'pending_client': 'resolvido',
    'resolved': 'resolvido',
    'closed': 'fechado',
}
STATUS_REVERSE = {
    'aberto': 'open',
    'analise': 'in_progress',
    'resolvido': 'resolved',  # pending_client+resolved colapsados
    'fechado': 'closed',
}


def _apply_mapping(model, field, mapping):
    for old_value, new_value in mapping.items():
        model.objects.filter(**{field: old_value}).update(**{field: new_value})


def realign_forward(apps, schema_editor):
    SupportTicket = apps.get_model('support', 'SupportTicket')
    _apply_mapping(SupportTicket, 'ticket_type', TYPE_FORWARD)
    _apply_mapping(SupportTicket, 'status', STATUS_FORWARD)


def realign_reverse(apps, schema_editor):
    SupportTicket = apps.get_model('support', 'SupportTicket')
    _apply_mapping(SupportTicket, 'ticket_type', TYPE_REVERSE)
    _apply_mapping(SupportTicket, 'status', STATUS_REVERSE)


class Migration(migrations.Migration):

    dependencies = [
        ('support', '0003_supportticket_conclusao_supportticket_contexto_and_more'),
    ]

    operations = [
        migrations.RunPython(realign_forward, realign_reverse),
    ]
