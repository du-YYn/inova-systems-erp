"""Testes dos helpers de cálculo de cobrança.

Reproduz os 6 cenários validados pelo usuário (simulador Asaas, abr/2026).
Tolerância ampla (~R$ 5-15) pois o simulador real do Asaas usa fórmulas
internas com arredondamentos que não são públicas. A estrutura dos valores
e a ordem de grandeza importam mais que centavos exatos.
"""
from decimal import Decimal

import pytest

from finance.pricing import (
    calculate_card, calculate_boleto, calculate_pix, calculate_recurring,
)


# Taxas vigentes do Asaas (abr/2026) — idênticas ao seed da migration 0011
ASAAS_CARD_PCT = Decimal('3.99')
ASAAS_CARD_FIXED = Decimal('0.49')
ASAAS_CARD_ANTIC = Decimal('1.70')


def _approx(actual, expected, tol=Decimal('15.00')):
    """Verifica que |actual - expected| <= tolerance (em R$)."""
    diff = abs(Decimal(actual) - Decimal(expected))
    assert diff <= tol, (
        f'Valor fora da tolerância: actual={actual}, expected={expected}, '
        f'diff={diff}, tol={tol}'
    )


# ─── Cenário 1: PIX à vista ──────────────────────────────────────────────────

def test_pix_simple():
    r = calculate_pix(Decimal('10000.00'))
    assert r['method'] == 'pix'
    assert r['client_pays'] == Decimal('10000.00')
    assert r['company_receives_total'] == Decimal('10000.00')
    assert len(r['company_schedule']) == 1
    assert r['company_schedule'][0]['days_ahead'] == 0


def test_pix_with_fixed_fee():
    r = calculate_pix(Decimal('10000.00'), fee_fixed=Decimal('2.00'))
    assert r['company_receives_total'] == Decimal('9998.00')


# ─── Cenário 2: Cartão 12x sem antecipação sem repasse ─────────────────────

def test_card_12x_no_anticipation_no_repass():
    """Valores do print 1 do Asaas:
    - 12 parcelas de R$ 833,33 (cliente paga R$ 10.000)
    - Empresa recebe ~R$ 9.600 em 12 meses (~R$ 800/parcela)
    """
    r = calculate_card(
        gross=Decimal('10000.00'), installments=12,
        fee_pct=ASAAS_CARD_PCT, fee_fixed=ASAAS_CARD_FIXED,
        anticipation_monthly_pct=ASAAS_CARD_ANTIC,
        anticipate=False, repass_fee=False,
    )
    assert r['method'] == 'credit_card'
    assert r['client_pays'] == Decimal('10000.00') or abs(r['client_pays'] - Decimal('10000.00')) <= Decimal('0.05')
    _approx(r['client_installment_value'], Decimal('833.33'), tol=Decimal('0.10'))
    # Asaas mostra ~R$ 9.600,63 total; aceita range 9580-9610
    _approx(r['company_receives_total'], Decimal('9600'), tol=Decimal('20'))
    # Por parcela deve ficar próximo de R$ 800
    _approx(
        r['details']['net_per_installment'], Decimal('800'),
        tol=Decimal('2'),
    )
    assert len(r['company_schedule']) == 12


# ─── Cenário 3: Cartão 12x COM antecipação, sem repasse ────────────────────

def test_card_12x_with_anticipation_no_repass():
    """Print 1 Asaas com antecipação: empresa recebe ~R$ 8.466 à vista."""
    r = calculate_card(
        gross=Decimal('10000.00'), installments=12,
        fee_pct=ASAAS_CARD_PCT, fee_fixed=ASAAS_CARD_FIXED,
        anticipation_monthly_pct=ASAAS_CARD_ANTIC,
        anticipate=True, repass_fee=False,
    )
    _approx(r['company_receives_total'], Decimal('8466'), tol=Decimal('100'))
    # Recebimento único em ~2 dias úteis
    assert len(r['company_schedule']) == 1
    assert r['company_schedule'][0]['days_ahead'] <= 3
    # Desconto de antecipação deve estar registrado
    assert r['details']['anticipation_discount'] > Decimal('1000')


# ─── Cenário 4: Cartão 12x SEM antecipação, COM repasse ────────────────────

