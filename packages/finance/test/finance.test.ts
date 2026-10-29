import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compute, emi, FINANCE_POLICY_VERSION, fmtRate, formatINR, roundRupees, type CalcMode } from '../src/index.ts';
import { referencedKeys, resolveDeep, resolveTokens, UnresolvedTokenError } from '../src/tokens.ts';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8')) as {
  policy: string;
  cases: { name: string; mode: CalcMode; amount: number; rate: number; months: number; result: number; b2?: number }[];
};

test('fixtures belong to the current policy version', () => {
  assert.equal(fixtures.policy, FINANCE_POLICY_VERSION);
});

for (const c of fixtures.cases) {
  test(`fixture: ${c.name}`, () => {
    const r = compute(c.mode, c.amount, c.rate, c.months);
    assert.equal(roundRupees(r.result), c.result);
    if (c.b2 !== undefined) assert.equal(roundRupees(r.b2), c.b2);
  });
}

test('invalid inputs are rejected', () => {
  assert.throws(() => compute('fd', -1, 10, 12), RangeError);
  assert.throws(() => compute('rd', 1000, Number.NaN, 12), RangeError);
  assert.throws(() => compute('emi', 1000, 10, 0), RangeError);
  assert.throws(() => emi(1000, Infinity, 12), RangeError);
});

test('rupee and rate formatting', () => {
  assert.equal(formatINR(100344.4), '₹1,00,344');
  assert.equal(formatINR(1234567.5), '₹12,34,568');
  assert.equal(fmtRate(10), '10');
  assert.equal(fmtRate(9.5), '9.50');
  assert.equal(fmtRate(9.25), '9.25');
});

const rates = { 'rd.lakshadish': 9.25, 'fd.365+.regular': 10, 'duppat.general.months': 88 };

test('tokens resolve rates, terms and calculator figures', () => {
  const ctx = { rates, calc: { mode: 'rd' as const, amount: 3800, months: 24, rate: 9.25 } };
  assert.equal(resolveTokens('{rate2:rd.lakshadish}% p.a.', ctx), '9.25% p.a.');
  assert.equal(resolveTokens('Up to {rate:fd.365+.regular}%', ctx), 'Up to 10%');
  assert.equal(resolveTokens('{rate2:fd.365+.regular}%', ctx), '10.00%');
  assert.equal(resolveTokens('Doubles in {number:duppat.general.months} months', ctx), 'Doubles in 88 months');
  assert.equal(resolveTokens('Maturity {calc}', ctx), 'Maturity ₹1,00,344');
  assert.equal(resolveTokens('Invested {calc:invested}', ctx), 'Invested ₹91,200');
  assert.equal(resolveTokens('No tokens here {not-a-token}', ctx), 'No tokens here {not-a-token}');
});

test('unknown keys fail instead of publishing a wrong figure', () => {
  assert.throws(() => resolveTokens('{rate:missing.key}', { rates }), UnresolvedTokenError);
  assert.throws(() => resolveTokens('{calc}', { rates }), UnresolvedTokenError);
});

test('resolveDeep and referencedKeys walk nested content', () => {
  const content = { facts: [{ label: 'Rate', value: '{rate2:rd.lakshadish}%' }], note: 'Top {rate:fd.365+.regular}%' };
  assert.deepEqual(resolveDeep(content, { rates }), { facts: [{ label: 'Rate', value: '9.25%' }], note: 'Top 10%' });
  assert.deepEqual([...referencedKeys(content)].sort(), ['fd.365+.regular', 'rd.lakshadish']);
});
