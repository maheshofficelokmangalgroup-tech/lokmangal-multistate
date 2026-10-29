// Deposit schemes and FD rates. Scheme text comes from the snapshot with rate placeholders; every rate is
// filled in from the approved rate set, so tables, pages and calculators always show the same figure.
// depositsData('mr') is the Marathi version of the same schemes; the plain exports are English.

import { fmtRate } from '@lokmangal/finance';
import { items, rate, resolve, singleton, snapshot } from '../lib/content';
import type { Lang } from '../i18n';

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

const slabLabel = (min: number, max: number | null | undefined, lang: Lang) =>
  lang === 'mr'
    ? max == null ? `${min} दिवस व त्याहून अधिक` : `${min} – ${max} दिवस`
    : max == null ? `${min} days & above` : `${min} – ${max} days`;

function build(lang: Lang) {
  const schemes: Scheme[] = items<SchemeContent>('deposit_scheme', lang).map(({ rateKey, calc, order: _order, ...content }) => ({
    ...resolve(content, calc, content.slug),
    rate: rateKey ? rate(rateKey) : null,
    calc: { mode: calc.mode, amount: calc.amount, months: calc.months, rate: rate(calc.rateKey) },
  }));

  const fdSlabs = (() => {
    const rows = new Map<string, { tenure: string; min: number; max: number | null; regular: number; special: number }>();
    for (const e of snapshot.rateSet.entries.filter((x) => x.section === 'fd_slab')) {
      const tenure = slabLabel(e.minDays!, e.maxDays, lang);
      const row = rows.get(tenure) ?? { tenure, min: e.minDays!, max: e.maxDays ?? null, regular: NaN, special: NaN };
      row[e.category === 'special' ? 'special' : 'regular'] = Number(e.value);
      rows.set(tenure, row);
    }
    return [...rows.values()];
  })();

  const page = singleton<{ specialCategories: string; documents: string[]; benefits: { icon: string; title: string; text: string }[] }>('deposit_page', lang);
  return {
    schemes,
    fdSlabs,
    specialCategories: page.specialCategories,
    depositDocuments: page.documents,
    depositBenefits: page.benefits,
    schemeBySlug: (slug: string) => schemes.find((s) => s.slug === slug),
  };
}

const cache: Partial<Record<Lang, ReturnType<typeof build>>> = {};
export const depositsData = (lang: Lang) => (cache[lang] ??= build(lang));

const en = depositsData('en');
export const { schemes, fdSlabs, specialCategories, depositDocuments, depositBenefits, schemeBySlug } = en;

export { fmtRate };
