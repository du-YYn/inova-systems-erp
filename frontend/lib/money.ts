import Decimal from 'decimal.js';

/**
 * Monetary helpers using decimal.js for arithmetic.
 *
 * Why: JavaScript `Number` is IEEE-754 binary; values like 0.1 + 0.2 yield
 * 0.30000000000000004, and large amounts (>R$1M) start to lose precision
 * around the cents. For display-only formatting `Number()` is fine, but any
 * subtraction/multiplication on monetary values should go through Decimal so
 * the cents are exact when the result is shown to the user or written back.
 */

export const Money = (value: string | number | null | undefined): Decimal => {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  try {
    return new Decimal(value);
  } catch {
    return new Decimal(0);
  }
};

export const moneySub = (a: string | number, b: string | number): number =>
  Money(a).minus(Money(b)).toNumber();

export const moneyMul = (a: string | number, b: string | number): number =>
  Money(a).times(Money(b)).toNumber();

export const moneyDiv = (a: string | number, b: string | number): number => {
  const denom = Money(b);
  if (denom.isZero()) return 0;
  return Money(a).div(denom).toNumber();
};

export const moneySplit = (
  total: string | number,
  pct: string | number,
): { primary: number; remainder: number } => {
  const totalD = Money(total);
  const pctD = Money(pct);
  const primary = totalD.times(pctD).div(100);
  return {
    primary: primary.toNumber(),
    remainder: totalD.minus(primary).toNumber(),
  };
};
