import logging
from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings

logger = logging.getLogger('accounts')


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_password_reset_email(self, user_id: int, token: str):
    """Envia email de reset de senha via template."""
    from django.contrib.auth import get_user_model
    from notifications.email_renderer import send_template_email_sync
    User = get_user_model()

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        logger.error(f"send_password_reset_email: usuário {user_id} não encontrado")
        return

    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"

    try:
        success = send_template_email_sync('password_reset', user.email, {
            'nome': user.get_full_name() or user.username,
            'link_reset': reset_url,
        })
        if not success:
            # Fallback para texto puro se template não existir
            send_mail(
                subject='Redefinição de senha — Inova Systems',
                message=f'Olá {user.get_full_name() or user.username},\n\nLink: {reset_url}\n\nEquipe Inova Systems',
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
            )
        from core.logging_utils import mask_email
        logger.info(f"Email de reset enviado para: {mask_email(user.email)}")
    except Exception as exc:
        from core.logging_utils import mask_email
        logger.error(f"Falha ao enviar email para {mask_email(user.email)}: {exc}")
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_generic_email(self, recipient: str, subject: str, message: str):
    """Envia email genérico de forma assíncrona."""
    from core.logging_utils import mask_email
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient],
            fail_silently=False,
        )
        logger.info(f"Email enviado para: {mask_email(recipient)} | Assunto: {subject}")
    except Exception as exc:
        logger.error(f"Falha ao enviar email para {mask_email(recipient)}: {exc}")
        raise self.retry(exc=exc)
