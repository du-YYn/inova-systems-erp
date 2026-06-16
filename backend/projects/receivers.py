"""v32 F5 (Produção) — receivers/hooks dos eventos cross-setor (doc 04 §2/§5).

ENTRADAS da Produção:
- entrada_paga(invoice)        ← finance.events (hook lazy, F4) — seta
  Project.entrada_paga_at (flag AUTOMATION_PROD_ENTRADA)
- LegalCase(contrato) assinado → Project.contrato_assinado_at
  (flag AUTOMATION_PROD_CONTRATO_ASSINADO)
- LegalCase(validacao_documento) assinado → ProjectDocument signed + baseline
  (flag AUTOMATION_PROD_DOC_ASSINADA)

SAÍDA da Produção (bifurcação, doc 04 §5):
- entrar em etapa_10_graduacao/implementacao → cria RecurrenceContract
  (flag AUTOMATION_PROD_RECORRENCIA) — "todo entregue entra em recorrência"

Toda automação atrás de flag off | dry_run | on, default dry_run (doc 08
§11.2 R2): em dry_run loga (logger + log_audit) o que faria, sem efeito.
Todas idempotentes — disparar 2x não duplica efeito.
"""
import logging

from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from core.audit import log_audit

logger = logging.getLogger('projects')

ENTRADA_FLAG = 'AUTOMATION_PROD_ENTRADA'
CONTRATO_FLAG = 'AUTOMATION_PROD_CONTRATO_ASSINADO'
DOC_FLAG = 'AUTOMATION_PROD_DOC_ASSINADA'
RECORRENCIA_FLAG = 'AUTOMATION_PROD_RECORRENCIA'
# PRODUCERS Produção → Jurídico (doc 09 itens 06/07 + doc 10 §5/§B):
VALIDACAO_FLAG = 'AUTOMATION_PROD_VALIDACAO_JURIDICO'  # doc enviada → LegalCase(validacao)
ADITIVO_FLAG = 'AUTOMATION_PROD_ADITIVO_JURIDICO'      # Solicitar Mudança → LegalCase(aditivo)

# Etapas "iniciais" onde o pagamento da entrada/assinatura ainda é esperado
# (antes do desenvolvimento — doc 04 §1).
_EARLY_ETAPAS = (
    'agendar', 'etapa_3_preparacao', 'etapa_4_onboarding',
)
_PRE_DEV_ETAPAS = (
    'agendar', 'etapa_3_preparacao', 'etapa_4_onboarding',
    'etapa_5_documentacao', 'etapa_6_validacao_doc',
)


def _get_flag(name: str) -> str:
    value = str(getattr(settings, name, 'dry_run')).strip().lower()
    if value not in ('off', 'dry_run', 'on'):
        logger.warning('%s com valor invalido %r — usando dry_run.', name, value)
        return 'dry_run'
    return value


# ─── ENTRADA PAGA (Financeiro → Produção) ────────────────────────────────────

def entrada_paga(invoice):
    """Hook chamado por finance.events.on_entrada_paga (flag FIN em `on`).

    Seta entrada_paga_at no Project do customer mais recente em etapa ≤ 4
    (antes da documentação) que ainda não tem entrada paga. Idempotente:
    projeto já marcado não é tocado de novo.
    """
    flag = _get_flag(ENTRADA_FLAG)
    if flag == 'off':
        return None

    if not invoice.customer_id:
        logger.warning(
            'entrada_paga: invoice %s sem customer — Produção não atualizada.',
            invoice.id,
        )
        return None

    from .models import Project

    project = (
        Project.objects.filter(
            customer_id=invoice.customer_id,
            etapa_atual__in=_EARLY_ETAPAS,
            entrada_paga_at__isnull=True,
        )
        .exclude(situacao='cancelado')
        .order_by('-created_at')
        .first()
    )
    if project is None:
        logger.info(
            'entrada_paga: invoice %s (customer %s) sem projeto em etapa<=4 '
            'aguardando entrada — nada a fazer (idempotente).',
            invoice.id, invoice.customer_id,
        )
        return None

    if flag == 'dry_run':
        logger.info(
            'DRY_RUN %s: setaria entrada_paga_at no project %s (invoice %s). '
            'Sem efeito.', ENTRADA_FLAG, project.id, invoice.id,
        )
        log_audit(
            None, 'project_entrada_paga_dry_run', 'project', project.id,
            details=(
                f'DRY_RUN {ENTRADA_FLAG}: setaria entrada_paga_at '
                f'(invoice {invoice.number}, critério do Dia 0).'
            ),
            new_value={
                'invoice': invoice.id, 'project': project.id, 'dry_run': True,
            },
        )
        return None

    paid_at = timezone.now()
    project.entrada_paga_at = paid_at
    project.save(update_fields=['entrada_paga_at', 'updated_at'])

    from .transitions import maybe_set_dia_zero
    maybe_set_dia_zero(project)

    log_audit(
        None, 'project_entrada_paga', 'project', project.id,
        details=(
            f'Entrada paga (invoice {invoice.number}) — critério do Dia 0 '
            f'satisfeito para o projeto {project.name}.'
        ),
        old_value={'entrada_paga_at': None},
        new_value={
            'entrada_paga_at': str(paid_at),
            'invoice': invoice.id,
            'dia_zero': str(project.dia_zero) if project.dia_zero else None,
        },
    )
    logger.info(
        'entrada_paga: project %s marcado (invoice %s).', project.id, invoice.id,
    )
    return project


