"""Renderiza e envia emails usando templates do banco de dados."""
import logging
import re

from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings

from .models import EmailTemplate

logger = logging.getLogger('notifications')


def render_template(slug: str, variables: dict) -> dict | None:
    """Busca template por slug, substitui variáveis, retorna {subject, html}."""
    try:
        template = EmailTemplate.objects.get(slug=slug)
    except EmailTemplate.DoesNotExist:
        logger.warning(f"Email template '{slug}' não encontrado")
        return None

    if not template.is_active:
        logger.info(f"Email template '{slug}' está desativado, email não enviado")
        return None

    # Substituir {{variavel}} no assunto e corpo
    subject = template.subject
    body = template.body_html
    for key, value in variables.items():
        pattern = '{{' + key + '}}'
        subject = subject.replace(pattern, str(value))
        body = body.replace(pattern, str(value))

    # Verificar se restou alguma variável não substituída
    remaining = re.findall(r'\{\{(\w+)\}\}', body)
    if remaining:
        logger.warning(f"Template '{slug}': variáveis não substituídas: {remaining}")

    return {'subject': subject, 'html': body}


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_template_email(self, slug: str, recipient: str, variables: dict):
    """Renderiza template e envia email (task Celery assíncrona)."""
    if not recipient:
        logger.warning(f"send_template_email('{slug}'): destinatário vazio, email não enviado")
        return

    result = render_template(slug, variables)
    if not result:
        return

    try:
        send_mail(
            subject=result['subject'],
            message='',  # Fallback texto vazio (email é HTML)
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient],
            html_message=result['html'],
            fail_silently=False,
        )
        logger.info(f"Email '{slug}' enviado para: {recipient}")
    except Exception as exc:
        logger.error(f"Falha ao enviar email '{slug}' para {recipient}: {exc}")
        raise self.retry(exc=exc)


def send_template_email_sync(slug: str, recipient: str, variables: dict) -> bool:
    """Versão síncrona para uso em contextos sem Celery (ex: testes)."""
    if not recipient:
        return False

    result = render_template(slug, variables)
    if not result:
        return False

    try:
        send_mail(
            subject=result['subject'],
            message='',
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient],
            html_message=result['html'],
            fail_silently=False,
        )
        return True
    except Exception as exc:
        logger.error(f"Falha ao enviar email '{slug}' para {recipient}: {exc}")
        return False
