// Loan products. Interest rates are placeholders resolved from the approved rate set.
// loansData('mr') is the Marathi version; the plain exports are English.

import { items, rate, resolve, singleton } from '../lib/content';
import type { Lang } from '../i18n';

export type Loan = {
  slug: string;
  name: string;
  icon: string;
  image: string;
  rate: string;
  rateFrom: number;
  amount: string;
  summary: string;
  details: [string, string][];
};

type LoanContent = Omit<Loan, 'rateFrom' | 'details'> & {
  rateKey: string;
  details: { label: string; value: string }[];
  showInForm: boolean;
  order: number;
};

function build(lang: Lang) {
  const content = items<LoanContent>('loan', lang);
  const loans: Loan[] = content.map(({ rateKey, details, showInForm: _s, order: _o, ...rest }) => ({
    ...resolve(rest, undefined, rest.slug),
    rateFrom: rate(rateKey),
    details: resolve(details, undefined, rest.slug).map((d) => [d.label, d.value] as [string, string]),
  }));

  const page = singleton<{ benefits: { icon: string; title: string; text: string }[]; extraFormTypes: string[] }>('loan_page', lang);
  // The form lists each loan in the page's language but sends the English name, which is what the office reads.
  const english = lang === 'en' ? content : items<LoanContent>('loan', 'en');
  const englishPage = lang === 'en' ? page : singleton<{ extraFormTypes: string[] }>('loan_page', 'en');
  const loanFormOptions = [
    ...content.filter((l) => l.showInForm).map((l) => ({ value: english.find((e) => e.slug === l.slug)?.name ?? l.name, label: l.name })),
    ...englishPage.extraFormTypes.map((value, i) => ({ value, label: page.extraFormTypes[i] ?? value })),
  ];
  return {
    loans,
    loanFormOptions,
    loanTypesForForm: [...english.filter((l) => l.showInForm).map((l) => l.name), ...englishPage.extraFormTypes],
    loanBenefits: page.benefits,
  };
}

const cache: Partial<Record<Lang, ReturnType<typeof build>>> = {};
export const loansData = (lang: Lang) => (cache[lang] ??= build(lang));

const en = loansData('en');
export const { loans, loanTypesForForm, loanBenefits } = en;
