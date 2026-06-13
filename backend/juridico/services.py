"""Serviços de automação do Jurídico (v32, doc 09 itens 05/06/07).

Saídas do Aditivo para o Financeiro (doc 09 item 07):
01° Nova solicitação -> PRÉ-CADASTRA o valor adicional (Invoice receivable,
    pending, cobranca_liberada=False). Paralelo, como no Contrato.
02° Assinado -> ATIVA a cobrança (cobranca_liberada=True).
03° Recusado -> CANCELA o pré-cadastro (Invoice status='cancelled').

Tudo atrás da flag AUTOMATION_FIN_ADITIVO (off | dry_run | on, default
dry_run): em dry_run loga (logger + log_audit) o que faria, sem efeito.
Idempotente: a Invoice carrega o marcador `payment_details.aditivo_legal_case`
= id do caso, então não duplica nem reativa o que já está no estado-alvo.

A regra de negócio fica aqui (testável sem disparar signal); o gatilho da
criação (Nova solicitação) é o post_save de LegalCase em juridico/signals.py.
"""
import logging
from decimal import Decimal

from django.utils import timezone

from core.audit import log_audit

logger = logging.getLogger('juridico')

ADITIVO_FLAG = 'AUTOMATION_FIN_ADITIVO'

PRECADASTRO_ACTION = 'aditivo_precadastro_create'
PRECADASTRO_DRY_RUN_ACTION = 'aditivo_precadastro_dry_run'
ATIVA_ACTION = 'aditivo_cobranca_ativada'
ATIVA_DRY_RUN_ACTION = 'aditivo_cobranca_ativada_dry_run'
CANCELA_ACTION = 'aditivo_precadastro_cancelado'
CANCELA_DRY_RUN_ACTION = 'aditivo_precadastro_cancelado_dry_run'


def _get_flag():
    """Lê AUTOMATION_FIN_ADITIVO validada (off | dry_run | on)."""
    from finance.flags import get_automation_flag
    return get_automation_flag(ADITIVO_FLAG)


def _resolve_impact_value(case) -> Decimal:
    """Valor da mudança a pré-cadastrar.

    Deriva do ChangeRequest mais recente (pending/approved) do projeto do caso
    (projects.ChangeRequest.impact_value). Sem projeto/ChangeRequest -> 0.
    """
    if not case.project_id:
        return Decimal('0')
    try:
        from projects.models import ChangeRequest
    except Exception:  # noqa: BLE001 — app opcional/lazy
        return Decimal('0')
    cr = (
        ChangeRequest.objects.filter(project_id=case.project_id)
        .exclude(status='rejected')
        .order_by('-created_at')
        .first()
    )
    if cr is None:
        return Decimal('0')
    return Decimal(cr.impact_value or 0)


def _find_aditivo_invoice(case):
    """Invoice de pré-cadastro deste aditivo (idempotência via payment_details)."""
    from finance.models import Invoice
    return (
        Invoice.objects.filter(
            invoice_type='receivable',
            payment_details__aditivo_legal_case=case.id,
        )
        .exclude(status='cancelled')
        .first()
    )


