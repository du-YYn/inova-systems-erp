"""v32 F5 (Produção) — data migration: status legado → etapa_atual/situacao.

O que faz (doc 04 §1, tabela de mapeamento):
- planning, kickoff      → etapa_3_preparacao
- requirements           → etapa_4_onboarding
- development            → etapa_7_desenvolvimento
- testing                → etapa_8_auditoria
- deployment             → registro_entrega
- completed              → etapa_10_graduacao
- on_hold                → situacao=em_espera (etapa_atual fica no default —
                           estado ortogonal: não sabemos em que etapa parou)
- cancelled              → situacao=cancelado (idem)

O campo `status` PERMANECE intocado (vira legado; remoção só na F8 —
expand-contract, doc 08 §2). Tabela projects é pequena (dezenas de linhas em
produção): UPDATEs únicos dentro da migration, sem backfill em lotes
(doc 08 §4.2/§4.3).

Reverse: NOOP documentado. Os campos novos têm default
(etapa_atual=etapa_3_preparacao, situacao=ativo) e o `status` legado nunca é
alterado — voltar a migration não precisa restaurar nada: o código antigo lê
apenas `status`, que está íntegro. Re-aplicar a migration é idempotente
(filtra pelo status legado, que não muda).
"""
from django.db import migrations

# status legado → etapa_atual (doc 04 §1)
STATUS_TO_ETAPA = {
    'planning': 'etapa_3_preparacao',
    'kickoff': 'etapa_3_preparacao',
    'requirements': 'etapa_4_onboarding',
    'development': 'etapa_7_desenvolvimento',
    'testing': 'etapa_8_auditoria',
    'deployment': 'registro_entrega',
    'completed': 'etapa_10_graduacao',
}

# status legado → situacao (estados ortogonais)
STATUS_TO_SITUACAO = {
    'on_hold': 'em_espera',
    'cancelled': 'cancelado',
}


def forward(apps, schema_editor):
    """Popula etapa_atual/situacao a partir do status legado."""
    Project = apps.get_model('projects', 'Project')
    for legacy_status, etapa in STATUS_TO_ETAPA.items():
        Project.objects.filter(status=legacy_status).update(etapa_atual=etapa)
    for legacy_status, situacao in STATUS_TO_SITUACAO.items():
        Project.objects.filter(status=legacy_status).update(situacao=situacao)


def backward(apps, schema_editor):
    """NOOP intencional: `status` legado nunca foi alterado pelo forward.

    O código pré-F5 só lê `status` (íntegro); os campos novos somem com o
    reverse da 0004. Não há estado a restaurar.
    """


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0004_project_considerar_carnaval_and_more'),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
