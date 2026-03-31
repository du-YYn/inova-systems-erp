import logging
from celery import shared_task
from django.db.models import Sum

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