def precadastrar_aditivo(case, *, user=None, dry_run=None):
    """Nova solicitação de Aditivo -> pré-cadastra a cobrança adicional (pendente).

    Cria 1 Invoice(receivable, pending, cobranca_liberada=False) com o
    impact_value da mudança. Idempotente: se já existe invoice deste caso, não
    recria. Sem valor (>0) ou sem customer -> nada a fazer.

    Returns: Invoice criada, ou None (nada a fazer / dry_run / flag off).
    """
    flag = _get_flag() if dry_run is None else ('dry_run' if dry_run else 'on')
    if flag == 'off':
        return None

    from finance.invoice_generator import _next_invoice_number
    from finance.models import Invoice

    if _find_aditivo_invoice(case) is not None:
        logger.info(
            'Aditivo F4: LegalCase %s ja tem invoice de pre-cadastro — '
            'ignorando (idempotente).', case.id,
        )
        return None

    customer = case.customer
    if customer is None:
        logger.warning(
            'Aditivo F4: LegalCase %s sem customer — pre-cadastro nao criado.',
            case.id,
        )
        return None

    value = _resolve_impact_value(case)
    if value <= 0:
        logger.warning(
            'Aditivo F4: LegalCase %s sem valor (impact_value > 0) — '
            'nada a pre-cadastrar.', case.id,
        )
        return None

    description = f'{getattr(customer, "company_name", customer)} — Aditivo (mudança de escopo)'

    if flag == 'dry_run':
        logger.info(
            'DRY_RUN %s: pre-cadastraria invoice de R$ %s (pendente) para '
            'customer %s (LegalCase %s). Sem efeito.',
            ADITIVO_FLAG, value, customer.id, case.id,
        )
        log_audit(
            user, PRECADASTRO_DRY_RUN_ACTION, 'invoice',
            details=(
                f'DRY_RUN {ADITIVO_FLAG}: pré-cadastraria invoice de R$ {value} '
                f'(aditivo, pendente) p/ customer {customer.id} (LegalCase {case.id}).'
            ),
            new_value={
                'customer': customer.id, 'legal_case': case.id,
                'value': str(value), 'dry_run': True,
            },
        )
        return None

    today = timezone.now().date()
    # L3 (code review): nasce já com a conta padrão (primeira ativa) quando
    # houver — mesma resiliência do pré-cadastro F4 (P0.3). Sem isso, se a
    # invoice do aditivo for paga, o mark_paid copiaria o bank_account NULL
    # para a Transaction (bank_account NOT NULL) -> 500. Sem conta ativa fica
    # None (o mark_paid ainda trata via _default_bank_account).
    from finance.models import BankAccount
    default_bank = BankAccount.objects.filter(is_active=True).first()
    invoice = Invoice.objects.create(
        invoice_type='receivable',
        document_type='invoice',
        customer=customer,
        project=case.project,
        bank_account=default_bank,
        number=_next_invoice_number('receivable'),
        issue_date=today,
        due_date=today,
        value=value,
        total=value,
        description=description,
        items=[{
            'description': description, 'quantity': 1,
            'unit_price': float(value), 'total': float(value),
        }],
        payment_details={'aditivo_legal_case': case.id, 'precadastro_role': 'aditivo'},
        status='pending',
        cobranca_liberada=False,
        notes=(
            f'Pré-cadastro automático de Aditivo (LegalCase {case.id}) — '
            'pendente até a assinatura.'
        ),
        created_by=user or customer.created_by,
    )
    logger.info(
        'Aditivo F4: invoice %s pre-cadastrada (R$ %s, pendente) p/ customer %s '
        '(LegalCase %s).', invoice.id, value, customer.id, case.id,
    )
    log_audit(
        user, PRECADASTRO_ACTION, 'invoice', invoice.id,
        details=(
            f'Aditivo (LegalCase {case.id}) — invoice {invoice.number} '
            f'pré-cadastrada (R$ {value}, pendente).'
        ),
        new_value={
            'customer': customer.id, 'legal_case': case.id,
            'invoice': invoice.id, 'value': str(value),
            'cobranca_liberada': False,
        },
    )
    return invoice


def _resolve_change_request_for_aditivo(case):
    """ChangeRequest vinculado a um LegalCase(aditivo).

    O vínculo nasce no produtor (projects.receivers._create_aditivo_legal_case),
    que grava `change_request` na metadata do LegalCaseEvent de criação. Fallback
    (caso aberto manualmente, sem evento): o ChangeRequest pending mais recente do
    projeto do caso. Sem projeto/CR -> None.
    """
    try:
        from projects.models import ChangeRequest
    except Exception:  # noqa: BLE001 — app opcional/lazy
        return None

    cr_id = (
        case.events.filter(metadata__change_request__isnull=False)
        .order_by('created_at')
        .values_list('metadata__change_request', flat=True)
        .first()
    )
    if cr_id:
        cr = ChangeRequest.objects.filter(id=cr_id).first()
        if cr is not None:
            return cr

    if not case.project_id:
        return None
    return (
        ChangeRequest.objects.filter(project_id=case.project_id, status='pending')
        .order_by('-created_at')
        .first()
    )


def approve_change_request_for_aditivo(case, *, user=None, dry_run=None):
    """P1.5: Aditivo assinado -> marca o ChangeRequest vinculado como `approved`.

    Fecha o loop "volta-pro-dev" (doc 09 item 07 / doc 10 §B): quando o cliente
    assina o aditivo, a Solicitação de Mudança vira "Mudança Aprovada" no board
    do Dev. Seta status='approved' + approved_at + approved_by (do SISTEMA — é a
    automação, não o criador, então NÃO é self-approval e NÃO passa pelo guard
    da action approve do ChangeRequestViewSet).

    Idempotente: CR já `approved` não é tocado de novo. Isolado: erros são
    tratados pelo caller (try/except). Atrás da flag AUTOMATION_FIN_ADITIVO
    (mesma do ciclo do aditivo); em dry_run só loga/audita.

    Returns: id do ChangeRequest aprovado, ou None (nada a fazer / dry_run /
    flag off / sem CR vinculável).
    """
    flag = _get_flag() if dry_run is None else ('dry_run' if dry_run else 'on')
    if flag == 'off':
        return None

    cr = _resolve_change_request_for_aditivo(case)
    if cr is None:
        logger.info(
            'Aditivo P1.5: LegalCase %s sem ChangeRequest vinculável — '
            'nada a aprovar.', case.id,
        )
        return None
    if cr.status == 'approved':
        logger.info(
            'Aditivo P1.5: ChangeRequest %s já aprovado — ignorando '
            '(idempotente).', cr.id,
        )
        return None

    if flag == 'dry_run':
        logger.info(
            'DRY_RUN %s: aprovaria ChangeRequest %s (LegalCase %s assinado). '
            'Sem efeito.', ADITIVO_FLAG, cr.id, case.id,
        )
        log_audit(
            user, 'change_request_auto_approve_dry_run', 'change_request', cr.id,
            details=(
                f'DRY_RUN {ADITIVO_FLAG}: aprovaria ChangeRequest {cr.id} '
                f'(Aditivo LegalCase {case.id} assinado).'
            ),
            new_value={'change_request': cr.id, 'legal_case': case.id,
                       'dry_run': True},
        )
        return None

    old_status = cr.status
    cr.status = 'approved'
    # approved_by/approved_at de SISTEMA (contorna o self-approval guard, que só
    # vale para a action manual). user pode ser None (automação pura).
    cr.approved_by = user if (user and getattr(user, 'is_authenticated', False)) else None
    cr.approved_at = timezone.now()
    cr.save(update_fields=['status', 'approved_by', 'approved_at', 'updated_at'])
    logger.info(
        'Aditivo P1.5: ChangeRequest %s aprovado (Mudança Aprovada) — '
        'LegalCase %s assinado.', cr.id, case.id,
    )
    log_audit(
        user, 'change_request_auto_approve', 'change_request', cr.id,
        details=(
            f'Aditivo assinado (LegalCase {case.id}) — ChangeRequest {cr.id} '
            f'aprovado automaticamente (Mudança Aprovada). Aprovação de sistema.'
        ),
        old_value={'status': old_status, 'approved_at': None},
        new_value={
            'status': 'approved', 'change_request': cr.id,
            'legal_case': case.id,
            'approved_at': str(cr.approved_at),
        },
    )
    return cr.id


