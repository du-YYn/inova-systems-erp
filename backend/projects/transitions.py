"""v32 F5 — transições de etapa do projeto (doc 04 §1/§6).

Regras:
- A etapa anda 1 passo por vez no trilho canônico (Project.ETAPA_ORDER);
  voltar etapas é permitido (correção operacional), sempre auditado.
- BIFURCAÇÃO (doc 04 §5): de `registro_entrega`, tipo=fechado vai para
  `etapa_10_graduacao` e tipo=recorrente vai para `implementacao`; ambas
  convergem em `recorrencia`.
- REGRA OURO (doc 04 §6): entrar em `etapa_7_desenvolvimento` exige os 3
  critérios — contrato assinado + entrada paga + doc baseline assinada.
- Dia 0 = data do onboarding, só quando os 3 critérios ok (doc 04 §2).
- Toda transição registra log_audit com old/new (doc 08 §7.1).

Validações levantam rest_framework.exceptions.ValidationError → 400 com o
motivo (transição inválida não muda estado, doc 08 §6).
"""
import logging

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from core.audit import log_audit

logger = logging.getLogger('projects')

# Alvos válidos a partir de registro_entrega, por tipo (doc 04 §5)
BIFURCATION_TARGET_BY_TIPO = {
    'fechado': 'etapa_10_graduacao',
    'recorrente': 'implementacao',
}

# Etapas pós-bifurcação → recorrencia_tipo correspondente
RECORRENCIA_TIPO_BY_ETAPA = {
    'etapa_10_graduacao': 'suporte_basico',
    'implementacao': 'operacao_continua',
}

GATE_ETAPA_DEV = 'etapa_7_desenvolvimento'


def _etapa_index(etapa: str) -> int:
    from .models import Project
    try:
        return Project.ETAPA_ORDER.index(etapa)
    except ValueError:
        raise ValidationError({'etapa_atual': f'Etapa desconhecida: {etapa!r}.'})


def allowed_next_etapas(project) -> list:
    """Próximas etapas válidas (avanço) a partir da etapa atual."""
    from .models import Project
    current = project.etapa_atual
    order = Project.ETAPA_ORDER

    if current == 'registro_entrega':
        # Bifurcação por tipo; sem tipo definido, nenhuma das duas é válida.
        target = BIFURCATION_TARGET_BY_TIPO.get(project.tipo)
        return [target] if target else []
    if current in ('etapa_10_graduacao', 'implementacao'):
        return ['recorrencia']
    if current == 'recorrencia':
        return []
    index = order.index(current)
    return [order[index + 1]]


def check_dev_gate(project) -> list:
    """REGRA OURO: motivos que ainda bloqueiam a entrada na Etapa 7."""
    reasons = []
    if not project.contrato_assinado_at:
        reasons.append('contrato não assinado (LegalCase do Jurídico)')
    if not project.entrada_paga_at:
        reasons.append('entrada não paga (Invoice do Financeiro)')
    has_baseline = project.documents.filter(
        status='signed', is_current_baseline=True,
    ).exists()
    if not has_baseline:
        reasons.append('documentação sem baseline assinada (ProjectDocument)')
    return reasons


def maybe_set_dia_zero(project, save: bool = True) -> bool:
    """Seta dia_zero = data do onboarding quando os 3 critérios estão ok.

    Idempotente: não sobrescreve dia_zero já definido. Retorna True quando
    o campo foi setado nesta chamada.
    """
    if project.dia_zero:
        return False
    if not (
        project.contrato_assinado_at
        and project.entrada_paga_at
        and project.onboarding_realizado_at
    ):
        return False
    project.dia_zero = timezone.localdate(project.onboarding_realizado_at)
    if save:
        project.save(update_fields=['dia_zero', 'updated_at'])
    log_audit(
        None, 'project_dia_zero_set', 'project', project.id,
        details=(
            f'Dia 0 definido ({project.dia_zero}) — 3 critérios satisfeitos '
            f'(contrato + entrada + onboarding).'
        ),
        new_value={
            'dia_zero': str(project.dia_zero),
            'contrato_assinado_at': str(project.contrato_assinado_at),
            'entrada_paga_at': str(project.entrada_paga_at),
            'onboarding_realizado_at': str(project.onboarding_realizado_at),
        },
    )
    logger.info('Project %s: dia_zero=%s (3 critérios ok).',
                project.id, project.dia_zero)
    return True


