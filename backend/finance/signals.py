import logging
from django.db.models.signals import post_save, post_delete, pre_save
from django.dispatch import receiver

from core.audit import log_audit

logger = logging.getLogger('finance')


def _schedule_budget_recalculation(instance):
    """Agenda recálculo de budgets afetados pela transaction."""
    if not instance.category_id:
        return

    from .tasks import recalculate_budget_actuals
    from .models import Budget
    from django.utils import timezone

    today = instance.date or timezone.now().date()

    budgets = Budget.objects.filter(
        category_id=instance.category_id,
        is_active=True,
        start_date__lte=today,
        end_date__gte=today,
    )

    for budget in budgets:
        try:
            recalculate_budget_actuals.delay(budget.id)
            logger.info(f"Recálculo de budget {budget.id} agendado via signal")
        except Exception as e:
            logger.error(f"Falha ao agendar recálculo do budget {budget.id}: {e}")


@receiver(post_save, sender='finance.Transaction')
def on_transaction_saved(sender, instance, created, **kwargs):
    """Ao criar ou atualizar uma Transaction, recalcula budgets afetados."""
    _schedule_budget_recalculation(instance)


@receiver(post_delete, sender='finance.Transaction')
def on_transaction_deleted(sender, instance, **kwargs):
    """Ao deletar uma Transaction, recalcula budgets afetados."""
    _schedule_budget_recalculation(instance)


# ─────────────────────────────────────────────────────────────────────────────
# v32 F4 — Gatilhos de ENTRADA do Financeiro (doc 03 §2/§3)
# ─────────────────────────────────────────────────────────────────────────────

PRECADASTRO_FLAG = 'AUTOMATION_FIN_PRECADASTRO'
LIBERA_COBRANCA_FLAG = 'AUTOMATION_FIN_LIBERA_COBRANCA'


@receiver(
    post_save, sender='sales.ClientOnboarding',
    dispatch_uid='finance_onboarding_precadastro',
)
def on_client_onboarding_submitted(sender, instance, created, **kwargs):
    """Coleta de Dados submetida -> PRÉ-CADASTRA invoices pendentes (§3.01).

    Roda EM PARALELO ao gatilho do Jurídico (mesmo signal, receiver
    próprio). Atrás da flag AUTOMATION_FIN_PRECADASTRO (default dry_run).
    Idempotência fica no service (Invoice.precadastro_origem).
    """
    if instance.status != 'submitted':
        return

    from .flags import get_automation_flag
    from .services import (
        PRECADASTRO_DRY_RUN_ACTION, precadastrar_invoice_da_proposta,
    )

    flag = get_automation_flag(PRECADASTRO_FLAG)
    if flag == 'off':
        return

    prospect = instance.prospect

    if flag == 'dry_run':
        planned = precadastrar_invoice_da_proposta(prospect, dry_run=True)
        if not planned:
            return
        logger.info(
            'DRY_RUN %s: criaria %s invoices pendentes para prospect %s '
            '(onboarding %s). Sem efeito.',
            PRECADASTRO_FLAG, len(planned), prospect.id, instance.id,
        )
        log_audit(
            None, PRECADASTRO_DRY_RUN_ACTION, 'invoice',
            details=(
                f'DRY_RUN {PRECADASTRO_FLAG}: criaria {len(planned)} invoices '
                f'pendentes do plano da proposta (prospect {prospect.id}, '
                f'onboarding {instance.id}).'
            ),
            new_value={
                'prospect': prospect.id,
                'onboarding': instance.id,
                'invoices': [
                    {'description': e['description'], 'value': str(e['value']),
                     'due_date': str(e['due_date']), 'role': e['role']}
                    for e in planned
                ],
                'dry_run': True,
            },
        )
        return

    precadastrar_invoice_da_proposta(prospect)


@receiver(
    post_save, sender='juridico.LegalCase',
    dispatch_uid='finance_libera_cobranca',
)
def on_legal_case_signed(sender, instance, created, **kwargs):
    """LegalCase(contrato) assinado -> LIBERA a cobrança do cliente (§3.02).

    Regra de ouro do doc 03 §2: a invoice pré-cadastrada só vira cobrança
    ATIVA com contrato assinado. Atrás da flag AUTOMATION_FIN_LIBERA_COBRANCA
    (default dry_run). Idempotente: segunda execução não encontra invoice
    com cobranca_liberada=False.
    """
    if instance.process_type != 'contrato' or instance.status != 'assinado':
        return

    from .flags import get_automation_flag
    from .services import (
        LIBERA_COBRANCA_DRY_RUN_ACTION, liberar_cobranca_do_cliente,
    )

    flag = get_automation_flag(LIBERA_COBRANCA_FLAG)
    if flag == 'off':
        return

    if flag == 'dry_run':
        invoice_ids = liberar_cobranca_do_cliente(
            instance.customer, legal_case=instance, dry_run=True,
        )
        if not invoice_ids:
            return
        logger.info(
            'DRY_RUN %s: liberaria cobranca de %s invoices do customer %s '
            '(LegalCase %s assinado). Sem efeito.',
            LIBERA_COBRANCA_FLAG, len(invoice_ids),
            instance.customer_id, instance.id,
        )
        log_audit(
            None, LIBERA_COBRANCA_DRY_RUN_ACTION, 'invoice',
            details=(
                f'DRY_RUN {LIBERA_COBRANCA_FLAG}: liberaria cobrança de '
                f'{len(invoice_ids)} invoices do customer '
                f'{instance.customer_id} (LegalCase {instance.id} assinado).'
            ),
            new_value={
                'customer': instance.customer_id,
                'legal_case': instance.id,
                'invoices': invoice_ids,
                'dry_run': True,
            },
        )
        return

    liberar_cobranca_do_cliente(instance.customer, legal_case=instance)


@receiver(
    pre_save, sender='finance.Invoice',
    dispatch_uid='finance_invoice_track_status',
)
def on_invoice_pre_save(sender, instance, **kwargs):
    """Guarda o status anterior para detectar a transição -> paid no post_save.

    Só consulta o banco quando o save pode ser uma transição para paid
    (instance.status == 'paid' e registro já existe).
    """
    instance._old_status = None
    if instance.pk and instance.status == 'paid':
        instance._old_status = (
            sender.objects.filter(pk=instance.pk)
            .values_list('status', flat=True)
            .first()
        )


@receiver(
    post_save, sender='finance.Invoice',
    dispatch_uid='finance_invoice_entrada_paga',
)
def on_invoice_paid(sender, instance, created, **kwargs):
    """Invoice da ENTRADA transiciona para paid -> evento entrada_paga (§3.03).

    Cobre mark_paid (InvoiceViewSet) e qualquer outro caminho que salve a
    invoice via ORM (ex.: _mark_entry_paid legado). Updates via queryset
    .update() não passam aqui (intencional — check_invoice_overdue não muda
    para paid). Flag tratada dentro de events.on_entrada_paga.
    """
    if created or instance.status != 'paid':
        return
    old_status = getattr(instance, '_old_status', None)
    if old_status is None or old_status == 'paid':
        return

    from .events import is_entrada, on_entrada_paga

    if is_entrada(instance):
        on_entrada_paga(instance, old_status=old_status)