# ─── LEGALCASE ASSINADO (Jurídico → Produção) ────────────────────────────────

@receiver(post_save, sender='juridico.LegalCase',
          dispatch_uid='projects_legalcase_assinado')
def on_legal_case_saved(sender, instance, created, **kwargs):
    """Roteia LegalCase assinado para o efeito de Produção correspondente."""
    if instance.status != 'assinado':
        return
    if instance.process_type == 'contrato':
        _on_contrato_assinado(instance)
    elif instance.process_type == 'validacao_documento':
        _on_validacao_doc_assinada(instance)


def _resolve_project_for_case(case, etapas):
    """Project alvo do caso: FK direto ou o mais recente do customer."""
    from .models import Project
    if case.project_id:
        return case.project
    return (
        Project.objects.filter(customer_id=case.customer_id, etapa_atual__in=etapas)
        .exclude(situacao='cancelado')
        .order_by('-created_at')
        .first()
    )


def _resolve_created_by_for_case(case):
    """Resolve um usuário não-nulo para Project.created_by (PROTECT, NOT NULL).

    Ordem: created_by do caso → da proposta → do onboarding → do prospect do
    customer → USUÁRIO DE SERVIÇO dedicado ("system", inativo).

    M4 (code review): antes o último fallback era "primeiro admin ativo" — um
    admin real, arbitrário, que ficava como autor de um efeito de automação
    (poluindo a trilha de auditoria e podendo, no futuro, bloquear o delete
    daquele admin por PROTECT). Agora cai num usuário de serviço rotulado e
    inativo-para-login (accounts.services.get_system_user), que sempre existe
    (get_or_create). Nunca retorna None.
    """
    candidates = [
        getattr(case, 'created_by', None),
        getattr(getattr(case, 'proposal', None), 'created_by', None),
        getattr(getattr(case, 'onboarding', None), 'created_by', None),
    ]
    for user in candidates:
        if user is not None:
            return user
    # Prospect mais recente do customer (tem created_by).
    if case.customer_id:
        prospect = (
            case.customer.prospects.select_related('created_by')
            .order_by('-created_at')
            .first()
        )
        if prospect and prospect.created_by_id:
            return prospect.created_by
    # Fallback dedicado: usuário de serviço (rotulado, inativo p/ login).
    from accounts.services import get_system_user
    return get_system_user()


