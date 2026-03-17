import logging
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

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
