// Deposit schemes, valid 1 April 2026 – 31 March 2027 (from the society's 2026 scheme leaflets).
// The page URLs keep the same slugs as the old website.

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

export const kindLabels: Record<SchemeKind, string> = {
  fd: 'Fixed Deposit',
  rd: 'Recurring Deposit',
  monthly: 'Monthly Income',
  double: 'Doubling Scheme',
};

const fdFeatures = ['Attractive interest rates', 'Flexible tenure', 'Ease and convenience', 'Stable, assured returns', 'Safety and liquidity', 'Nomination facility'];
const rdFeatures = ['Easy monthly instalments', 'Attractive interest rates', 'Build a significant corpus', 'Guaranteed maturity value', 'Convenient to operate', 'Safety and liquidity'];

const lakshadish = (n: number, monthly: number, months: number, maturity: string, featured = false): Scheme => ({
  slug: `lakshadish-deposit-scheme-${n}`,
  name: `Lakshadish (RD) Deposit Scheme ${n}`,
  nameMr: 'लक्षदिश (रिकरिंग) ठेव योजना',
  kind: 'rd',
  rate: 9.25,
  rateNote: 'p.a.',
  pitch: `Save ₹${monthly.toLocaleString('en-IN')} a month and become a lakhpati in ${months} months.`,
  intro:
    'Lakshadish — also known as the Lakhpati Thev Yojana — turns a small, fixed monthly saving into a guaranteed lump sum of over one lakh rupees. Pick the instalment that suits your budget, deposit it every month, and collect your maturity amount at the end of the term.',
  facts: [
    { label: 'Scheme type', value: 'Recurring Deposit' },
    { label: 'Interest rate', value: '9.25% p.a.' },
    { label: 'Monthly instalment', value: `₹${monthly.toLocaleString('en-IN')}` },
    { label: 'Tenure', value: `${months} months` },
    { label: 'Maturity amount', value: maturity },
    { label: 'TDS', value: 'Applicable on interest, except for society members' },
  ],
  highlight: [
    { label: 'Monthly', value: `₹${monthly.toLocaleString('en-IN')}` },
    { label: 'Tenure', value: `${months} mo` },
    { label: 'Maturity', value: maturity },
  ],
  features: rdFeatures,
  eligibility:
    'Individuals (single or joint), minors through a parent or guardian, HUFs, associations, societies, institutions, trusts and clubs can all invest in Lakshadish.',
  image: '/images/schemes/creative-rd.webp',
  calc: { mode: 'rd', amount: monthly, months, rate: 9.25 },
  featured,
});