def _create_predev_project(case):
    """P0.4 (doc 09 §T-E2E): cria o Project de Produção na assinatura do contrato.

    Sem um Project pré-dev, o handshake Jurídico → Produção era no-op silencioso
    (o card de Produção nunca nascia). Cria um na etapa "agendar" (1ª — crava o
    Dia 0 provisório), com `tipo` derivado da proposta/prospect (fechado/
    recorrente). Idempotente: chamado só quando _resolve_project_for_case não
    achou nada. Atrás da flag CONTRATO_FLAG (tratada no caller).

    Returns: o Project criado, ou None se faltar customer/usuário.
    """
    customer = case.customer
    if customer is None:
        logger.warning(
            'contrato_assinado: LegalCase %s sem customer — Project de Produção '
            'não criado.', case.id,
        )
        return None

    created_by = _resolve_created_by_for_case(case)
    if created_by is None:
        logger.warning(
            'contrato_assinado: LegalCase %s sem usuário resolvível para '
            'created_by — Project de Produção não criado.', case.id,
        )
        return None

    # tipo (fechado/recorrente): do prospect vinculado -> default.
    tipo = ''
    prospect = None
    if customer.pk:
        prospect = customer.prospects.order_by('-created_at').first()
    for source in (prospect,):
        pt = getattr(source, 'project_type', '') if source else ''
        if pt in ('fechado', 'recorrente'):
            tipo = pt
            break

    from .models import Project

    name = (
        f'{customer.company_name or customer.name or "Cliente"} — Produção'
    )
    project = Project.objects.create(
        name=name,
        customer=customer,
        project_type='custom_dev',
        tipo=tipo,
        etapa_atual='agendar',
        situacao='ativo',
        start_date=timezone.now().date(),
        created_by=created_by,
        notes=(
            f'Criado automaticamente na assinatura do contrato '
            f'(LegalCase #{case.id}).'
        ),
    )
    log_audit(
        None, 'project_autocreate_on_contrato', 'project', project.id,
        details=(
            f'Project de Produção #{project.id} criado na assinatura do '
            f'contrato (LegalCase {case.id}, customer {customer.id}).'
        ),
        new_value={
            'project': project.id, 'customer': customer.id,
            'legal_case': case.id, 'etapa_atual': 'agendar', 'tipo': tipo,
        },
    )
    logger.info(
        'contrato_assinado: Project %s criado para customer %s (LegalCase %s).',
        project.id, customer.id, case.id,
    )
    return project


def _on_contrato_assinado(case):
    """LegalCase(contrato) assinado → Project.contrato_assinado_at.

    P0.4: se não existir Project pré-dev do customer, CRIA um (etapa "agendar")
    antes de marcar a assinatura — o card de Produção precisa nascer aqui.
    """
    flag = _get_flag(CONTRATO_FLAG)
    if flag == 'off':
        return

    project = _resolve_project_for_case(case, _PRE_DEV_ETAPAS)
    if project is None:
        if flag == 'dry_run':
            logger.info(
                'DRY_RUN %s: criaria Project de Produção (etapa agendar) e '
                'setaria contrato_assinado_at para o customer %s (LegalCase '
                '%s). Sem efeito.',
                CONTRATO_FLAG, case.customer_id, case.id,
            )
            log_audit(
                None, 'project_autocreate_on_contrato_dry_run', 'project',
                details=(
                    f'DRY_RUN {CONTRATO_FLAG}: criaria Project de Produção + '
                    f'contrato_assinado_at (LegalCase {case.id}).'
                ),
                new_value={
                    'customer': case.customer_id, 'legal_case': case.id,
                    'dry_run': True,
                },
            )
            return
        project = _create_predev_project(case)
        if project is None:
            logger.info(
                'contrato_assinado: LegalCase %s — Project de Produção não '
                'pôde ser criado; nada a fazer.', case.id,
            )
            return
    if project.contrato_assinado_at:
        logger.info(
            'contrato_assinado: project %s já marcado — ignorando '
            '(idempotente).', project.id,
        )
        return

    signed_at = case.signed_at or timezone.now()

    if flag == 'dry_run':
        logger.info(
            'DRY_RUN %s: setaria contrato_assinado_at=%s no project %s '
            '(LegalCase %s). Sem efeito.',
            CONTRATO_FLAG, signed_at, project.id, case.id,
        )
        log_audit(
            None, 'project_contrato_assinado_dry_run', 'project', project.id,
            details=(
                f'DRY_RUN {CONTRATO_FLAG}: setaria contrato_assinado_at '
                f'(LegalCase {case.id} assinado).'
            ),
            new_value={
                'legal_case': case.id, 'project': project.id, 'dry_run': True,
            },
        )
        return

    project.contrato_assinado_at = signed_at
    project.save(update_fields=['contrato_assinado_at', 'updated_at'])

    from .transitions import maybe_set_dia_zero
    maybe_set_dia_zero(project)

    log_audit(
        None, 'project_contrato_assinado', 'project', project.id,
        details=(
            f'Contrato assinado (LegalCase {case.id}) — critério do Dia 0 '
            f'satisfeito para o projeto {project.name}.'
        ),
        old_value={'contrato_assinado_at': None},
        new_value={
            'contrato_assinado_at': str(signed_at),
            'legal_case': case.id,
            'dia_zero': str(project.dia_zero) if project.dia_zero else None,
        },
    )
    logger.info(
        'contrato_assinado: project %s marcado (LegalCase %s).',
        project.id, case.id,
    )