def set_etapa(project, nova: str, user=None, request=None):
    """Valida e aplica a transição de etapa (400 com motivo se inválida)."""
    from .models import Project
    valid = dict(Project.ETAPA_CHOICES)
    if nova not in valid:
        raise ValidationError({'etapa': f'Etapa inválida: {nova!r}.'})

    old = project.etapa_atual
    if nova == old:
        raise ValidationError({'etapa': 'O projeto já está nessa etapa.'})

    old_index = _etapa_index(old)
    new_index = _etapa_index(nova)

    if new_index > old_index:
        allowed = allowed_next_etapas(project)
        if nova not in allowed:
            if old == 'registro_entrega' and nova in RECORRENCIA_TIPO_BY_ETAPA:
                # Bifurcação com tipo errado/ausente — mensagem específica
                raise ValidationError({'etapa': (
                    f'Bifurcação inválida: projeto tipo={project.tipo or "indefinido"} '
                    f'não pode ir para {nova}. '
                    f'fechado → etapa_10_graduacao; recorrente → implementacao.'
                )})
            raise ValidationError({'etapa': (
                f'Transição inválida: de {old} só é possível avançar para '
                f'{", ".join(allowed) if allowed else "nenhuma etapa"}.'
            )})
        if nova == GATE_ETAPA_DEV:
            reasons = check_dev_gate(project)
            if reasons:
                raise ValidationError({'etapa': (
                    'REGRA OURO: desenvolvimento só começa com assinatura + '
                    'pagamento + doc aprovada. Pendências: '
                    + '; '.join(reasons) + '.'
                )})

    update_fields = ['etapa_atual', 'updated_at']
    project.etapa_atual = nova

    recorrencia_tipo = RECORRENCIA_TIPO_BY_ETAPA.get(nova)
    if recorrencia_tipo and project.recorrencia_tipo != recorrencia_tipo:
        project.recorrencia_tipo = recorrencia_tipo
        update_fields.append('recorrencia_tipo')

    project.save(update_fields=update_fields)

    gate_snapshot = None
    if nova == GATE_ETAPA_DEV:
        gate_snapshot = {
            'contrato_assinado_at': str(project.contrato_assinado_at),
            'entrada_paga_at': str(project.entrada_paga_at),
            'doc_baseline_assinada': True,
        }
    log_audit(
        user, 'project_etapa_transition', 'project', project.id,
        details=(
            f'Etapa: {old} → {nova}'
            + (' (retorno)' if new_index < old_index else '')
            + (f' · gate Dia 0: {gate_snapshot}' if gate_snapshot else '')
        ),
        old_value={'etapa_atual': old},
        new_value={
            'etapa_atual': nova,
            **({'gate': gate_snapshot} if gate_snapshot else {}),
            **(
                {'recorrencia_tipo': project.recorrencia_tipo}
                if recorrencia_tipo else {}
            ),
        },
        request=request,
    )
    logger.info('Project %s: etapa %s -> %s (user=%s).',
                project.id, old, nova, getattr(user, 'username', 'sistema'))

    # Bifurcação concluída → todo entregue entra em recorrência (doc 04 §5)
    if nova in RECORRENCIA_TIPO_BY_ETAPA:
        from .receivers import create_recurrence_contract
        create_recurrence_contract(project, user=user)

    return project


