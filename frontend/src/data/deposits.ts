// Deposit schemes and FD rates. Scheme text comes from the snapshot with rate placeholders; every rate is
// filled in from the approved rate set, so tables, pages and calculators always show the same figure.

import { fmtRate } from '@lokmangal/finance';
import { items, rate, resolve, singleton, snapshot } from '../lib/content';

export type SchemeKind = 'fd' | 'rd' | 'monthly' | 'double';

export type Scheme = {
  slug: string;
  name: string;
  nameMr: string;
  kind: SchemeKind;
  rate: number | null;
  rateNote: string;
  pitch: string;
  intro: string;
  facts: { label: string; value: string }[];
  highlight: { label: string; value: string }[];
  features: string[];
  eligibility: string;
  image: string;
  calc: { mode: 'fd' | 'rd' | 'monthly'; amount: number; months: number; rate: number };
  featured?: boolean;
};

type SchemeContent = Omit<Scheme, 'rate' | 'calc'> & {
  rateKey: string | null;
  calc: { mode: 'fd' | 'rd' | 'monthly'; amount: number; months: number; rateKey: string };
  order: number;
};

export const kindLabels: Record<SchemeKind, string> = {
  fd: 'Fixed Deposit',
  rd: 'Recurring Deposit',
  monthly: 'Monthly Income',
  double: 'Doubling Scheme',
};

export const schemes: Scheme[] = items<SchemeContent>('deposit_scheme').map(({ rateKey, calc, order: _order, ...content }) => ({
  ...resolve(content, calc, content.slug),
  rate: rateKey ? rate(rateKey) : null,
  calc: { mode: calc.mode, amount: calc.amount, months: calc.months, rate: rate(calc.rateKey) },
}));

const slabLabel = (min: number, max: number | null | undefined) => (max == null ? `${min} days & above` : `${min} – ${max} days`);
export const fdSlabs = (() => {
  const rows = new Map<string, { tenure: string; regular: number; special: number }>();
  for (const e of snapshot.rateSet.entries.filter((x) => x.section === 'fd_slab')) {
    const tenure = slabLabel(e.minDays!, e.maxDays);
    const row = rows.get(tenure) ?? { tenure, regular: NaN, special: NaN };
    row[e.category === 'special' ? 'special' : 'regular'] = Number(e.value);
    rows.set(tenure, row);
  }
  return [...rows.values()];
})();

const page = singleton<{ specialCategories: string; documents: string[]; benefits: { icon: string; title: string; text: string }[] }>('deposit_page');
export const specialCategories = page.specialCategories;
export const depositDocuments = page.documents;
export const depositBenefits = page.benefits;

export const schemeBySlug = (slug: string) => schemes.find((s) => s.slug === slug);

export { fmtRate };