def _on_validacao_doc_assinada(case):
    """LegalCase(validacao_documento) assinado → ProjectDocument baseline.

    Marca o ProjectDocument mais recente não-assinado do projeto como
    signed + is_current_baseline (desmarcando baseline anterior). Destrava
    o gate da Etapa 7 (REGRA OURO).
    """
    flag = _get_flag(DOC_FLAG)
    if flag == 'off':
        return

    project = _resolve_project_for_case(case, _PRE_DEV_ETAPAS)
    if project is None:
        logger.info(
            'validacao_doc: LegalCase %s sem projeto do customer %s — '
            'nada a fazer.', case.id, case.customer_id,
        )
        return

    from .models import ProjectDocument

    document = (
        ProjectDocument.objects.filter(project=project)
        .exclude(status='signed')
        .order_by('-version')
        .first()
    )
    if document is None:
        logger.info(
            'validacao_doc: project %s sem ProjectDocument pendente — '
            'ignorando (idempotente).', project.id,
        )
        return

    signed_at = case.signed_at or timezone.now()

    if flag == 'dry_run':
        logger.info(
            'DRY_RUN %s: marcaria ProjectDocument %s (v%s) como '
            'signed+baseline no project %s (LegalCase %s). Sem efeito.',
            DOC_FLAG, document.id, document.version, project.id, case.id,
        )
        log_audit(
            None, 'project_document_signed_dry_run', 'project_document',
            document.id,
            details=(
                f'DRY_RUN {DOC_FLAG}: marcaria doc v{document.version} como '
                f'signed + baseline (LegalCase {case.id}).'
            ),
            new_value={
                'project': project.id, 'legal_case': case.id, 'dry_run': True,
            },
        )
        return

    old_status = document.status
    # Baseline única: desmarca a anterior antes de promover a nova.
    ProjectDocument.objects.filter(
        project=project, is_current_baseline=True,
    ).exclude(pk=document.pk).update(is_current_baseline=False)

    document.status = 'signed'
    document.signed_at = signed_at
    document.is_current_baseline = True
    if case.autentique_id and not document.autentique_id:
        document.autentique_id = case.autentique_id
    document.save(update_fields=[
        'status', 'signed_at', 'is_current_baseline', 'autentique_id',
        'updated_at',
    ])

    log_audit(
        None, 'project_document_signed', 'project_document', document.id,
        details=(
            f'Doc v{document.version} assinada (LegalCase {case.id}) — '
            f'baseline do escopo do projeto {project.name}.'
        ),
        old_value={'status': old_status, 'is_current_baseline': False},
        new_value={
            'status': 'signed',
            'is_current_baseline': True,
            'signed_at': str(signed_at),
            'legal_case': case.id,
        },
    )
    logger.info(
        'validacao_doc: ProjectDocument %s signed+baseline (project %s, '
        'LegalCase %s).', document.id, project.id, case.id,
    )


# ─── BIFURCAÇÃO → RECORRÊNCIA (doc 04 §5) ────────────────────────────────────

def _resolve_recurring_monthly_value(project):
    """P1.7: valor mensal recorrente herdado do ProposalPaymentPlan.

    Busca a proposta aprovada/convertida mais recente do customer do projeto
    (via project.customer.proposals) que tenha um payment_plan com
    `recurring_amount` > 0, e devolve esse valor. Sem proposta vinculável /
    sem plano recorrente -> Decimal('0.00') (mesmo default do modelo).

    O `recurring_amount` é a fonte da verdade do valor mensal vendido (modal de
    proposta: Setup+Mensal / Só Mensal). Antes o RecurrenceContract nascia com
    monthly_value=0.00 e o MRR ficava zerado.
    """
    from decimal import Decimal

    if not project.customer_id:
        return Decimal('0.00')

    from sales.models import Proposal

    plan = (
        Proposal.objects.filter(
            customer_id=project.customer_id,
            status__in=['approved', 'converted'],
            payment_plan__recurring_amount__gt=0,
        )
        .order_by('-created_at')
        .values_list('payment_plan__recurring_amount', flat=True)
        .first()
    )
    if plan is None:
        return Decimal('0.00')
    return Decimal(plan)


