"""Helpers puros de cálculo de cobrança por gateway de pagamento.

Todas as funções recebem Decimals/ints e retornam um dict estruturado com:
- `client_pays`: valor total cobrado do cliente (soma das parcelas)
- `client_installment_value`: valor de cada parcela cobrada do cliente
- `company_receives_total`: total líquido que a empresa recebe
- `company_schedule`: lista de eventos `[{sequence, days_ahead, amount}, ...]`
- `details`: metadados para auditoria (taxa aplicada, tipo, etc)

Fórmulas seguem o modelo do Asaas (abr/2026), com tolerância para variações
de arredondamento inerentes aos simuladores reais.
"""
from decimal import Decimal, ROUND_HALF_UP

# Constantes
_CENT = Decimal('0.01')
_DAYS_CARD_RECEIVABLE = 32  # Asaas libera cada parcela após ~32 dias
_DAYS_BOLETO_MONTHLY = 30


def _q(value) -> Decimal:
    """Quantiza para 2 casas decimais (R$)."""
    return Decimal(value).quantize(_CENT, rounding=ROUND_HALF_UP)


def calculate_card(
    gross: Decimal,
    installments: int,
    fee_pct: Decimal,
    fee_fixed: Decimal,
    anticipation_monthly_pct: Decimal = Decimal('0'),
    anticipate: bool = False,
    repass_fee: bool = False,
) -> dict:
    """Calcula cobrança em cartão de crédito.

    Fórmulas (modelo Asaas):
    - Cada parcela sofre taxa % + taxa fixa (por parcela).
    - Repasse: gross-up por parcela = desired_net / (1 - pct) + fee_fixed.
    - Antecipação: desconto por parcela = net × anticipation_pct × i
      (i = número da parcela, 1..N — primeiras parcelas sofrem menos desconto).

    Args:
        gross: valor total desejado (R$).
        installments: número de parcelas (1-12 usualmente).
        fee_pct: taxa % por parcela (ex: Decimal('3.99')).
        fee_fixed: taxa fixa em R$ por parcela (ex: Decimal('0.49')).
        anticipation_monthly_pct: taxa mensal de antecipação (ex: Decimal('1.70')).
        anticipate: se True, empresa recebe tudo à vista com desconto.
        repass_fee: se True, cliente paga a mais para empresa receber o bruto desejado.
    """
    gross = Decimal(gross)
    if gross <= 0 or installments < 1:
        raise ValueError('gross > 0 e installments >= 1')

    fee_pct_dec = Decimal(fee_pct) / Decimal('100')
    fee_fixed = Decimal(fee_fixed)
    antic_pct_dec = Decimal(anticipation_monthly_pct) / Decimal('100')

    # fee_pct >= 100% causa divisao por zero no gross-up (repass_fee=True) ou
    # valores negativos/absurdos (fee_pct > 100). Validacao defensiva.
    if fee_pct_dec >= Decimal('1'):
        raise ValueError(
            f'fee_pct deve ser < 100% (recebido {fee_pct}%)'
        )

    if repass_fee:
        # Gross-up por parcela: cliente paga a mais para a empresa receber o bruto
        net_target_per_installment = gross / installments
        # client_installment × (1 - fee_pct) - fee_fixed = net_target
        # → client_installment = (net_target + fee_fixed) / (1 - fee_pct)
        client_installment = (net_target_per_installment + fee_fixed) / (Decimal('1') - fee_pct_dec)
        net_per_installment = net_target_per_installment
    else:
        client_installment = gross / installments
        # Empresa recebe parcela com taxa % + fixa descontadas
        net_per_installment = client_installment * (Decimal('1') - fee_pct_dec) - fee_fixed

    client_installment = _q(client_installment)
    net_per_installment = _q(net_per_installment)
    client_pays_total = _q(client_installment * installments)
    company_total_no_anticipation = _q(net_per_installment * installments)

    schedule = []
    if anticipate:
        # Desconto de antecipação: cada parcela i sofre desconto antic_pct × i
        total_discount = Decimal('0')
        net_after_anticipation_total = Decimal('0')
        for i in range(1, installments + 1):
            discount_i = net_per_installment * antic_pct_dec * Decimal(i)
            net_received_i = net_per_installment - discount_i
            total_discount += discount_i
            net_after_anticipation_total += net_received_i
        company_receives = _q(net_after_anticipation_total)
        total_discount_q = _q(total_discount)
        # Recebimento único em D+2 úteis (simplificado: 2 dias)
        schedule.append({
            'sequence': 1,
            'days_ahead': 2,
            'amount': company_receives,
            'label': f'Antecipação de {installments} parcelas',
        })
    else:
        company_receives = company_total_no_anticipation
        total_discount_q = Decimal('0')
        for i in range(1, installments + 1):
            schedule.append({
                'sequence': i,
                'days_ahead': _DAYS_CARD_RECEIVABLE * i,
                'amount': net_per_installment,
                'label': f'Parcela {i}/{installments}',
            })

    return {
        'method': 'credit_card',
        'client_pays': client_pays_total,
        'client_installment_value': client_installment,
        'company_receives_total': company_receives,
        'company_schedule': schedule,
        'details': {
            'gross': _q(gross),
            'installments': installments,
            'fee_pct': Decimal(fee_pct),
            'fee_fixed': fee_fixed,
            'anticipation_monthly_pct': Decimal(anticipation_monthly_pct),
            'anticipate': anticipate,
            'repass_fee': repass_fee,
            'net_per_installment': net_per_installment,
            'company_total_no_anticipation': company_total_no_anticipation,
            'anticipation_discount': total_discount_q,
        },
    }


