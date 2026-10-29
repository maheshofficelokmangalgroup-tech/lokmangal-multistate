// Calculation rules for Lokmangal deposit and loan products.
//
// Every public figure (calculators, maturity examples on scheme pages, admin previews) comes from these
// functions, and each release records FINANCE_POLICY_VERSION so a published number can be traced back to
// the rule that produced it. Change a formula only together with a new policy version and updated fixtures
// in test/fixtures.json (see docs/decisions/0002-calculation-policy.md).

export const FINANCE_POLICY_VERSION = 'lmcs-fin-2026.1';

export type CalcMode = 'fd' | 'rd' | 'monthly' | 'emi';

export type CalcResult = {
  /** Headline figure: maturity value (fd, rd), monthly payout (monthly) or monthly instalment (emi). */
  result: number;
  /** Principal invested or borrowed. */
  b1: number;
  /** Interest earned (fd, rd), interest over the tenure (monthly) or total interest paid (emi). */
  b2: number;
};

function assertInputs(amount: number, ratePct: number, months: number) {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError(`Invalid amount: ${amount}`);
  if (!Number.isFinite(ratePct) || ratePct < 0) throw new RangeError(`Invalid rate: ${ratePct}`);
  if (!Number.isInteger(months) || months < 1) throw new RangeError(`Invalid tenure in months: ${months}`);
}

/**
 * Fixed deposit maturity.
 * Up to 12 months: simple interest. Beyond 12 months: compounded half-yearly, with part periods
 * compounded fractionally (months / 6). This reproduces the society's published maturity tables.
 */
export function fdMaturity(principal: number, ratePct: number, months: number): number {
  assertInputs(principal, ratePct, months);
  if (months <= 12) return principal * (1 + (ratePct * months) / 1200);
  return principal * Math.pow(1 + ratePct / 200, months / 6);
}

/**
 * Recurring deposit maturity: equal instalments at the start of each month, each compounded
 * half-yearly for the months it stays invested — Σ R·(1 + r/200)^(k/6), k = 1…n.
 * Reproduces the published Lakshadish maturity values.
 */
export function rdMaturity(instalment: number, ratePct: number, months: number): number {
  assertInputs(instalment, ratePct, months);
  let maturity = 0;
  for (let k = 1; k <= months; k++) maturity += instalment * Math.pow(1 + ratePct / 200, k / 6);
  return maturity;
}

/** Monthly interest payout on a deposit; the principal is returned at maturity. */
export function monthlyPayout(principal: number, ratePct: number): number {
  assertInputs(principal, ratePct, 1);
  return (principal * ratePct) / 1200;
}

/** Equated monthly instalment on a reducing balance; a 0% rate divides the principal evenly. */
export function emi(principal: number, ratePct: number, months: number): number {
  assertInputs(principal, ratePct, months);
  const r = ratePct / 1200;
  if (r === 0) return principal / months;
  const f = Math.pow(1 + r, months);
  return (principal * r * f) / (f - 1);
}

export function compute(mode: CalcMode, amount: number, ratePct: number, months: number): CalcResult {
  switch (mode) {
    case 'fd': {
      const maturity = fdMaturity(amount, ratePct, months);
      return { result: maturity, b1: amount, b2: maturity - amount };
    }
    case 'rd': {
      const maturity = rdMaturity(amount, ratePct, months);
      const invested = amount * months;
      return { result: maturity, b1: invested, b2: maturity - invested };
    }
    case 'monthly': {
      const payout = monthlyPayout(amount, ratePct);
      return { result: payout, b1: amount, b2: payout * months };
    }
    case 'emi': {
      const instalment = emi(amount, ratePct, months);
      return { result: instalment, b1: amount, b2: instalment * months - amount };
    }
  }
}

/** Published figures are whole rupees, rounded half up. */
export const roundRupees = (value: number) => Math.round(value);

/** 100344 → "₹1,00,344" (Indian digit grouping). */
export function formatINR(value: number): string {
  return '₹' + roundRupees(value).toLocaleString('en-IN');
}

/** 10 → "10", 9.5 → "9.50", 9.75 → "9.75". */
export const fmtRate = (rate: number) => (Number.isInteger(rate) ? String(rate) : rate.toFixed(2));