def set_situacao(project, nova: str, user=None, request=None):
    """Estado ortogonal ativo | em_espera | cancelado (doc 04 §1)."""
    from .models import Project
    valid = dict(Project.SITUACAO_CHOICES)
    if nova not in valid:
        raise ValidationError({'situacao': f'Situação inválida: {nova!r}.'})
    old = project.situacao
    if nova == old:
        raise ValidationError({'situacao': 'O projeto já está nessa situação.'})
    project.situacao = nova
    project.save(update_fields=['situacao', 'updated_at'])
    log_audit(
        user, 'project_situacao_change', 'project', project.id,
        details=f'Situação: {old} → {nova} (etapa preservada: {project.etapa_atual}).',
        old_value={'situacao': old},
        new_value={'situacao': nova},
        request=request,
    )
    logger.info('Project %s: situacao %s -> %s (user=%s).',
                project.id, old, nova, getattr(user, 'username', 'sistema'))
    return project


def set_onboarding_agendado(project, *, when, user=None, request=None):
    """Etapa "agendar": crava a reunião de Onboarding AGENDADA (âncora
    provisória do cronograma — Visão 2, doc 09 item 08).

    `when` (datetime): data/hora da reunião agendada. Seta
    `onboarding_agendado_em` e, se o projeto ainda está em "agendar", avança
    para "etapa_3_preparacao" (Planejamento). Distinto do Dia 0 confirmado
    (maybe_set_dia_zero), que só nasce quando o onboarding ACONTECE.
    """
    if when is None:
        raise ValidationError(
            {'onboarding_agendado_em': 'Informe a data/hora da reunião agendada.'})

    old = project.onboarding_agendado_em
    project.onboarding_agendado_em = when
    project.save(update_fields=['onboarding_agendado_em', 'updated_at'])

    log_audit(
        user, 'project_onboarding_agendado', 'project', project.id,
        details=(
            f'Reunião de Onboarding agendada para {timezone.localdate(when)} — '
            f'âncora provisória do cronograma (Dia 0 provisório).'
        ),
        old_value={'onboarding_agendado_em': str(old) if old else None},
        new_value={'onboarding_agendado_em': str(when)},
        request=request,
    )
    logger.info(
        'Project %s: onboarding agendado em %s (user=%s).',
        project.id, when, getattr(user, 'username', 'sistema'),
    )

    if project.etapa_atual == 'agendar':
        set_etapa(project, 'etapa_3_preparacao', user=user, request=request)

    return project


def marcar_onboarding_realizado(project, user=None, data=None, request=None):
    """Etapa 4 realizada: seta onboarding_realizado_at (+ dia_zero se os
    outros 2 critérios já estão ok) e avança etapa_3 → etapa_4.

    `data` (date, opcional): data da reunião de onboarding — default hoje.
    """
    if project.onboarding_realizado_at:
        raise ValidationError(
            {'onboarding': 'Onboarding já marcado como realizado.'})

    now = timezone.now()
    if data is not None:
        moment = timezone.make_aware(
            timezone.datetime(data.year, data.month, data.day, 12, 0))
    else:
        moment = now

    project.onboarding_realizado_at = moment
    project.save(update_fields=['onboarding_realizado_at', 'updated_at'])

    dia_zero_set = maybe_set_dia_zero(project)

    log_audit(
        user, 'project_onboarding_realizado', 'project', project.id,
        details=(
            f'Onboarding realizado em {timezone.localdate(moment)}. '
            + (
                f'Dia 0 definido: {project.dia_zero}.' if dia_zero_set
                else 'Dia 0 ainda pendente (assinatura/pagamento).'
            )
        ),
        old_value={'onboarding_realizado_at': None},
        new_value={
            'onboarding_realizado_at': str(moment),
            'dia_zero': str(project.dia_zero) if project.dia_zero else None,
        },
        request=request,
    )

    if project.etapa_atual == 'etapa_3_preparacao':
        set_etapa(project, 'etapa_4_onboarding', user=user, request=request)

    return project
