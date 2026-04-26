"""Gerador de invoices a partir da ativação de contrato.

Ponto de entrada: `generate_activation_invoices(contract, mode, ...)` — retorna
a lista de `Invoice` criadas. Usa `finance.pricing` para todos os cálculos
(sem duplicar matemática).

Dois blocos de cobrança são gerados:

1. **Setup** — baseado em `contract.payment_plan.one_time_amount`.
   - pix              → 1 invoice (hoje)
   - boleto N         → N invoices mensais
   - card_installments N (sem/com repasse) → N invoices a cada 32 dias
   - card_anticipated → 1 invoice em D+2 com desconto de antecipação

2. **Recorrência** — baseado em `contract.monthly_value` e
   `contract.payment_plan.recurring_duration_months`. Gera N invoices mensais
   (método definido em `recurring_method`).
"""
from decimal import Decimal
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import Invoice, PaymentProvider
from .pricing import calculate_card, calculate_boleto, calculate_pix, calculate_recurring


MODE_TO_METHOD = {
    'pix': 'pix',
    'boleto': 'boleto',
    'card_installments': 'credit_card',
    'card_anticipated': 'credit_card',
}


def _next_invoice_number(invoice_type: str = 'receivable') -> str:
    """Gera próximo número atomicamente via PostgreSQL sequence.

    Sequence `invoice_seq_receivable`/`invoice_seq_payable` foi criada na
    migration 0012. Cada chamada a nextval() é atômica em nível DB — imune
    a race conditions entre transações paralelas.
    """
    from django.db import connection
    prefix = 'REC' if invoice_type == 'receivable' else 'PAG'
    seq_name = f'invoice_seq_{invoice_type}'
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT nextval('{seq_name}')")
        seq_value = cursor.fetchone()[0]
    return f"{prefix}-{seq_value:05d}"


def _make_invoice(contract, user, due_date, value, total, description,
                  payment_method, items, payment_details):
    """Cria uma Invoice receivable pending associada ao contrato."""
    return Invoice.objects.create(
        invoice_type='receivable',
        document_type='invoice',
        contract=contract,
        customer=contract.customer,
        number=_next_invoice_number(),
        issue_date=timezone.now().date(),
        due_date=due_date,
        value=value,
        total=total,
        description=description,
        items=items,
        payment_method=payment_method,
        payment_details=payment_details,
        status='pending',
        is_recurring=False,
        created_by=user,
    )


def _build_setup_invoices(contract, user, provider, mode, installments,
                          anticipate, repass_fee):
    """Gera as invoices de setup usando finance.pricing."""
    plan = getattr(contract, 'payment_plan', None)
    if not plan:
        return [], Decimal('0')

    gross = Decimal(plan.one_time_amount or 0)
    if gross <= 0:
        return [], Decimal('0')

    method = MODE_TO_METHOD[mode]
    rate = provider.rates.filter(method=method).first()
    if not rate:
        raise ValueError(
            f'Provider {provider.code} não tem taxas cadastradas para {method}.'
        )

    today = timezone.now().date()

    if mode == 'pix':
        sim = calculate_pix(gross=gross, fee_fixed=rate.fixed_fee)
    elif mode == 'boleto':
        sim = calculate_boleto(
            gross=gross, installments=installments, fee_fixed=rate.fixed_fee,
        )
    else:  # card_installments or card_anticipated
        sim = calculate_card(
            gross=gross, installments=installments,
            fee_pct=rate.installment_fee_pct,
            fee_fixed=rate.installment_fee_fixed,
            anticipation_monthly_pct=rate.anticipation_monthly_pct,
            anticipate=anticipate, repass_fee=repass_fee,
        )

    created = []
    total_fees = Decimal(sim['client_pays']) - Decimal(sim['company_receives_total'])

    for entry in sim['company_schedule']:
        due_date = today + timedelta(days=entry['days_ahead'])
        net_amount = Decimal(entry['amount'])
        # Valor que o cliente paga (bruto) nessa parcela
        if mode == 'pix':
            gross_parcel = Decimal(sim['client_pays'])
        elif mode == 'boleto':
            gross_parcel = Decimal(sim['client_installment_value'])
        elif anticipate:
            # Antecipação: 1 evento só; cliente pagou o client_pays total
            gross_parcel = Decimal(sim['client_pays'])
        else:
            gross_parcel = Decimal(sim['client_installment_value'])

        description = f"Setup — {contract.title} ({entry['label']})"
        # Invoice.value e Invoice.total sao a RECEITA BRUTA cobrada do cliente
        # (usada por DRE, NF-e, ROB, mark_paid). O liquido pos-taxa vai para
        # payment_details.net_company_receives para conciliacao bancaria.
        items = [{
            'description': description,
            'quantity': 1,
            'unit_price': float(gross_parcel),
            'total': float(gross_parcel),
        }]
        payment_details = {
            'provider_id': provider.id,
            'provider_code': provider.code,
            'activation_mode': mode,
            'sequence': entry['sequence'],
            'total_installments': len(sim['company_schedule']) if mode != 'card_anticipated' else installments,
            'gross_charged_to_client': str(gross_parcel),
            'net_company_receives': str(net_amount),
            'fee_retained': str((gross_parcel - net_amount).quantize(Decimal('0.01'))),
        }
        inv = _make_invoice(
            contract=contract,
            user=user,
            due_date=due_date,
            value=gross_parcel,
            total=gross_parcel,
            description=description,
            payment_method=method,
            items=items,
            payment_details=payment_details,
        )
        created.append(inv)

    return created, total_fees.quantize(Decimal('0.01'))