def create_recurrence_contract(project, user=None):
    """Cria o RecurrenceContract na bifurcação (chamado por set_etapa).

    kind: suporte_basico (fechado/graduação) | operacao_continua
    (recorrente/implementação). Idempotente: 1 contrato ATIVO por projeto.
    O `monthly_value` é herdado do ProposalPaymentPlan (P1.7).
    """
    flag = _get_flag(RECORRENCIA_FLAG)
    if flag == 'off':
        return None

    from .models import RecurrenceContract
    from .transitions import RECORRENCIA_TIPO_BY_ETAPA

    kind = RECORRENCIA_TIPO_BY_ETAPA.get(project.etapa_atual)
    if kind is None:
        logger.warning(
            'recorrencia: project %s fora da bifurcação (etapa %s) — '
            'contrato não criado.', project.id, project.etapa_atual,
        )
        return None
    if not project.customer_id:
        logger.warning(
            'recorrencia: project %s sem customer — RecurrenceContract não '
            'criado.', project.id,
        )
        return None

    already_active = RecurrenceContract.objects.filter(
        project=project, status='ativo',
    ).exists()
    if already_active:
        logger.info(
            'recorrencia: project %s já tem RecurrenceContract ativo — '
            'ignorando (idempotente).', project.id,
        )
        return None

    monthly_value = _resolve_recurring_monthly_value(project)

    if flag == 'dry_run':
        logger.info(
            'DRY_RUN %s: criaria RecurrenceContract(%s, R$ %s/mês) para '
            'project %s (customer %s). Sem efeito.',
            RECORRENCIA_FLAG, kind, monthly_value, project.id, project.customer_id,
        )
        log_audit(
            user, 'recurrence_contract_create_dry_run', 'recurrence_contract',
            details=(
                f'DRY_RUN {RECORRENCIA_FLAG}: criaria RecurrenceContract '
                f'({kind}, R$ {monthly_value}/mês) para o projeto {project.name}.'
            ),
            new_value={
                'project': project.id,
                'customer': project.customer_id,
                'kind': kind,
                'monthly_value': str(monthly_value),
                'dry_run': True,
            },
        )
        return None

    contract = RecurrenceContract.objects.create(
        customer_id=project.customer_id,
        project=project,
        kind=kind,
        status='ativo',
        monthly_value=monthly_value,
        started_at=timezone.now(),
        created_by=user if (user and user.is_authenticated) else None,
    )
    log_audit(
        user, 'recurrence_contract_create', 'recurrence_contract', contract.id,
        details=(
            f'Bifurcação ({project.etapa_atual}): RecurrenceContract {kind} '
            f'criado para o projeto {project.name} (R$ {monthly_value}/mês) — '
            f'todo entregue entra em recorrência.'
        ),
        new_value={
            'project': project.id,
            'customer': project.customer_id,
            'kind': kind,
            'status': 'ativo',
            'monthly_value': str(monthly_value),
        },
    )
    logger.info(
        'recorrencia: RecurrenceContract %s (%s) criado para project %s.',
        contract.id, kind, project.id,
    )
    return contract


# ─── PRODUCER: Validação da doc → Jurídico (doc 09 item 06 / doc 10 §5) ───────