export const schemes: Scheme[] = [
  {
    slug: 'vishwamangal-fixed-deposit-scheme',
    name: 'Vishwamangal Fixed Deposit',
    nameMr: 'विश्वमंगल मुदत ठेव योजना',
    kind: 'fd',
    rate: 10,
    rateNote: 'p.a. for 365 days & above',
    pitch: 'Lock in up to 10% p.a. with tenures from just 7 days.',
    intro:
      'Grow idle savings with complete peace of mind. Vishwamangal Fixed Deposit offers some of the most attractive rates in the co-operative sector, with tenures from 7 days upward — ideal for goals like a child’s education, a new home or a wedding in the family.',
    facts: [
      { label: 'Scheme type', value: 'Fixed Deposit' },
      { label: '7 – 30 days', value: '3.50% p.a.' },
      { label: '31 – 90 days', value: '5.00% p.a.' },
      { label: '91 – 180 days', value: '7.00% p.a.' },
      { label: '181 – 364 days', value: '8.00% p.a.' },
      { label: '365 days & above', value: '10.00% p.a.' },
      { label: 'TDS', value: 'Applicable on interest, except for society members' },
    ],
    highlight: [
      { label: 'Tenure', value: '7 days +' },
      { label: 'Top rate', value: '10%' },
      { label: 'Special rate', value: '+0.50%' },
    ],
    features: fdFeatures,
    eligibility:
      'Any resident Indian individual or entity can open a Fixed Deposit — including senior citizens and Hindu Undivided Families (HUFs).',
    image: '/images/schemes/creative-fd.webp',
    calc: { mode: 'fd', amount: 100000, months: 12, rate: 10 },
    featured: true,
  },
  {
    slug: 'vishvamangal-monthly-interest',
    name: 'Vishwamangal Monthly Interest',
    nameMr: 'विश्वमंगल मासिक ठेव योजना',
    kind: 'monthly',
    rate: 9.75,
    rateNote: 'p.a., paid monthly',
    pitch: 'A steady monthly income from your savings — 9.75% for every depositor.',
    intro:
      'Deposit a lump sum once and receive interest in your account every month. Vishwamangal Monthly Interest is designed for retirees, homemakers and anyone who wants a dependable monthly income without touching the principal.',
    facts: [
      { label: 'Scheme type', value: 'Monthly Interest Scheme' },
      { label: 'Interest rate', value: '9.75% p.a. for all depositors' },
      { label: 'Tenure', value: '12 months & above' },
      { label: 'Example', value: '₹1,00,000 earns about ₹813 every month' },
      { label: 'TDS', value: 'Applicable on interest, except for society members' },
    ],
    highlight: [
      { label: 'Deposit', value: '₹1,00,000' },
      { label: 'Monthly', value: '₹813' },
      { label: 'Tenure', value: '12 mo +' },
    ],
    features: fdFeatures,
    eligibility: 'Any resident Indian individual or entity, including senior citizens and HUFs, can invest.',
    image: '/images/schemes/creative-monthly.webp',
    calc: { mode: 'monthly', amount: 100000, months: 12, rate: 9.75 },
    featured: true,
  },
  {
    slug: 'vishvamangal-recurring-deposit',
    name: 'Vishwamangal Recurring Deposit',
    nameMr: 'विश्वमंगल रिकरिंग ठेव योजना',
    kind: 'rd',
    rate: 9.5,
    rateNote: 'p.a.',
    pitch: 'Start saving from just ₹100 a month at 9.50% p.a.',
    intro:
      'Build the saving habit one month at a time. Choose any tenure between 12 and 60 months, start with as little as ₹100 a month, and watch your money grow at 9.50% p.a.',
    facts: [
      { label: 'Scheme type', value: 'Recurring Deposit' },
      { label: 'Interest rate', value: '9.50% p.a.' },
      { label: 'Tenure', value: '12 months to 60 months' },
      { label: 'Minimum instalment', value: '₹100 per month' },
      { label: 'TDS', value: 'Applicable on interest, except for society members' },
    ],
    highlight: [
      { label: 'From', value: '₹100/mo' },
      { label: 'Tenure', value: '12–60 mo' },
      { label: 'Rate', value: '9.50%' },
    ],
    features: rdFeatures,
    eligibility: 'Any resident Indian individual or entity can open a Recurring Deposit, including minors through a guardian.',
    image: '/images/schemes/creative-recurring.webp',
    calc: { mode: 'rd', amount: 2000, months: 36, rate: 9.5 },
    featured: true,
  },
  lakshadish(1, 3800, 24, '₹1,00,344', true),
  lakshadish(2, 2450, 36, '₹1,01,705'),
  lakshadish(3, 1750, 48, '₹1,01,583'),
  lakshadish(4, 1350, 60, '₹1,02,799', true),
  {
    slug: 'daam-duppat-yojna',
    name: 'Daam Duppat Yojna',
    nameMr: 'दाम दुप्पट ठेव योजना',
    kind: 'double',
    rate: null,
    rateNote: 'Money doubles',
    pitch: 'Double your money in 88 months — or 86 months for special categories.',
    intro:
      'A simple promise: deposit once and get twice the amount back at maturity. Daam Duppat doubles your deposit in 88 months, and even sooner — 86 months — for senior citizens, persons with disabilities, ex-servicemen, single parents and widows aged 50 and above.',
    facts: [
      { label: 'Scheme type', value: 'Doubling Deposit' },
      { label: 'General depositors', value: 'Doubles in 88 months' },
      { label: 'Special categories', value: 'Doubles in 86 months' },
      { label: 'Minimum deposit', value: '₹100 and above' },
      { label: 'Example', value: '₹1,00,000 becomes ₹2,00,000' },
      { label: 'TDS', value: 'Applicable on interest, except for society members' },
    ],
    highlight: [
      { label: 'Deposit', value: '₹1,00,000' },
      { label: 'Maturity', value: '₹2,00,000' },
      { label: 'Tenure', value: '86–88 mo' },
    ],
    features: rdFeatures.map((f) => (f === 'Easy monthly instalments' ? 'One-time deposit' : f)),
    eligibility: 'Any resident Indian individual or entity can invest; special categories enjoy the shorter 86-month term.',
    image: '/images/schemes/creative-duppat.webp',
    calc: { mode: 'fd', amount: 100000, months: 88, rate: 9.67 },
    featured: true,
  },
  {
    slug: 'vishvamangal-fixed-deposit-scheme-2',
    name: 'Vishwamangal 12-Month Fixed Deposit',
    nameMr: 'विश्वमंगल मुदत ठेव योजना',
    kind: 'fd',
    rate: 10,
    rateNote: 'p.a. for 12 months',
    pitch: 'Earn ₹10,000 on every ₹1 lakh in one year.',
    intro:
      'A straightforward one-year deposit at 10% p.a. Invest ₹1,00,000 today and receive ₹1,10,000 after 12 months — a clear, predictable return for your short-term goals.',
    facts: [
      { label: 'Scheme type', value: 'Fixed Deposit' },
      { label: 'Interest rate', value: '10% p.a.' },
      { label: 'Tenure', value: '12 months' },
      { label: 'Example deposit', value: '₹1,00,000' },
      { label: 'Interest earned', value: '₹10,000' },
      { label: 'Maturity amount', value: '₹1,10,000' },
      { label: 'TDS', value: 'Applicable on interest, except for society members' },
    ],
    highlight: [
      { label: 'Deposit', value: '₹1,00,000' },
      { label: 'Maturity', value: '₹1,10,000' },
      { label: 'Tenure', value: '12 mo' },
    ],
    features: fdFeatures,
    eligibility: 'Any resident Indian individual or entity, including senior citizens and HUFs, can invest.',
    image: '/images/schemes/creative-vfd.webp',
    calc: { mode: 'fd', amount: 100000, months: 12, rate: 10 },
  },
];

