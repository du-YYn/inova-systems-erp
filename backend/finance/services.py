"""Serviços de automação do Financeiro (v32 F4, doc processo-v32/03-financeiro.md).

01° Pré-cadastro paralelo (§3.01): Coleta de Dados submetida -> cria
    Invoice(receivable, pending) a partir do ProposalPaymentPlan da proposta
    aprovada do prospect. Idempotente via `Invoice.precadastro_origem`.
02° Liberação de cobrança (§3.02): LegalCase(contrato) assinado -> invoices
    pendentes do cliente ficam enviáveis (`cobranca_liberada=True`).

Os gatilhos (signals) vivem em `finance/signals.py`; aqui fica só a regra
de negócio, testável sem disparar signal.
"""
import logging
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from core.audit import log_audit

logger = logging.getLogger('finance')

PRECADASTRO_ACTION = 'invoice_precadastro_create'
PRECADASTRO_DRY_RUN_ACTION = 'invoice_precadastro_dry_run'
LIBERA_COBRANCA_ACTION = 'invoice_cobranca_liberada'
LIBERA_COBRANCA_DRY_RUN_ACTION = 'invoice_cobranca_liberada_dry_run'

# Papel de cada invoice pré-cadastrada dentro do plano (payment_details).
ROLE_ENTRADA = 'entrada'
ROLE_PARCELA = 'parcela'
ROLE_RECORRENTE = 'recorrente'


def _add_months(base: date, months: int) -> date:
    """Soma meses a uma data, clamp do dia em 28 (padrão já usado no sales)."""
    m = base.month + months
    y = base.year + (m - 1) // 12
    m = (m - 1) % 12 + 1
    return date(y, m, min(base.day, 28))


def _resolve_customer(prospect):
    """Resolve o Customer do prospect (FK direto, onboarding ou nome)."""
    from sales.models import Customer

    if prospect.customer_id:
        return prospect.customer
    onboarding = getattr(prospect, 'onboarding', None)
    if onboarding is not None and onboarding.customer_id:
        return onboarding.customer
    return Customer.objects.filter(
        company_name__iexact=prospect.company_name,
    ).first()


def _resolve_approved_proposal(prospect):
    """Proposta aprovada/convertida mais recente do prospect com payment_plan."""
    from sales.models import Proposal

    return (
        Proposal.objects.filter(
            prospect=prospect,
            status__in=['approved', 'converted'],
            payment_plan__isnull=False,
        )
        .select_related('payment_plan')
        .order_by('-created_at')
        .first()
    )


def _build_precadastro_entries(prospect, plan) -> list[dict]:
    """Monta as parcelas (entrada/parcelas/recorrentes) a partir do plano.

    Retorna lista de dicts {description, value, due_date, role, method,
    sequence, total} — sem tocar o banco (usado também no dry_run).
    """
    today = timezone.now().date()
    entries: list[dict] = []
    company = prospect.company_name

    has_one_time = (
        plan.plan_type in ('one_time', 'setup_plus_recurring')
        and Decimal(plan.one_time_amount or 0) > 0
    )

    if has_one_time:
        total = Decimal(plan.one_time_amount)
        n = max(1, plan.one_time_installments or 1)
        first_due = plan.one_time_first_due or today
        parcel = (total / n).quantize(Decimal('0.01'))
        for i in range(n):
            # Última parcela absorve a diferença de arredondamento.
            value = parcel if i < n - 1 else total - parcel * (n - 1)
            role = ROLE_ENTRADA if i == 0 else ROLE_PARCELA
            label = 'Entrada' if i == 0 else 'Parcela'
            entries.append({
                'description': f'{company} — {label} ({i + 1}/{n})',
                'value': value,
                'due_date': _add_months(first_due, i),
                'role': role,
                'method': plan.one_time_method or '',
                'sequence': i + 1,
                'total': n,
            })

    recurring_amount = Decimal(plan.recurring_amount or 0)
    if (
        plan.plan_type in ('recurring_only', 'setup_plus_recurring')
        and recurring_amount > 0
    ):
        months = max(1, plan.recurring_duration_months or 1)
        if plan.recurring_first_due:
            first_due = plan.recurring_first_due
        elif plan.recurring_day_of_month:
            first_due = _add_months(
                today.replace(day=min(plan.recurring_day_of_month, 28)), 1,
            )
        else:
            first_due = _add_months(today, 1)
        for i in range(months):
            # Sem bloco one_time, a 1a mensalidade é a "entrada" do projeto
            # (critério de pagamento do Dia 0 — doc 03 §2 SAÍDA).
            role = (
                ROLE_ENTRADA if (not has_one_time and i == 0) else ROLE_RECORRENTE
            )
            entries.append({
                'description': f'{company} — Mensalidade ({i + 1}/{months})',
                'value': recurring_amount,
                'due_date': _add_months(first_due, i),
                'role': role,
                'method': plan.recurring_method or '',
                'sequence': i + 1,
                'total': months,
            })

    return entries


