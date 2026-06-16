"""v32 F6 (doc 05 §9): Customer.public_token — token do canal público de chamados.

O que faz: adiciona a coluna UUID nullable, popula uuid4 DISTINTO por linha
(data migration) e então aplica UNIQUE + NOT NULL. Três passos porque default
callable em campo unique geraria o MESMO valor para todas as linhas existentes
(receita oficial: docs.djangoproject.com/en/4.2/howto/writing-migrations/
#migrations-that-add-unique-fields).

Reverse: automático — o reverse do AddField remove a coluna (o backfill tem
reverse no-op). Exige backfill: sim, embutido (tabela customers é pequena;
UPDATE por linha sem lock relevante).
"""
import uuid

from django.db import migrations, models


def backfill_public_token(apps, schema_editor):
    """Gera um uuid4 distinto por customer existente."""
    Customer = apps.get_model('sales', 'Customer')
    for pk in Customer.objects.filter(public_token__isnull=True).values_list('pk', flat=True):
        Customer.objects.filter(pk=pk).update(public_token=uuid.uuid4())


def reverse_backfill(apps, schema_editor):
    """No-op: o reverse do AddField remove a coluna inteira."""


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0033_rename_meeting_done_data'),
    ]

    operations = [
        migrations.AddField(
            model_name='customer',
            name='public_token',
            field=models.UUIDField(
                editable=False, null=True,
                help_text='Token do canal público de abertura de chamados',
            ),
        ),
        migrations.RunPython(backfill_public_token, reverse_backfill),
        migrations.AlterField(
            model_name='customer',
            name='public_token',
            field=models.UUIDField(
                default=uuid.uuid4, editable=False, unique=True,
                help_text='Token do canal público de abertura de chamados',
            ),
        ),
    ]
