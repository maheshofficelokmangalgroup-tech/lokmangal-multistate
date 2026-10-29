// Loan products. Interest rates are placeholders resolved from the approved rate set.

import { items, rate, resolve, singleton } from '../lib/content';

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

const content = items<LoanContent>('loan');

export const loans: Loan[] = content.map(({ rateKey, details, showInForm: _s, order: _o, ...rest }) => ({
  ...resolve(rest, undefined, rest.slug),
  rateFrom: rate(rateKey),
  details: resolve(details, undefined, rest.slug).map((d) => [d.label, d.value] as [string, string]),
}));

const page = singleton<{ benefits: { icon: string; title: string; text: string }[]; extraFormTypes: string[] }>('loan_page');

export const loanTypesForForm = [...content.filter((l) => l.showInForm).map((l) => l.name), ...page.extraFormTypes];

export const loanBenefits = page.benefits;
