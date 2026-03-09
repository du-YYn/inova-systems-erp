import logging
from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings

logger = logging.getLogger('accounts')


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_password_reset_email(self, user_id: int, token: str):
    """Envia email de reset de senha de forma assíncrona."""
    from django.contrib.auth import get_user_model
    User = get_user_model()

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        logger.error(f"send_password_reset_email: usuário {user_id} não encontrado")
        return

    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"

    try:
        send_mail(
            subject='Redefinição de senha — Inova Systems ERP',
            message=(
                f'Olá {user.get_full_name() or user.username},\n\n'
                f'Você solicitou a redefinição de sua senha.\n\n'
                f'Acesse o link abaixo para criar uma nova senha (válido por 24 horas):\n'
                f'{reset_url}\n\n'
                f'Se você não solicitou isso, ignore este email.\n\n'
                f'Equipe Inova Systems'
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
        logger.info(f"Email de reset enviado para: {user.email}")
    except Exception as exc:
        logger.error(f"Falha ao enviar email para {user.email}: {exc}")
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_generic_email(self, recipient: str, subject: str, message: str):
    """Envia email genérico de forma assíncrona."""
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient],
            fail_silently=False,
        )
        logger.info(f"Email enviado para: {recipient} | Assunto: {subject}")
    except Exception as exc:
        logger.error(f"Falha ao enviar email para {recipient}: {exc}")
        raise self.retry(exc=exc)
