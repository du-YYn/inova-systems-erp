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
