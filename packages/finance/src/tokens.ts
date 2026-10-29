// Rate placeholders in product text.
//
// Product copy never contains a typed rate. It refers to rate-set entries instead, and the figures are filled
// in when the site is built (and in admin previews), so text, tables and calculators always agree:
//
//   {rate:KEY}       9.5 → "9.50", 10 → "10"      (fmtRate)
//   {rate2:KEY}      always two decimals: "10.00"
//   {number:KEY}     a whole-number term, e.g. a doubling period in months
//   {calc}           the scheme's calculator result as rupees, e.g. "₹1,00,344"
//   {calc:interest}  interest part of the calculator result
//   {calc:invested}  principal part of the calculator result
//
// The backend validates the same grammar (backend/src/content/tokens.rs) before content can be submitted.

import { compute, fmtRate, formatINR, type CalcMode } from './index.ts';

export type RateEntries = Record<string, number>;
export type CalcConfig = { mode: CalcMode; amount: number; months: number; rate: number };
export type TokenContext = { rates: RateEntries; calc?: CalcConfig; where?: string };

export const TOKEN_PATTERN = /\{(rate|rate2|number|calc)(?::([A-Za-z0-9.+_-]+))?\}/g;

export class UnresolvedTokenError extends Error {}

function rateOf(ctx: TokenContext, key: string | undefined, token: string): number {
  if (!key) throw new UnresolvedTokenError(`${token} needs a rate key${ctx.where ? ` (in ${ctx.where})` : ''}`);
  const value = ctx.rates[key];
  if (value === undefined) throw new UnresolvedTokenError(`Unknown rate key "${key}" in ${token}${ctx.where ? ` (in ${ctx.where})` : ''}`);
  return value;
}

export function resolveTokens(text: string, ctx: TokenContext): string {
  return text.replace(TOKEN_PATTERN, (token, kind: string, arg: string | undefined) => {
    switch (kind) {
      case 'rate':
        return fmtRate(rateOf(ctx, arg, token));
      case 'rate2':
        return rateOf(ctx, arg, token).toFixed(2);
      case 'number':
        return String(Math.round(rateOf(ctx, arg, token)));
      case 'calc': {
        if (!ctx.calc) throw new UnresolvedTokenError(`${token} used without a calculator configuration${ctx.where ? ` (in ${ctx.where})` : ''}`);
        const { mode, amount, rate, months } = ctx.calc;
        const r = compute(mode, amount, rate, months);
        if (arg === undefined) return formatINR(r.result);
        if (arg === 'interest') return formatINR(r.b2);
        if (arg === 'invested') return formatINR(r.b1);
        throw new UnresolvedTokenError(`Unknown calculator figure "${arg}"`);
      }
    }
    return token;
  });
}

/** Resolves tokens in every string inside a JSON-like value. */
export function resolveDeep<T>(value: T, ctx: TokenContext): T {
  if (typeof value === 'string') return resolveTokens(value, ctx) as T;
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, ctx)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveDeep(v, ctx)])) as T;
  }
  return value;
}

/** Rate keys referenced anywhere inside a value — used to validate content before review. */
export function referencedKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    for (const m of value.matchAll(TOKEN_PATTERN)) if (m[1] !== 'calc' && m[2]) into.add(m[2]);
  } else if (Array.isArray(value)) value.forEach((v) => referencedKeys(v, into));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => referencedKeys(v, into));
  return into;
}
