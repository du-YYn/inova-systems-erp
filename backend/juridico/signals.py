"""Gatilho de ENTRADA do Jurídico (v32 F3, doc 02 §3/§4).

ENTRADA contrato ← Coleta de dados preenchida (ClientOnboarding submitted)
    ──► cria LegalCase(contrato, source=comercial)

Atrás da flag AUTOMATION_JURIDICO_CONTRATO (off | dry_run | on, default
dry_run — doc 08 §11.2 R2). Em dry_run loga (logger + log_audit) o que
faria, sem criar nada. Idempotente: não duplica caso ABERTO (status !=
assinado) por cliente+tipo.
"""
import logging

from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from core.audit import log_audit

logger = logging.getLogger('juridico')

FLAG_NAME = 'AUTOMATION_JURIDICO_CONTRATO'


def _get_flag():
    value = str(getattr(settings, FLAG_NAME, 'dry_run')).strip().lower()
    if value not in ('off', 'dry_run', 'on'):
        logger.warning('%s com valor invalido %r — usando dry_run.', FLAG_NAME, value)
        return 'dry_run'
    return value


@receiver(post_save, sender='sales.ClientOnboarding', dispatch_uid='juridico_onboarding_contrato')
def on_client_onboarding_saved(sender, instance, created, **kwargs):
    """Quando a Coleta de Dados vira `submitted`, abre LegalCase(contrato)."""
    if instance.status != 'submitted':
        return

    flag = _get_flag()
    if flag == 'off':
        return

    from .models import LegalCase

    customer = instance.customer or getattr(instance.prospect, 'customer', None)
    if customer is None:
        logger.warning(
            'Gatilho juridico_contrato: onboarding %s submitted sem customer '
            'vinculado — LegalCase nao criado.', instance.id,
        )
        return

    # Idempotência: 1 caso ABERTO por cliente+tipo. Re-saves do onboarding
    # (ou novo onboarding do mesmo cliente) não duplicam o card.
    already_open = LegalCase.objects.filter(
        customer=customer, process_type='contrato',
    ).exclude(status='assinado').exists()
    if already_open:
        logger.info(
            'Gatilho juridico_contrato: customer %s ja tem LegalCase(contrato) '
            'aberto — ignorando (idempotente).', customer.id,
        )
        return

    if flag == 'dry_run':
        logger.info(
            'DRY_RUN %s: criaria LegalCase(contrato, source=comercial) para '
            'customer %s (onboarding %s). Sem efeito.',
            FLAG_NAME, customer.id, instance.id,
        )
        log_audit(
            None, 'legal_case_auto_create_dry_run', 'legal_case',
            details=(
                f'DRY_RUN {FLAG_NAME}: criaria LegalCase(contrato) para '
                f'customer {customer.id} (onboarding {instance.id}).'
            ),
            new_value={
                'customer': customer.id,
                'process_type': 'contrato',
                'source': 'comercial',
                'onboarding': instance.id,
                'dry_run': True,
            },
        )
        return

    case = LegalCase.objects.create(
        customer=customer,
        process_type='contrato',
        source='comercial',
        notes=(
            f'Criado automaticamente pela Coleta de Dados '
            f'(onboarding #{instance.id} — {instance.prospect.company_name}).'
        ),
    )
    logger.info(
        'Gatilho juridico_contrato: LegalCase %s criado para customer %s '
        '(onboarding %s).', case.id, customer.id, instance.id,
    )
    log_audit(
        None, 'legal_case_auto_create', 'legal_case', case.id,
        details=f'Gatilho {FLAG_NAME}: ClientOnboarding {instance.id} submitted.',
        new_value={
            'customer': customer.id,
            'process_type': 'contrato',
            'source': 'comercial',
            'status': 'preparacao',
            'onboarding': instance.id,
        },
    )