def precadastrar_invoice_da_proposta(prospect, dry_run: bool = False) -> list:
    """Pré-cadastra Invoices(receivable, pending) do plano da proposta aprovada.

    Idempotente: se o prospect já tem invoices com `precadastro_origem`
    apontando pra ele, não cria de novo (re-save do onboarding não duplica).

    Args:
        prospect: sales.Prospect com proposta aprovada + ProposalPaymentPlan.
        dry_run: True -> não escreve nada; retorna o plano calculado (dicts).

    Returns:
        dry_run=False: lista de Invoice criadas (vazia se nada a fazer).
        dry_run=True: lista de dicts com as parcelas que SERIAM criadas.
    """
    from .invoice_generator import _next_invoice_number
    from .models import Invoice

    if Invoice.objects.filter(precadastro_origem=prospect).exists():
        logger.info(
            'Pre-cadastro F4: prospect %s ja tem invoices pre-cadastradas — '
            'ignorando (idempotente).', prospect.id,
        )
        return []

    proposal = _resolve_approved_proposal(prospect)
    if proposal is None:
        logger.warning(
            'Pre-cadastro F4: prospect %s sem proposta aprovada com plano de '
            'pagamento — nada a pre-cadastrar.', prospect.id,
        )
        return []

    customer = _resolve_customer(prospect)
    if customer is None:
        logger.warning(
            'Pre-cadastro F4: prospect %s sem customer vinculado — '
            'pre-cadastro nao criado.', prospect.id,
        )
        return []

    plan = proposal.payment_plan
    entries = _build_precadastro_entries(prospect, plan)
    if not entries:
        logger.warning(
            'Pre-cadastro F4: plano da proposta %s sem valores (> 0) — '
            'nada a pre-cadastrar.', proposal.number,
        )
        return []

    if dry_run:
        return entries

    today = timezone.now().date()
    created = []
    with transaction.atomic():
        for entry in entries:
            created.append(Invoice.objects.create(
                invoice_type='receivable',
                document_type='invoice',
                customer=customer,
                number=_next_invoice_number('receivable'),
                issue_date=today,
                due_date=entry['due_date'],
                value=entry['value'],
                total=entry['value'],
                description=entry['description'],
                items=[{
                    'description': entry['description'],
                    'quantity': 1,
                    'unit_price': float(entry['value']),
                    'total': float(entry['value']),
                }],
                payment_method=entry['method'],
                payment_details={
                    'precadastro_role': entry['role'],
                    'sequence': entry['sequence'],
                    'total_installments': entry['total'],
                },
                status='pending',
                precadastro_origem=prospect,
                cobranca_liberada=False,
                notes=(
                    f'Pré-cadastro automático (F4) — proposta {proposal.number}, '
                    f'coleta de dados do prospect {prospect.company_name}.'
                ),
                created_by=prospect.created_by,
            ))

    logger.info(
        'Pre-cadastro F4: %s invoices criadas para prospect %s '
        '(proposta %s, customer %s).',
        len(created), prospect.id, proposal.number, customer.id,
    )
    log_audit(
        None, PRECADASTRO_ACTION, 'invoice',
        details=(
            f'Pré-cadastro automático: {len(created)} invoices pendentes '
            f'criadas da proposta {proposal.number} (prospect {prospect.id}).'
        ),
        new_value={
            'prospect': prospect.id,
            'proposal': proposal.id,
            'customer': customer.id,
            'invoices': [
                {'id': inv.id, 'number': inv.number, 'total': str(inv.total),
                 'due_date': str(inv.due_date)}
                for inv in created
            ],
        },
    )
    return created


def liberar_cobranca_do_cliente(customer, legal_case=None, dry_run: bool = False) -> list:
    """Libera a cobrança das invoices pendentes do cliente (regra de ouro §2).

    Marca `cobranca_liberada=True` em toda Invoice receivable pendente do
    cliente que ainda não foi liberada. Idempotente por natureza (segunda
    chamada não encontra nada para liberar).

    Returns:
        Lista de ids de Invoice liberadas (ou que SERIAM liberadas, em dry_run).
    """
    from .models import Invoice

    pending = Invoice.objects.filter(
        customer=customer,
        invoice_type='receivable',
        status__in=['pending', 'sent', 'overdue'],
        cobranca_liberada=False,
    ).order_by('due_date')
    invoice_ids = list(pending.values_list('id', flat=True))

    if not invoice_ids:
        logger.info(
            'Liberacao de cobranca F4: customer %s sem invoices pendentes '
            'para liberar.', customer.id,
        )
        return []

    if dry_run:
        return invoice_ids

    # .update() não dispara signals de Invoice — intencional: liberar
    # cobrança não muda status, só o gate de envio.
    Invoice.objects.filter(id__in=invoice_ids).update(cobranca_liberada=True)

    logger.info(
        'Liberacao de cobranca F4: %s invoices liberadas para customer %s '
        '(legal_case %s).',
        len(invoice_ids), customer.id, getattr(legal_case, 'id', None),
    )
    log_audit(
        None, LIBERA_COBRANCA_ACTION, 'invoice',
        details=(
            f'Contrato assinado (LegalCase '
            f'{getattr(legal_case, "id", "-")}) — cobrança liberada para '
            f'{len(invoice_ids)} invoices do customer {customer.id}.'
        ),
        old_value={'cobranca_liberada': False, 'invoices': invoice_ids},
        new_value={'cobranca_liberada': True, 'invoices': invoice_ids,
                   'legal_case': getattr(legal_case, 'id', None)},
    )
    return invoice_ids
