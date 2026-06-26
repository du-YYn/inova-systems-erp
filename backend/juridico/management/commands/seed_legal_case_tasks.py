"""Backfill: semeia o checklist da etapa atual dos LegalCases existentes.

Idempotente (seguro reexecutar). Rodar 1× no deploy para os cards já em produção
ganharem o checklist da sua etapa corrente.
"""
from django.core.management.base import BaseCommand

from juridico.checklists import seed_stage_tasks
from juridico.models import LegalCase


class Command(BaseCommand):
    help = 'Semeia o checklist da etapa atual dos LegalCases existentes (idempotente).'

    def handle(self, *args, **options):
        cases_touched = 0
        created_total = 0
        for case in LegalCase.objects.all().iterator():
            created = seed_stage_tasks(case, case.status)
            if created:
                cases_touched += 1
                created_total += len(created)
        self.stdout.write(self.style.SUCCESS(
            f'Semeadura concluída: {created_total} tarefas em {cases_touched} casos.'
        ))