def _build_recurring_invoices(contract, user, provider):
    """Gera as invoices recorrentes (MRR) com base em monthly_value + duration."""
    plan = getattr(contract, 'payment_plan', None)
    if not plan:
        return [], Decimal('0')

    monthly = Decimal(plan.recurring_amount or contract.monthly_value or 0)
    duration = plan.recurring_duration_months or 0
    if monthly <= 0 or duration <= 0:
        return [], Decimal('0')

    recurring_method = (plan.recurring_method or 'boleto').lower()
    if recurring_method not in ('pix', 'boleto', 'credit_card', 'transfer'):
        recurring_method = 'boleto'

    fee_pct = Decimal('0')
    fee_fixed = Decimal('0')
    if recurring_method in ('credit_card', 'boleto', 'pix'):
        rate = provider.rates.filter(method=recurring_method).first()
        if rate:
            fee_pct = rate.installment_fee_pct
            fee_fixed = rate.installment_fee_fixed if recurring_method == 'credit_card' else rate.fixed_fee

    sim = calculate_recurring(
        monthly_value=monthly, duration_months=duration,
        fee_pct=fee_pct, fee_fixed=fee_fixed,
    )

    today = timezone.now().date()
    created = []

    for entry in sim['company_schedule']:
        due_date = today + timedelta(days=entry['days_ahead'])
        net_amount = Decimal(entry['amount'])
        description = f"Mensalidade — {contract.title} ({entry['label']})"
        # total = valor bruto cobrado (receita fiscal); net vai para payment_details
        items = [{
            'description': description,
            'quantity': 1,
            'unit_price': float(monthly),
            'total': float(monthly),
        }]
        payment_details = {
            'provider_id': provider.id,
            'provider_code': provider.code,
            'sequence': entry['sequence'],
            'total_months': duration,
            'gross_charged_to_client': str(monthly),
            'net_company_receives': str(net_amount),
            'fee_retained': str((monthly - net_amount).quantize(Decimal('0.01'))),
        }
        inv = _make_invoice(
            contract=contract,
            user=user,
            due_date=due_date,
            value=monthly,
            total=monthly,
            description=description,
            payment_method=recurring_method,
            items=items,
            payment_details=payment_details,
        )
        inv.is_recurring = True
        inv.recurring_pattern = 'monthly'
        inv.save(update_fields=['is_recurring', 'recurring_pattern'])
        created.append(inv)

    total_fees = Decimal(sim['client_pays']) - Decimal(sim['company_receives_total'])
    return created, total_fees.quantize(Decimal('0.01'))


@transaction.atomic
def generate_activation_invoices(
    contract, user, mode: str,
    provider=None, provider_id: int | None = None,
    installments: int = 1,
    anticipate: bool = False,
    repass_fee: bool = False,
):
    """Gera invoices de setup + recorrência para um contrato ativado.

    Aceita `provider` (objeto já validado pelo caller — preferivel, evita
    TOCTOU) ou `provider_id` (compat). Se ambos, `provider` tem prioridade.

    Returns:
        dict: `{'setup_invoices': [...], 'recurring_invoices': [...],
                'total_fees_setup': Decimal, 'total_fees_recurring': Decimal}`

    Raises:
        ValueError: provider/mode inválido ou provider sem taxas configuradas.
    """
    if mode not in MODE_TO_METHOD:
        raise ValueError(f'activation_mode inválido: {mode}')

    # F4.3: aceitar objeto provider pre-validado (remove TOCTOU e query extra)
    if provider is None:
        if provider_id is None:
            raise ValueError('Informe provider ou provider_id.')
        try:
            provider = PaymentProvider.objects.get(id=provider_id, is_active=True)
        except PaymentProvider.DoesNotExist:
            raise ValueError('Provider não encontrado ou inativo.')

    setup_invoices, setup_fees = _build_setup_invoices(
        contract, user, provider, mode, installments, anticipate, repass_fee,
    )
    recurring_invoices, recurring_fees = _build_recurring_invoices(
        contract, user, provider,
    )

    return {
        'setup_invoices': setup_invoices,
        'recurring_invoices': recurring_invoices,
        'total_fees_setup': setup_fees,
        'total_fees_recurring': recurring_fees,
    }