def create_validacao_legal_case(document, user=None):
    """Etapa 5 → 6: doc enviada pra validação CRIA LegalCase(validacao_documento).

    Preenche o gap do E2E: o consumidor (juridico/projects receivers — o
    `_on_validacao_doc_assinada`) já existe; faltava o PRODUTOR. Quando o
    ProjectDocument vira a baseline a validar (status pending_validation), abre
    o card no Jurídico (modalidade Validação) vinculado ao projeto/customer.

    Idempotente: 1 LegalCase(validacao_documento) ABERTO por projeto. Atrás da
    flag AUTOMATION_PROD_VALIDACAO_JURIDICO (off | dry_run | on, default dry_run).

    Returns: o LegalCase criado, ou None (flag off/dry_run / sem customer /
    idempotente).
    """
    flag = _get_flag(VALIDACAO_FLAG)
    if flag == 'off':
        return None

    project = document.project
    customer = project.customer if project else None
    if customer is None:
        logger.warning(
            'validacao_producer: ProjectDocument %s sem customer no projeto — '
            'LegalCase(validacao) não criado.', document.id,
        )
        return None

    from juridico.models import LegalCase

    already_open = LegalCase.objects.filter(
        customer=customer, project=project,
        process_type='validacao_documento',
    ).exclude(status__in=('assinado', 'aprovado_dev', 'recusado')).exists()
    if already_open:
        logger.info(
            'validacao_producer: projeto %s já tem LegalCase(validacao) aberto '
            '— ignorando (idempotente).', project.id,
        )
        return None

    if flag == 'dry_run':
        logger.info(
            'DRY_RUN %s: criaria LegalCase(validacao_documento) para customer '
            '%s (projeto %s, doc %s v%s). Sem efeito.',
            VALIDACAO_FLAG, customer.id, project.id, document.id, document.version,
        )
        log_audit(
            user, 'legal_case_validacao_producer_dry_run', 'legal_case',
            details=(
                f'DRY_RUN {VALIDACAO_FLAG}: criaria LegalCase(validacao_documento) '
                f'p/ customer {customer.id} (projeto {project.id}, doc {document.id}).'
            ),
            new_value={
                'customer': customer.id, 'project': project.id,
                'document': document.id, 'process_type': 'validacao_documento',
                'dry_run': True,
            },
        )
        return None

    case = LegalCase.objects.create(
        customer=customer,
        project=project,
        process_type='validacao_documento',
        source='producao',
        status='preparacao',
        autentique_id=document.autentique_id or '',
        notes=(
            f'Criado automaticamente pela Produção — doc v{document.version} '
            f'do projeto {project.name} enviada para validação/assinatura.'
        ),
        created_by=user if (user and getattr(user, 'is_authenticated', False)) else None,
    )
    case.record_event(
        'created',
        to_status=case.status, to_process_type=case.process_type,
        created_by=case.created_by,
        description=(
            f'Aberto pela Produção (Validação da doc) — projeto {project.name}, '
            f'doc v{document.version} (#{document.id}).'
        ),
        metadata={'project': project.id, 'document': document.id},
    )
    log_audit(
        user, 'legal_case_validacao_producer', 'legal_case', case.id,
        details=(
            f'Produção → Jurídico: LegalCase(validacao_documento) {case.id} '
            f'criado (projeto {project.name}, doc #{document.id}).'
        ),
        new_value={
            'customer': customer.id, 'project': project.id,
            'document': document.id, 'legal_case': case.id,
            'process_type': 'validacao_documento', 'source': 'producao',
        },
    )
    logger.info(
        'validacao_producer: LegalCase %s (validacao) criado p/ projeto %s '
        '(doc %s).', case.id, project.id, document.id,
    )
    return case


# ─── PRODUCER: Solicitar Mudança → Jurídico Aditivo (doc 09 item 07 / doc 10 §B) ─

def solicitar_mudanca(project, *, title, description, impact_hours=0,
                      impact_value=0, user=None, request=None):
    """Botão "Solicitar Mudança" (doc 10 §B): cria um ChangeRequest E abre a
    modalidade Aditivo no Jurídico (LegalCase aditivo) vinculado ao projeto +
    contrato original.

    O ChangeRequest é SEMPRE criado (registro do pedido na Produção). A criação
    do LegalCase(aditivo) fica atrás da flag AUTOMATION_PROD_ADITIVO_JURIDICO
    (off | dry_run | on, default dry_run). Idempotência do aditivo: 1 caso
    ABERTO por ChangeRequest (marcado em LegalCase.notes/event metadata).

    O consumidor da saída já existe: juridico.signals.on_aditivo_created
    pré-cadastra o valor no Financeiro; a transição assinado/recusado em
    juridico.services ativa/cancela a cobrança.

    Returns: (change_request, legal_case|None).
    """
    from decimal import Decimal

    from .models import ChangeRequest

    cr = ChangeRequest.objects.create(
        project=project,
        title=title,
        description=description,
        impact_hours=Decimal(str(impact_hours or 0)),
        impact_value=Decimal(str(impact_value or 0)),
        status='pending',
        requested_by=user if (user and getattr(user, 'is_authenticated', False)) else None,
        created_by=user,
    )
    log_audit(
        user, 'change_request_create', 'change_request', cr.id,
        details=(
            f'Solicitação de Mudança aberta no projeto {project.name}: '
            f'{title} (R$ {cr.impact_value}, {cr.impact_hours}h).'
        ),
        new_value={
            'project': project.id, 'title': title,
            'impact_value': str(cr.impact_value),
            'impact_hours': str(cr.impact_hours),
        },
        request=request,
    )

    case = _create_aditivo_legal_case(project, cr, user=user)
    return cr, case


