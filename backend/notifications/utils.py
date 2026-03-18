"""Utilitários para criação de notificações de forma centralizada."""
import logging
from typing import Optional, List

logger = logging.getLogger('notifications')


def create_notification(user_id: int, notification_type: str, title: str, message: str,
                         object_type: str = '', object_id: Optional[int] = None) -> None:
    """Cria uma notificação para um usuário específico."""
    try:
        from .models import Notification
        Notification.objects.create(
            user_id=user_id,
            notification_type=notification_type,
            title=title,
            message=message,
            object_type=object_type,
            object_id=object_id,
        )
    except Exception as e:
        logger.error(f"Erro ao criar notificação: {e}")


def notify_users(user_ids: List[int], notification_type: str, title: str, message: str,
                  object_type: str = '', object_id: Optional[int] = None) -> None:
    """Cria notificações para múltiplos usuários."""
    try:
        from .models import Notification
        notifications = [
            Notification(
                user_id=uid,
                notification_type=notification_type,
                title=title,
                message=message,
                object_type=object_type,
                object_id=object_id,
            )
            for uid in user_ids
        ]
        Notification.objects.bulk_create(notifications, ignore_conflicts=True)
    except Exception as e:
        logger.error(f"Erro ao criar notificações em massa: {e}")


def notify_admins_and_managers(notification_type: str, title: str, message: str,
                                 object_type: str = '', object_id: Optional[int] = None) -> None:
    """Notifica todos os admins e managers ativos."""
    try:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user_ids = list(User.objects.filter(
            role__in=['admin', 'manager'], is_active=True
        ).values_list('id', flat=True))
        notify_users(user_ids, notification_type, title, message, object_type, object_id)
    except Exception as e:
        logger.error(f"Erro ao notificar admins/managers: {e}")