def calculate_boleto(
    gross: Decimal,
    installments: int,
    fee_fixed: Decimal = Decimal('0'),
) -> dict:
    """Calcula cobrança em boleto parcelado.

    Divisão simples `gross / installments`. Sem taxa % — apenas eventual
    taxa fixa por emissão (`fee_fixed`), configurável por provider.
    """
    gross = Decimal(gross)
    fee_fixed = Decimal(fee_fixed)
    if gross <= 0 or installments < 1:
        raise ValueError('gross > 0 e installments >= 1')

    installment_value = _q(gross / installments)
    # Ajuste de arredondamento: última parcela absorve o resto
    total_so_far = installment_value * (installments - 1)
    last_installment = _q(gross - total_so_far)

    net_per_installment = _q(installment_value - fee_fixed)
    net_last = _q(last_installment - fee_fixed)

    schedule = []
    for i in range(1, installments + 1):
        amount = net_last if i == installments else net_per_installment
        schedule.append({
            'sequence': i,
            'days_ahead': _DAYS_BOLETO_MONTHLY * i,
            'amount': amount,
            'label': f'Boleto {i}/{installments}',
        })

    # Total que a empresa recebe (net)
    company_total = _q(
        net_per_installment * (installments - 1) + net_last
    )

    return {
        'method': 'boleto',
        'client_pays': gross,
        'client_installment_value': installment_value,
        'company_receives_total': company_total,
        'company_schedule': schedule,
        'details': {
            'gross': gross,
            'installments': installments,
            'fee_fixed': fee_fixed,
            'net_per_installment': net_per_installment,
        },
    }


def calculate_pix(
    gross: Decimal,
    fee_fixed: Decimal = Decimal('0'),
) -> dict:
    """Calcula cobrança em PIX à vista (pagamento único)."""
    gross = Decimal(gross)
    fee_fixed = Decimal(fee_fixed)
    if gross <= 0:
        raise ValueError('gross > 0')

    net = _q(gross - fee_fixed)
    return {
        'method': 'pix',
        'client_pays': gross,
        'client_installment_value': gross,
        'company_receives_total': net,
        'company_schedule': [{
            'sequence': 1,
            'days_ahead': 0,
            'amount': net,
            'label': 'PIX à vista',
        }],
        'details': {
            'gross': gross,
            'fee_fixed': fee_fixed,
            'net': net,
        },
    }


def calculate_recurring(
    monthly_value: Decimal,
    duration_months: int,
    fee_pct: Decimal = Decimal('0'),
    fee_fixed: Decimal = Decimal('0'),
) -> dict:
    """Projeção de recorrência mensal (mensalidade de contrato).

    Usado para gerar as N faturas mensais que alimentam o MRR. Taxa é
    aplicada por parcela (método escolhido no contrato); para boleto/PIX
    sem taxa, `fee_pct=0` e `fee_fixed=0`.
    """
    monthly_value = Decimal(monthly_value)
    fee_pct_dec = Decimal(fee_pct) / Decimal('100')
    fee_fixed = Decimal(fee_fixed)
    if monthly_value <= 0 or duration_months < 1:
        raise ValueError('monthly_value > 0 e duration_months >= 1')

    net_per_month = _q(monthly_value * (Decimal('1') - fee_pct_dec) - fee_fixed)
    schedule = []
    for i in range(1, duration_months + 1):
        schedule.append({
            'sequence': i,
            'days_ahead': _DAYS_BOLETO_MONTHLY * i,
            'amount': net_per_month,
            'label': f'Mensalidade {i}/{duration_months}',
        })
    return {
        'method': 'recurring',
        'client_pays': _q(monthly_value * duration_months),
        'client_installment_value': monthly_value,
        'company_receives_total': _q(net_per_month * duration_months),
        'company_schedule': schedule,
        'details': {
            'monthly_value': monthly_value,
            'duration_months': duration_months,
            'net_per_month': net_per_month,
            'fee_pct': Decimal(fee_pct),
            'fee_fixed': fee_fixed,
        },
    }