def _create_aditivo_legal_case(project, change_request, user=None):
    """Abre LegalCase(aditivo, nova_solicitacao) vinculado ao projeto.

    Recebe por referência o contrato original (LegalCase contrato assinado) e
    os dados da mudança (ChangeRequest, via metadata). Atrás da flag
    AUTOMATION_PROD_ADITIVO_JURIDICO. Idempotente por ChangeRequest.
    """
    flag = _get_flag(ADITIVO_FLAG)
    if flag == 'off':
        return None

    customer = project.customer
    if customer is None:
        logger.warning(
            'aditivo_producer: projeto %s sem customer — LegalCase(aditivo) '
            'não criado.', project.id,
        )
        return None

    from juridico.models import LegalCase

    # Idempotência: não duplica caso aberto deste ChangeRequest.
    already_open = LegalCase.objects.filter(
        customer=customer, project=project, process_type='aditivo',
        events__metadata__change_request=change_request.id,
    ).exclude(status__in=('assinado', 'recusado')).exists()
    if already_open:
        logger.info(
            'aditivo_producer: ChangeRequest %s já tem LegalCase(aditivo) '
            'aberto — ignorando (idempotente).', change_request.id,
        )
        return None

    # Contrato original assinado (vínculo por referência — doc 09 item 07).
    contrato = (
        LegalCase.objects.filter(
            customer=customer, process_type='contrato', status='assinado',
        )
        .order_by('-signed_at', '-created_at')
        .first()
    )

    if flag == 'dry_run':
        logger.info(
            'DRY_RUN %s: criaria LegalCase(aditivo) para customer %s '
            '(projeto %s, ChangeRequest %s). Sem efeito.',
            ADITIVO_FLAG, customer.id, project.id, change_request.id,
        )
        log_audit(
            user, 'legal_case_aditivo_producer_dry_run', 'legal_case',
            details=(
                f'DRY_RUN {ADITIVO_FLAG}: criaria LegalCase(aditivo) p/ customer '
                f'{customer.id} (projeto {project.id}, CR {change_request.id}).'
            ),
            new_value={
                'customer': customer.id, 'project': project.id,
                'change_request': change_request.id, 'process_type': 'aditivo',
                'dry_run': True,
            },
        )
        return None

    case = LegalCase.objects.create(
        customer=customer,
        project=project,
        process_type='aditivo',
        source='producao',
        status='nova_solicitacao',
        notes=(
            f'Solicitação de Mudança (ChangeRequest #{change_request.id}): '
            f'{change_request.title}. '
            + (f'Contrato original: LegalCase #{contrato.id}. '
               if contrato else 'Sem contrato original assinado vinculável. ')
            + f'Valor estimado: R$ {change_request.impact_value}, '
            f'{change_request.impact_hours}h.'
        ),
        created_by=user if (user and getattr(user, 'is_authenticated', False)) else None,
    )
    case.record_event(
        'created',
        to_status=case.status, to_process_type=case.process_type,
        created_by=case.created_by,
        description=(
            f'Aberto pela Produção (Solicitar Mudança) — projeto {project.name}, '
            f'ChangeRequest #{change_request.id}.'
        ),
        metadata={
            'project': project.id,
            'change_request': change_request.id,
            'contrato_original': contrato.id if contrato else None,
        },
    )
    log_audit(
        user, 'legal_case_aditivo_producer', 'legal_case', case.id,
        details=(
            f'Produção → Jurídico: LegalCase(aditivo) {case.id} criado '
            f'(projeto {project.name}, ChangeRequest #{change_request.id}).'
        ),
        new_value={
            'customer': customer.id, 'project': project.id,
            'change_request': change_request.id, 'legal_case': case.id,
            'contrato_original': contrato.id if contrato else None,
            'process_type': 'aditivo', 'source': 'producao',
        },
    )
    logger.info(
        'aditivo_producer: LegalCase %s (aditivo) criado p/ projeto %s '
        '(ChangeRequest %s, contrato %s).',
        case.id, project.id, change_request.id,
        contrato.id if contrato else None,
    )
    return case