def notify_finance_aditivo_outcome(case, new_status, *, user=None, dry_run=None):
    """Saída do Aditivo: Assinado ATIVA a cobrança; Recusado CANCELA o pré-cadastro.

    Idempotente: a invoice já no estado-alvo não é tocada de novo.

    Returns: id da Invoice afetada, ou None (nada a fazer / dry_run / flag off).
    """
    flag = _get_flag() if dry_run is None else ('dry_run' if dry_run else 'on')
    if flag == 'off':
        return None

    invoice = _find_aditivo_invoice(case)
    if invoice is None:
        logger.info(
            'Aditivo F4: LegalCase %s sem invoice de pre-cadastro ativa — '
            'nada a %s.', case.id, new_status,
        )
        return None

    if new_status == 'assinado':
        if invoice.cobranca_liberada:
            return None  # já ativada (idempotente)
        if flag == 'dry_run':
            logger.info(
                'DRY_RUN %s: ativaria cobranca da invoice %s (LegalCase %s '
                'assinado). Sem efeito.', ADITIVO_FLAG, invoice.id, case.id,
            )
            log_audit(
                user, ATIVA_DRY_RUN_ACTION, 'invoice', invoice.id,
                details=(
                    f'DRY_RUN {ADITIVO_FLAG}: ativaria cobrança da invoice '
                    f'{invoice.number} (LegalCase {case.id} assinado).'
                ),
                new_value={'invoice': invoice.id, 'legal_case': case.id,
                           'dry_run': True},
            )
            return None
        # .update() não dispara signals de Invoice — intencional (só o gate).
        from finance.models import Invoice
        Invoice.objects.filter(id=invoice.id).update(cobranca_liberada=True)
        logger.info(
            'Aditivo F4: cobranca ATIVADA na invoice %s (LegalCase %s assinado).',
            invoice.id, case.id,
        )
        log_audit(
            user, ATIVA_ACTION, 'invoice', invoice.id,
            details=(
                f'Aditivo assinado (LegalCase {case.id}) — cobrança ativada na '
                f'invoice {invoice.number}.'
            ),
            old_value={'cobranca_liberada': False},
            new_value={'cobranca_liberada': True, 'invoice': invoice.id,
                       'legal_case': case.id},
        )
        return invoice.id

    if new_status == 'recusado':
        if flag == 'dry_run':
            logger.info(
                'DRY_RUN %s: cancelaria o pre-cadastro da invoice %s (LegalCase '
                '%s recusado). Sem efeito.', ADITIVO_FLAG, invoice.id, case.id,
            )
            log_audit(
                user, CANCELA_DRY_RUN_ACTION, 'invoice', invoice.id,
                details=(
                    f'DRY_RUN {ADITIVO_FLAG}: cancelaria pré-cadastro da invoice '
                    f'{invoice.number} (LegalCase {case.id} recusado).'
                ),
                new_value={'invoice': invoice.id, 'legal_case': case.id,
                           'dry_run': True},
            )
            return None
        from finance.models import Invoice
        Invoice.objects.filter(id=invoice.id).update(status='cancelled')
        logger.info(
            'Aditivo F4: pre-cadastro CANCELADO na invoice %s (LegalCase %s '
            'recusado).', invoice.id, case.id,
        )
        log_audit(
            user, CANCELA_ACTION, 'invoice', invoice.id,
            details=(
                f'Aditivo recusado (LegalCase {case.id}) — pré-cadastro '
                f'cancelado na invoice {invoice.number}.'
            ),
            old_value={'status': invoice.status},
            new_value={'status': 'cancelled', 'invoice': invoice.id,
                       'legal_case': case.id},
        )
        return invoice.id

    return None
