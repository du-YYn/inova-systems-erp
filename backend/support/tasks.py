"""Tasks Celery do Suporte (v32 F6, doc processo-v32/05-suporte.md §8)."""
import logging

from celery import shared_task

logger = logging.getLogger('support')

AUTOCLOSE_FLAG = 'AUTOMATION_SUP_AUTOCLOSE'
AUTOCLOSE_ACTION = 'support_ticket_autoclose'
AUTOCLOSE_DRY_RUN_ACTION = 'support_ticket_autoclose_dry_run'


@shared_task
def close_stale_resolved():
    """Auto-fechamento: chamado `resolvido` há mais de SUPPORT_AUTOCLOSE_DAYS
    dias (default 5, configurável por env) sem retorno do cliente → `fechado`.

    Atrás da flag AUTOMATION_SUP_AUTOCLOSE (off | dry_run | on, default
    dry_run — doc 08 §11.2 R2):
    - off: não faz nada (kill-switch).
    - dry_run: loga (logger + log_audit) quais fecharia, sem efeito.
    - on: fecha (status=fechado + closed_at) com log_audit old/new.

    Considera também o status legado `resolved` (convivência de release até
    a data migration 0003 rodar em produção). Agendada no Celery Beat diário
    às 07:30.
    """
    from datetime import timedelta

    from django.conf import settings
    from django.utils import timezone

    from core.audit import log_audit

    from .flags import get_automation_flag
    from .models import SupportTicket

    flag = get_automation_flag(AUTOCLOSE_FLAG)
    if flag == 'off':
        return 0

    days = int(getattr(settings, 'SUPPORT_AUTOCLOSE_DAYS', 5))
    cutoff = timezone.now() - timedelta(days=days)
    now = timezone.now()

    stale = list(
        SupportTicket.objects.filter(
            status__in=['resolvido', 'resolved'],
            resolved_at__lt=cutoff,
        )
    )
    if not stale:
        return 0

    audit_entries = []
    for ticket in stale:
        audit_entries.append({
            'ticket': ticket.id,
            'number': ticket.number,
            'old_status': ticket.status,
            'resolved_at': ticket.resolved_at.isoformat() if ticket.resolved_at else None,
        })
        if flag == 'dry_run':
            logger.info(
                'DRY_RUN %s: fecharia ticket %s (resolvido em %s, > %s dias). '
                'Sem efeito.', AUTOCLOSE_FLAG, ticket.number, ticket.resolved_at, days,
            )
        else:
            ticket.status = 'fechado'
            ticket.closed_at = now
            ticket.save(update_fields=['status', 'closed_at', 'updated_at'])
            logger.info(
                'Auto-close F6: ticket %s fechado (resolvido ha mais de %s dias).',
                ticket.number, days,
            )

    action = AUTOCLOSE_DRY_RUN_ACTION if flag == 'dry_run' else AUTOCLOSE_ACTION
    log_audit(
        None, action, 'support_ticket',
        details=(
            f'Auto-fechamento ({flag}): {len(stale)} chamados '
            f'{"simulados" if flag == "dry_run" else "fechados"} '
            f'(resolvidos ha mais de {days} dias).'
        ),
        old_value={'tickets': audit_entries},
        new_value={
            'status': 'fechado' if flag == 'on' else None,
            'count': len(stale),
            'days': days,
            'dry_run': flag == 'dry_run',
        },
    )
    return len(stale)