export const fdSlabs = [
  { tenure: '7 – 30 days', regular: 3.5, special: 4.0 },
  { tenure: '31 – 90 days', regular: 5.0, special: 5.5 },
  { tenure: '91 – 180 days', regular: 7.0, special: 7.5 },
  { tenure: '181 – 364 days', regular: 8.0, special: 8.5 },
  { tenure: '365 days & above', regular: 10.0, special: 10.0 },
];

export const specialCategories =
  'Senior citizens, persons with disabilities, ex-servicemen, single parents, widows aged 50 and above, and bulk deposits of ₹25 lakh & above (or institutions).';

export const depositDocuments = [
  'PAN card',
  'Aadhaar card',
  'Electricity bill (address proof)',
  'Photo identity proof',
  'Three passport-size photographs',
  'Form 60 / 61 (if PAN is not available)',
];

export const depositBenefits = [
  { icon: 'percent', title: 'Up to 10% p.a.', text: 'Among the most rewarding deposit rates in the co-operative sector.' },
  { icon: 'shield-check', title: 'Safe & regulated', text: `Registered under the Multi-State Co-operative Societies Act, 2002.` },
  { icon: 'calendar', title: 'Flexible tenures', text: 'From 7 days to 88 months — choose what fits your goal.' },
  { icon: 'users', title: 'Nomination facility', text: 'Secure your family’s future with an easy nomination.' },
];

export const schemeBySlug = (slug: string) => schemes.find((s) => s.slug === slug);

// 10 → "10", 9.5 → "9.50", 9.75 → "9.75"
export const fmtRate = (r: number) => (Number.isInteger(r) ? String(r) : r.toFixed(2));
