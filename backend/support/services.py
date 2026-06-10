"""Regras de negócio do Suporte v32 F6 (doc processo-v32/05-suporte.md).

- Escalação para a Diretoria (conclusao=inconclusivo, doc 05 §7) atrás da
  flag AUTOMATION_SUP_ESCALA.
- Promoção de PedidoUpdate → Prospect em tech_analysis (doc 05 §6) atrás da
  flag AUTOMATION_SUP_PEDIDO_UPDATE.

Em dry_run as automações logam (logger + log_audit) sem efeito.
"""
import logging

from django.utils import timezone

from core.audit import log_audit

from .flags import get_automation_flag

logger = logging.getLogger('support')

ESCALA_FLAG = 'AUTOMATION_SUP_ESCALA'
PEDIDO_UPDATE_FLAG = 'AUTOMATION_SUP_PEDIDO_UPDATE'


def escalate_inconclusive(ticket, user, request=None):
    """Conclusão inconclusiva → escala para a Diretoria (doc 05 §7).

    Cria diretoria.DirectorEscalation + Notification para os admins, atrás
    da flag AUTOMATION_SUP_ESCALA (off | dry_run | on, default dry_run).
    Idempotente: não duplica escalação ABERTA (resolved=False) por ticket.

    Retorna a escalação criada ou None (off/dry_run/idempotência).
    """
    flag = get_automation_flag(ESCALA_FLAG)
    if flag == 'off':
        return None

    from diretoria.models import DirectorEscalation

    already_open = DirectorEscalation.objects.filter(
        originating_ticket=ticket, resolved=False,
    ).exists()
    if already_open:
        logger.info(
            'Gatilho sup_escala: ticket %s ja tem escalacao aberta — '
            'ignorando (idempotente).', ticket.id,
        )
        return None

    summary = (
        f'Chamado {ticket.number} ({ticket.title}) analisado como '
        f'inconclusivo pelo Suporte.'
    )

    if flag == 'dry_run':
        logger.info(
            'DRY_RUN %s: criaria DirectorEscalation para ticket %s e '
            'notificaria admins. Sem efeito.', ESCALA_FLAG, ticket.id,
        )
        log_audit(
            user, 'director_escalation_auto_create_dry_run',
            'director_escalation',
            details=(
                f'DRY_RUN {ESCALA_FLAG}: criaria DirectorEscalation para o '
                f'ticket {ticket.number} (conclusao=inconclusivo).'
            ),
            new_value={
                'originating_ticket': ticket.id,
                'summary': summary,
                'dry_run': True,
            },
            request=request,
        )
        return None

    escalation = DirectorEscalation.objects.create(
        originating_ticket=ticket,
        raised_by=user if user is not None and user.is_authenticated else None,
        summary=summary,
        evidence=ticket.description,
    )
    _notify_admins_escalation(escalation, ticket)
    log_audit(
        user, 'director_escalation_auto_create', 'director_escalation',
        escalation.id,
        details=f'Gatilho {ESCALA_FLAG}: ticket {ticket.number} inconclusivo.',
        new_value={
            'originating_ticket': ticket.id,
            'summary': summary,
        },
        request=request,
    )
    logger.info(
        'Gatilho sup_escala: DirectorEscalation %s criada para ticket %s.',
        escalation.id, ticket.id,
    )
    return escalation


def _notify_admins_escalation(escalation, ticket):
    """Notifica os diretores (User.role='admin', doc 06 §1)."""
    from django.contrib.auth import get_user_model

    from notifications.utils import notify_users

    User = get_user_model()
    admin_ids = list(
        User.objects.filter(role='admin', is_active=True).values_list('id', flat=True)
    )
    if not admin_ids:
        return
    notify_users(
        admin_ids,
        notification_type='general',
        title=f'Escalação da Diretoria — chamado {ticket.number}',
        message=(
            f'O chamado {ticket.number} ({ticket.title}) foi analisado como '
            'inconclusivo e aguarda decisão da Diretoria.'
        ),
        object_type='director_escalation',
        object_id=escalation.id,
    )


def promote_pedido_update(pedido, user, request=None):
    """Promove PedidoUpdate → Prospect em tech_analysis (doc 05 §6).

    Cliente existente pula Lead/qualificação/Reunião 1: o Prospect novo nasce
    direto em `tech_analysis` com o customer preenchido (edge sup_upd → pn3
    do v34). Atrás da flag AUTOMATION_SUP_PEDIDO_UPDATE (default dry_run).

    Retorna (flag, prospect_ou_None). Em off/dry_run o pedido NÃO muda.
    """
    flag = get_automation_flag(PEDIDO_UPDATE_FLAG)
    if flag == 'off':
        logger.info(
            'FLAG %s=off: promocao do PedidoUpdate %s ignorada.',
            PEDIDO_UPDATE_FLAG, pedido.id,
        )
        return flag, None

    customer = pedido.customer

    if flag == 'dry_run':
        logger.info(
            'DRY_RUN %s: criaria Prospect(tech_analysis) para customer %s '
            '(pedido %s). Sem efeito.', PEDIDO_UPDATE_FLAG, customer.id, pedido.id,
        )
        log_audit(
            user, 'pedido_update_promote_dry_run', 'pedido_update', pedido.id,
            details=(
                f'DRY_RUN {PEDIDO_UPDATE_FLAG}: criaria Prospect em '
                f'tech_analysis para customer {customer.id}.'
            ),
            new_value={
                'customer': customer.id,
                'prospect_status': 'tech_analysis',
                'dry_run': True,
            },
            request=request,
        )
        return flag, None

    from sales.models import Prospect

    contact_name = customer.name or customer.company_name
    contacts = customer.contacts or []
    if not contact_name and contacts and isinstance(contacts[0], dict):
        contact_name = contacts[0].get('name', '')

    prospect = Prospect.objects.create(
        customer=customer,
        company_name=customer.company_name or customer.name,
        contact_name=contact_name or 'Cliente existente',
        contact_email=customer.email or '',
        contact_phone=customer.phone or '',
        source='other',
        status='tech_analysis',
        description=(
            f'Pedido de update do Suporte (chamado '
            f'{pedido.originating_ticket.number}): {pedido.description}'
        ),
        created_by=user,
    )

    old_value = {'status': pedido.status, 'prospect': pedido.prospect_id}
    pedido.status = 'promoted'
    pedido.promoted_at = timezone.now()
    pedido.prospect = prospect
    pedido.save(update_fields=['status', 'promoted_at', 'prospect'])

    log_audit(
        user, 'pedido_update_promote', 'pedido_update', pedido.id,
        details=(
            f'PedidoUpdate {pedido.id} promovido: Prospect {prospect.id} '
            f'criado em tech_analysis (customer {customer.id}).'
        ),
        old_value=old_value,
        new_value={
            'status': 'promoted',
            'prospect': prospect.id,
            'prospect_status': 'tech_analysis',
        },
        request=request,
    )
    logger.info(
        'PedidoUpdate %s promovido — Prospect %s (tech_analysis) criado.',
        pedido.id, prospect.id,
    )
    return flag, prospect
