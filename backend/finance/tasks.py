import logging
from celery import shared_task
from django.db.models import Q, Sum

logger = logging.getLogger('finance')


@shared_task
def recalculate_budget_actuals(budget_id: int):
    """
    Recalcula o campo `actual` de um Budget com base nas Transactions
    associadas à mesma categoria e período.
    """
    from .models import Budget, Transaction

    try:
        budget = Budget.objects.get(pk=budget_id)
    except Budget.DoesNotExist:
        logger.error(f"recalculate_budget_actuals: budget {budget_id} não encontrado")
        return

    actual = Transaction.objects.filter(
        category=budget.category,
        date__gte=budget.start_date,
        date__lte=budget.end_date,
        transaction_type='expense',
    ).aggregate(total=Sum('amount'))['total'] or 0

    budget.actual = actual
    budget.save(update_fields=['actual'])
    logger.info(f"Budget {budget_id} ({budget.name}) recalculado: actual={actual}")


@shared_task
def recalculate_all_active_budgets():
    """
    Task periódica (Celery Beat) para recalcular todos os budgets ativos.
    Agendada via django-celery-beat.
    """
    from .models import Budget
    from django.utils import timezone

    today = timezone.now().date()
    active_budgets = Budget.objects.filter(
        is_active=True,
        start_date__lte=today,
        end_date__gte=today,
    )

    for budget in active_budgets:
        recalculate_budget_actuals.delay(budget.id)

    logger.info(f"Recálculo agendado para {active_budgets.count()} budgets ativos")


@shared_task
def generate_recurring_invoices():
    """
    Gera faturas automáticas a partir das despesas fixas recorrentes.
    Roda no 1º dia de cada mês (Celery Beat).
    Cria Invoice 'payable' para cada RecurringExpense ativa + recorrente.
    """
    from .models import RecurringExpense, Invoice, Category
    from django.utils import timezone
    from django.db import transaction as db_transaction

    today = timezone.now().date()
    month_label = today.strftime('%m/%Y')

    expenses = RecurringExpense.objects.filter(is_active=True, is_recurring=True)
    created = 0

    # Busca ou cria categoria "Despesas Fixas" para associar
    category, _ = Category.objects.get_or_create(
        name='Despesas Fixas',
        defaults={'category_type': 'expense'},
    )

    for exp in expenses:
        # Evita duplicata: verifica se já existe fatura deste mês para esta despesa
        existing = Invoice.objects.filter(
            invoice_type='payable',
            description__startswith=f'[REC] {exp.description}',
            due_date__year=today.year,
            due_date__month=today.month,
        ).exists()
        if existing:
            continue

        due_day = min(exp.due_day, 28)  # Evita dias inválidos
        due_date = today.replace(day=due_day)

        with db_transaction.atomic():
            last = (
                Invoice.objects.select_for_update()
                .filter(invoice_type='payable')
                .order_by('-id')
                .first()
            )
            last_seq = 0
            if last:
                try:
                    last_seq = int(last.number.split('-')[1])
                except (IndexError, ValueError):
                    last_seq = 0

            Invoice.objects.create(
                invoice_type='payable',
                number=f"PAG-{last_seq + 1:05d}",
                description=f'[REC] {exp.description} — {month_label}',
                value=exp.value,
                discount=0,
                interest=0,
                tax=0,
                total=exp.value,
                issue_date=today,
                due_date=due_date,
                status='pending',
                category=category,
                notes=f'Gerada automaticamente de despesa fixa: {exp.get_expense_category_display()} > {exp.description}',
                created_by_id=1,  # admin
            )
            created += 1

    logger.info(f"generate_recurring_invoices: {created} faturas criadas para {month_label}")


# ─────────────────────────────────────────────────────────────────────────────
# v32 F4 — Régua de cobrança (dunning, doc 03 §3.04)
# ─────────────────────────────────────────────────────────────────────────────

