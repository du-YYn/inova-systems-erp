"""Gatilho de ENTRADA do Jurídico (v32 F3, doc 02 §3/§4 + doc 09 itens 05/07).

ENTRADA contrato ← Coleta de dados preenchida (ClientOnboarding submitted)
    ──► cria LegalCase(contrato, source=comercial) VINCULANDO onboarding +
        proposta aprovada (doc 09 item 05).

SAÍDA aditivo ← LegalCase(aditivo) criado em "nova_solicitacao"
    ──► avisa o Financeiro p/ PRÉ-CADASTRAR o valor adicional (doc 09 item 07,
        atrás da flag AUTOMATION_FIN_ADITIVO).

Contrato atrás da flag AUTOMATION_JURIDICO_CONTRATO (off | dry_run | on,
default dry_run — doc 08 §11.2 R2). Em dry_run loga (logger + log_audit) o
que faria, sem criar nada. Idempotente: não duplica caso ABERTO (status !=
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


def _resolve_approved_proposal(prospect):
    """Proposta aprovada/convertida mais recente do prospect (doc 09 item 05).

    No fluxo, a proposta é aprovada ANTES do forms, então já existe. Sem
    proposta vinculável -> None (o caso é criado mesmo assim).
    """
    if prospect is None:
        return None
    from sales.models import Proposal
    return (
        Proposal.objects.filter(
            prospect=prospect, status__in=['approved', 'converted'],
        )
        .order_by('-created_at')
        .first()
    )


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

    # Proposta aprovada daquele prospect (vínculo por referência — item 05).
    proposal = _resolve_approved_proposal(instance.prospect)

    if flag == 'dry_run':
        logger.info(
            'DRY_RUN %s: criaria LegalCase(contrato, source=comercial) para '
            'customer %s (onboarding %s, proposta %s). Sem efeito.',
            FLAG_NAME, customer.id, instance.id,
            proposal.id if proposal else None,
        )
        log_audit(
            None, 'legal_case_auto_create_dry_run', 'legal_case',
            details=(
                f'DRY_RUN {FLAG_NAME}: criaria LegalCase(contrato) para '
                f'customer {customer.id} (onboarding {instance.id}, '
                f'proposta {proposal.id if proposal else "—"}).'
            ),
            new_value={
                'customer': customer.id,
                'process_type': 'contrato',
                'source': 'comercial',
                'onboarding': instance.id,
                'proposal': proposal.id if proposal else None,
                'dry_run': True,
            },
        )
        return

    case = LegalCase.objects.create(
        customer=customer,
        process_type='contrato',
        source='comercial',
        # Vínculo por referência (item 05): forms imutável + proposta aprovada.
        onboarding=instance,
        proposal=proposal,
        notes=(
            f'Criado automaticamente pela Coleta de Dados '
            f'(onboarding #{instance.id} — {instance.prospect.company_name}).'
        ),
    )
    # Timeline do card (item 06).
    case.record_event(
        'created',
        to_status=case.status, to_process_type=case.process_type,
        description=(
            f'Aberto pela Coleta de Dados (onboarding #{instance.id}'
            + (f', proposta #{proposal.id}' if proposal else ', sem proposta vinculada')
            + ').'
        ),
        metadata={'onboarding': instance.id,
                  'proposal': proposal.id if proposal else None},
    )
    logger.info(
        'Gatilho juridico_contrato: LegalCase %s criado para customer %s '
        '(onboarding %s, proposta %s).',
        case.id, customer.id, instance.id, proposal.id if proposal else None,
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
            'proposal': proposal.id if proposal else None,
        },
    )


@receiver(
    post_save, sender='juridico.LegalCase',
    dispatch_uid='juridico_aditivo_precadastro',
)
def on_aditivo_created(sender, instance, created, **kwargs):
    """LegalCase(aditivo) criado em "nova_solicitacao" -> avisa o Financeiro.

    Saída do Aditivo (doc 09 item 07): ao chegar a nova solicitação, o
    Financeiro PRÉ-CADASTRA o valor adicional (pendente). Atrás da flag
    AUTOMATION_FIN_ADITIVO (default dry_run); idempotência fica no service.
    Isolado: um erro aqui NÃO derruba o save do caso (CLAUDE.md).
    """
    if not created:
        return
    if instance.process_type != 'aditivo' or instance.status != 'nova_solicitacao':
        return

    from .services import precadastrar_aditivo
    try:
        precadastrar_aditivo(instance, user=instance.created_by)
    except Exception as exc:  # noqa: BLE001 — isolamento de signal
        logger.exception(
            'Falha no pre-cadastro do Aditivo (LegalCase %s): %s',
            instance.id, exc,
        )


@receiver(
    post_save, sender='juridico.LegalCase',
    dispatch_uid='juridico_seed_stage_tasks',
)
def seed_tasks_on_create(sender, instance, created, **kwargs):
    """Ao criar um LegalCase (qualquer origem), semeia o checklist da etapa inicial."""
    if not created:
        return
    from .checklists import seed_stage_tasks
    try:
        seed_stage_tasks(instance, instance.status)
    except Exception as exc:  # noqa: BLE001 — isolamento de signal
        logger.exception(
            'Falha ao semear tarefas do LegalCase %s: %s', instance.id, exc,
        )
