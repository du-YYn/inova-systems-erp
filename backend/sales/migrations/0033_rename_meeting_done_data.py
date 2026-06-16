"""v32 F2 (Comercial) — data migration: meeting_done -> meeting_1_done.

O que faz:
- UPDATE prospects SET status='meeting_1_done' WHERE status='meeting_done'.
  Tabela prospects é pequena (centenas de linhas em produção) — UPDATE único
  dentro da migration, conforme doc 08 §4.3.
- O valor 'meeting_done' PERMANECE no enum (choices) como legado, para que
  código antigo em voo durante o deploy não quebre (regra de convivência de
  1 release, doc 08 §11.3).

Reverse: UPDATE invertido (meeting_1_done -> meeting_done). Atenção: o reverse
também reverte leads que tenham sido movidos para meeting_1_done APÓS esta
migration — aceitável porque o código pós-F2 trata os dois valores como
equivalentes (transição para tech_analysis aceita ambos).

Não exige backfill em lotes (volume baixo).
"""

from django.db import migrations


def forward(apps, schema_editor):
    """meeting_done -> meeting_1_done (rename de valor do enum)."""
    Prospect = apps.get_model('sales', 'Prospect')
    Prospect.objects.filter(status='meeting_done').update(status='meeting_1_done')


def backward(apps, schema_editor):
    """Reverse: meeting_1_done -> meeting_done."""
    Prospect = apps.get_model('sales', 'Prospect')
    Prospect.objects.filter(status='meeting_1_done').update(status='meeting_done')


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0032_prospect_estimated_deadline_days_and_more'),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