DUNNING_FLAG = 'AUTOMATION_FIN_REGUA'
DUNNING_ACTION = 'fin_regua_cobranca'
DUNNING_DRY_RUN_ACTION = 'fin_regua_cobranca_dry_run'

# Janelas da régua: (offset em dias relativo ao vencimento, rótulo pt-BR).
# Negativo = a vencer; positivo = vencida há N dias.
DUNNING_WINDOWS = [
    (-3, 'a vencer em 3 dias'),
    (1, 'vencida há 1 dia'),
    (7, 'vencida há 7 dias'),
]


@shared_task
def dunning_reminders():
    """Régua de cobrança: lembretes de fatura a vencer (3d) e vencida (1/7d).

    Complementa check_invoice_overdue (que só marca o D+0). Atrás da flag
    AUTOMATION_FIN_REGUA (off | dry_run | on, default dry_run):
    - dry_run: loga (logger + log_audit) o que lembraria, sem Notification.
    - on: cria Notification para admins/managers (sem email real nesta fase).

    Só considera invoices ENVIÁVEIS: sem pré-cadastro (fluxo antigo) ou com
    cobrança liberada (regra de ouro F4 — pré-cadastro não cobrável não
    entra na régua). Agendada no Celery Beat diário às 08:30.
    """
    from datetime import timedelta

    from django.utils import timezone

    from .flags import get_automation_flag
    from .models import Invoice
    from core.audit import log_audit

    flag = get_automation_flag(DUNNING_FLAG)
    if flag == 'off':
        return 0

    today = timezone.now().date()
    total_reminders = 0
    audit_entries = []

    for offset, label in DUNNING_WINDOWS:
        target_date = today + timedelta(days=-offset)
        statuses = ['pending', 'sent'] if offset < 0 else ['pending', 'sent', 'overdue']
        invoices = list(
            Invoice.objects.filter(
                invoice_type='receivable',
                due_date=target_date,
                status__in=statuses,
            )
            .filter(Q(precadastro_origem__isnull=True) | Q(cobranca_liberada=True))
            .select_related('customer')
        )
        if not invoices:
            continue

        for invoice in invoices:
            customer_name = (
                invoice.customer.company_name if invoice.customer else 'Sem cliente'
            )
            title = f'Fatura {invoice.number} {label}'
            message = (
                f'A fatura {invoice.number} de {customer_name} '
                f'(R$ {invoice.total}) está {label} '
                f'(vencimento {invoice.due_date.strftime("%d/%m/%Y")}).'
            )
            audit_entries.append({
                'invoice': invoice.id,
                'number': invoice.number,
                'window': label,
                'due_date': str(invoice.due_date),
            })
            if flag == 'dry_run':
                logger.info(
                    'DRY_RUN %s: enviaria lembrete "%s" (invoice %s). '
                    'Sem efeito.', DUNNING_FLAG, title, invoice.id,
                )
            else:
                from notifications.utils import notify_admins_and_managers
                notification_type = (
                    'invoice_overdue' if offset > 0 else 'general'
                )
                notify_admins_and_managers(
                    notification_type=notification_type,
                    title=title,
                    message=message,
                    object_type='invoice',
                    object_id=invoice.id,
                )
                logger.info(
                    'Regua de cobranca F4: lembrete "%s" criado (invoice %s).',
                    title, invoice.id,
                )
            total_reminders += 1

    if audit_entries:
        action = DUNNING_DRY_RUN_ACTION if flag == 'dry_run' else DUNNING_ACTION
        log_audit(
            None, action, 'invoice',
            details=(
                f'Régua de cobrança ({flag}): {total_reminders} lembretes '
                f'{"simulados" if flag == "dry_run" else "criados"} em '
                f'{today.isoformat()}.'
            ),
            new_value={
                'reminders': audit_entries,
                'dry_run': flag == 'dry_run',
            },
        )

    logger.info('dunning_reminders (%s): %s lembretes.', flag, total_reminders)
    return total_reminders
