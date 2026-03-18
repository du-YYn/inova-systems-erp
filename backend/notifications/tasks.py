import logging
from celery import shared_task
from django.utils import timezone
from datetime import timedelta, date

logger = logging.getLogger('notifications')


@shared_task
def check_task_deadlines():
    """Verifica tarefas próximas do prazo e cria notificações."""
    try:
        from projects.models import ProjectTask
        from .utils import create_notification

        tomorrow = date.today() + timedelta(days=1)

        # Tarefas que vencem amanhã e não estão concluídas
        tasks = ProjectTask.objects.filter(
            due_date=tomorrow,
            status__in=['todo', 'in_progress', 'review'],
            assigned_to__isnull=False,
        ).select_related('assigned_to', 'project')

        for task in tasks:
            create_notification(
                user_id=task.assigned_to.id,
                notification_type='task_due',
                title=f'Tarefa vence amanhã: {task.title}',
                message=f'A tarefa "{task.title}" no projeto "{task.project.name}" vence amanhã.',
                object_type='task',
                object_id=task.id,
            )

        logger.info(f"Verificação de prazos: {tasks.count()} notificações criadas")
        return tasks.count()
    except Exception as e:
        logger.error(f"Erro em check_task_deadlines: {e}")
        return 0


@shared_task
def check_invoice_overdue():
    """Verifica faturas vencidas e cria notificações."""
    try:
        from finance.models import Invoice
        from .utils import notify_admins_and_managers

        today = date.today()

        # Faturas que venceram hoje
        newly_overdue = Invoice.objects.filter(
            due_date=today,
            status='pending',
            invoice_type='receivable',
        )

        # Atualiza status para overdue
        newly_overdue.update(status='overdue')

        for invoice in newly_overdue:
            customer_name = invoice.customer.company_name if invoice.customer else 'Sem cliente'
            notify_admins_and_managers(
                notification_type='invoice_overdue',
                title=f'Fatura vencida: {invoice.number}',
                message=f'A fatura {invoice.number} de {customer_name} (R$ {invoice.total}) venceu hoje.',
                object_type='invoice',
                object_id=invoice.id,
            )

        logger.info(f"Faturas vencidas: {newly_overdue.count()} atualizadas")
        return newly_overdue.count()
    except Exception as e:
        logger.error(f"Erro em check_invoice_overdue: {e}")
        return 0


@shared_task
def check_sla_warnings():
    """Verifica tickets próximos de violar SLA."""
    try:
        from support.models import SupportTicket
        from .utils import create_notification

        now = timezone.now()
        warning_threshold = now + timedelta(hours=2)

        # Tickets onde o prazo de resolução está próximo (dentro de 2h)
        at_risk = SupportTicket.objects.filter(
            status__in=['open', 'in_progress'],
            sla_resolution_deadline__isnull=False,
            sla_resolution_deadline__lte=warning_threshold,
            sla_resolution_deadline__gte=now,
            assigned_to__isnull=False,
        ).select_related('assigned_to')

        for ticket in at_risk:
            create_notification(
                user_id=ticket.assigned_to.id,
                notification_type='sla_warning',
                title=f'SLA próximo de vencer: #{ticket.number}',
                message=f'O ticket #{ticket.number} - "{ticket.title}" tem o SLA vencendo em breve.',
                object_type='ticket',
                object_id=ticket.id,
            )

        return at_risk.count()
    except Exception as e:
        logger.error(f"Erro em check_sla_warnings: {e}")
        return 0