def test_card_12x_no_anticipation_with_repass():
    """Print 2 Asaas: cliente paga ~R$ 10.416,04 (12× R$ 868,00),
    empresa recebe ~R$ 10.000 líquido em 12 meses."""
    r = calculate_card(
        gross=Decimal('10000.00'), installments=12,
        fee_pct=ASAAS_CARD_PCT, fee_fixed=ASAAS_CARD_FIXED,
        anticipation_monthly_pct=ASAAS_CARD_ANTIC,
        anticipate=False, repass_fee=True,
    )
    # Cliente paga mais que o bruto (taxa foi embutida)
    assert r['client_pays'] > Decimal('10000.00')
    _approx(r['client_pays'], Decimal('10416'), tol=Decimal('15'))
    _approx(r['client_installment_value'], Decimal('868'), tol=Decimal('2'))
    # Empresa recebe o bruto original (o que ela queria)
    _approx(r['company_receives_total'], Decimal('10000'), tol=Decimal('5'))


# ─── Cenário 5: Cartão 12x COM antecipação + COM repasse ───────────────────

def test_card_12x_with_anticipation_and_repass():
    """Print 2 Asaas com antecipação: empresa recebe ~R$ 8.818,42 à vista."""
    r = calculate_card(
        gross=Decimal('10000.00'), installments=12,
        fee_pct=ASAAS_CARD_PCT, fee_fixed=ASAAS_CARD_FIXED,
        anticipation_monthly_pct=ASAAS_CARD_ANTIC,
        anticipate=True, repass_fee=True,
    )
    _approx(r['company_receives_total'], Decimal('8818'), tol=Decimal('100'))
    assert len(r['company_schedule']) == 1


# ─── Cenário 6: Boleto parcelado (sem taxa) ────────────────────────────────

def test_boleto_12x_no_fee():
    """Divisão simples: R$ 10.000 / 12 = R$ 833,33/parcela.
    Asaas confirmou: boleto sem taxa no modelo atual."""
    r = calculate_boleto(gross=Decimal('10000.00'), installments=12)
    assert r['method'] == 'boleto'
    assert r['client_pays'] == Decimal('10000.00')
    _approx(r['client_installment_value'], Decimal('833.33'), tol=Decimal('0.10'))
    assert r['company_receives_total'] == Decimal('10000.00')
    assert len(r['company_schedule']) == 12
    # Vencimentos mensais
    assert r['company_schedule'][0]['days_ahead'] == 30
    assert r['company_schedule'][11]['days_ahead'] == 360


def test_boleto_with_fixed_fee():
    """Provider com taxa fixa por boleto (ex: outro banco cobra R$ 3,50)."""
    r = calculate_boleto(
        gross=Decimal('10000.00'), installments=12,
        fee_fixed=Decimal('3.50'),
    )
    # Cliente paga igual (R$ 10.000), empresa recebe um pouco menos
    assert r['client_pays'] == Decimal('10000.00')
    # Total líquido = 10000 - 12 × 3.50 = 9958.00
    _approx(r['company_receives_total'], Decimal('9958'), tol=Decimal('0.50'))


def test_boleto_single_installment():
    """Boleto à vista (1 parcela)."""
    r = calculate_boleto(gross=Decimal('5000.00'), installments=1)
    assert r['company_receives_total'] == Decimal('5000.00')
    assert len(r['company_schedule']) == 1


# ─── Mensalidade recorrente (usado para contrato ativo) ────────────────────

def test_recurring_12_months_no_fee():
    """Mensalidade R$ 800 × 12 sem taxa (boleto/PIX)."""
    r = calculate_recurring(
        monthly_value=Decimal('800.00'),
        duration_months=12,
    )
    assert r['method'] == 'recurring'
    assert r['client_pays'] == Decimal('9600.00')
    assert r['company_receives_total'] == Decimal('9600.00')
    assert len(r['company_schedule']) == 12


def test_recurring_with_card_fees():
    """Mensalidade em cartão com taxa % por cobrança."""
    r = calculate_recurring(
        monthly_value=Decimal('800.00'),
        duration_months=12,
        fee_pct=ASAAS_CARD_PCT,
        fee_fixed=ASAAS_CARD_FIXED,
    )
    # Net por mês ≈ 800 × 0.9601 - 0.49 ≈ 767.59
    _approx(
        r['details']['net_per_month'], Decimal('767.59'),
        tol=Decimal('0.10'),
    )


# ─── Validação de inputs ───────────────────────────────────────────────────

def test_invalid_gross_raises():
    with pytest.raises(ValueError):
        calculate_card(Decimal('0'), 1, Decimal('3.99'), Decimal('0.49'))
    with pytest.raises(ValueError):
        calculate_boleto(Decimal('-100'), 1)
    with pytest.raises(ValueError):
        calculate_pix(Decimal('0'))


def test_invalid_installments_raises():
    with pytest.raises(ValueError):
        calculate_card(Decimal('1000'), 0, Decimal('3.99'), Decimal('0.49'))
    with pytest.raises(ValueError):
        calculate_boleto(Decimal('1000'), 0)
    with pytest.raises(ValueError):
        calculate_recurring(Decimal('100'), 0)
