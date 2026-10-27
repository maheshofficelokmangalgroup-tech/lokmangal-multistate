// Loan products and terms as published on the society's loans page.

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

export const loans: Loan[] = [
  {
    slug: 'agriculture-term-loan',
    name: 'Agriculture Term Loan',
    icon: 'wheat',
    image: '/images/loans/agriculture.webp',
    rate: '15% – 16%',
    rateFrom: 15,
    amount: 'Up to ₹90 lakh',
    summary: 'Finance for farm equipment, irrigation, land development and allied agricultural activities.',
    details: [
      ['Loan amount', 'Up to ₹90 lakh'],
      ['Rate of interest', '16% up to ₹25,000 · 15% above ₹25,000'],
      ['Margin', '25% of profit'],
      ['Guarantors', '2'],
      ['Membership', 'Member / Nominal'],
      ['Security', 'Land 7/12 mortgage'],
      ['Documents', 'Valuation, mortgage, factory guarantee, photo, ration card, property 7/12'],
    ],
  },
  {
    slug: 'housing-loan',
    name: 'Housing Loan',
    icon: 'home',
    image: '/images/loans/housing.webp',
    rate: '12%',
    rateFrom: 12,
    amount: 'Up to ₹90 lakh',
    summary: 'Buy, build or extend your dream home with affordable rates and a comfortable repayment plan.',
    details: [
      ['Loan amount', 'Up to ₹90 lakh, as per housing project'],
      ['Rate of interest', '12%'],
      ['Margin', '1/4 of the estimate'],
      ['Guarantors', 'Minimum 2'],
      ['Membership', 'Member / Nominal'],
      ['Security', 'Land and building'],
      ['Documents', 'Valuation, search report, current 7/12, purchase papers, construction permission, income proof, photo, address proof, map'],
    ],
  },
  {
    slug: 'vehicle-loan',
    name: 'Vehicle Loan',
    icon: 'car',
    image: '/images/loans/vehicle.webp',
    rate: '13%',
    rateFrom: 13,
    amount: 'As per quotation',
    summary: 'Drive home a new car, two-wheeler or commercial vehicle — anyone can apply.',
    details: [
      ['Loan amount', 'As per quotation'],
      ['Rate of interest', '13%'],
      ['Margin', '1/4 (25%)'],
      ['Guarantors', '2'],
      ['Membership', 'Member / Nominal'],
      ['Security', 'Vehicle RC book (hypothecation)'],
      ['Documents', 'Quotation, income certificate, income tax returns'],
    ],
  },
  {
    slug: 'personal-loan',
    name: 'Personal Loan',
    icon: 'wallet',
    image: '/images/loans/personal.webp',
    rate: '15%',
    rateFrom: 15,
    amount: 'Up to ₹1 lakh',
    summary: 'Quick funds for weddings, medical needs, travel or any personal requirement.',
    details: [
      ['Loan amount', 'Up to ₹1 lakh'],
      ['Rate of interest', '15%'],
      ['Guarantors', '2'],
      ['Membership', 'Member / Nominal'],
      ['Security', 'Guarantee letter / cheque book'],
      ['Documents', 'Photo, ration card, salary certificate or income proof'],
    ],
  },
  {
    slug: 'warehouse-loan',
    name: 'Warehouse Loan',
    icon: 'warehouse',
    image: '/images/loans/warehouse.webp',
    rate: '18%',
    rateFrom: 18,
    amount: 'As per valuation',
    summary: 'Unlock the value of stored produce and goods with convenient monthly instalments.',
    details: [
      ['Rate of interest', '18%'],
      ['Instalment', 'Monthly'],
      ['Guarantors', '2'],
      ['Documents', 'Valuation, mortgage, guarantee, photo, ID proof, address proof'],
    ],
  },
  {
    slug: 'cash-credit',
    name: 'Cash Credit',
    icon: 'banknote',
    image: '/images/loans/cash-credit.webp',
    rate: 'As agri term loan',
    rateFrom: 15,
    amount: 'Up to ₹90 lakh',
    summary: 'A flexible working-capital limit for traders and businesses — pay interest only on what you use.',
    details: [
      ['Loan amount', 'Up to ₹90 lakh'],
      ['Rate of interest', 'Same as Agriculture Term Loan'],
      ['Guarantors', 'Minimum 2'],
      ['Membership', 'Member / Nominal'],
      ['Security', 'Property mortgage'],
      ['Documents', 'Current 7/12, valuation, search report, income proof, address proof'],
    ],
  },
  {
    slug: 'hypothecation-loan',
    name: 'Hypothecation Loan',
    icon: 'store',
    image: '/images/loans/hypothecation.webp',
    rate: 'As agri term loan',
    rateFrom: 15,
    amount: 'Up to ₹90 lakh',
    summary: 'Finance against your business stock and assets to keep operations running smoothly.',
    details: [
      ['Loan amount', 'Up to ₹90 lakh'],
      ['Rate of interest', 'Same as Agriculture Term Loan'],
      ['Guarantors', 'Minimum 2'],
      ['Membership', 'Member / Nominal'],
      ['Security', 'Shop Act licence, property, balance sheet'],
      ['Documents', 'Photo, address proof, income proof, search report, valuation, mortgage, Shop Act, balance sheet'],
    ],
  },
  {
    slug: 'land-mortgage-loan',
    name: 'Land Mortgage Loan',
    icon: 'map-pin',
    image: '/images/loans/land-mortgage.webp',
    rate: '17% – 18%',
    rateFrom: 17,
    amount: '₹1 crore+',
    summary: 'Large-ticket funding secured against agricultural or non-agricultural land.',
    details: [
      ['Loan amount', '₹1 crore and above'],
      ['Rate of interest', '18% up to ₹90,000 · 17% above ₹90,000'],
      ['Guarantors', '2'],
      ['Membership', 'Member / Nominal'],
      ['Security', 'Land 7/12 mortgage'],
      ['Documents', 'Land guarantee, photo, ration card, 7/12 mortgage'],
    ],
  },
  {
    slug: 'property-mortgage-loan',
    name: 'Property Mortgage Loan',
    icon: 'building',
    image: '/images/loans/house-mortgage.webp',
    rate: '17% – 18%',
    rateFrom: 17,
    amount: '₹1 crore+',
    summary: 'Raise funds for business or personal needs against your house or commercial property.',
    details: [
      ['Loan amount', '₹1 crore and above'],
      ['Rate of interest', '18% up to ₹90,000 · 17% above ₹90,000'],
      ['Guarantors', '2'],
      ['Membership', 'Member / Nominal'],
      ['Security', 'Land and building'],
      ['Documents', 'Current 7/12, income proof, photo, address proof, purchase papers'],
    ],
  },
  {
    slug: 'microfinance',
    name: 'Microfinance',
    icon: 'hand-coins',
    image: '/images/loans/microfinance.webp',
    rate: '24%',
    rateFrom: 24,
    amount: 'Up to ₹1 lakh',
    summary: 'Small, short-term credit that helps micro-entrepreneurs grow their livelihoods.',
    details: [
      ['Loan amount', 'Up to ₹1 lakh'],
      ['Rate of interest', '24%'],
      ['Period', '100 days'],
    ],
  },
  {
    slug: 'bachat-gat-loan',
    name: 'Bachat Gat (SHG) Loan',
    icon: 'users',
    image: '/images/loans/bachat-gat.webp',
    rate: '24%',
    rateFrom: 24,
    amount: 'Up to ₹1 lakh',
    summary: 'Group credit for women’s self-help groups (bachat gat) to start and scale small enterprises.',
    details: [
      ['Loan amount', 'Up to ₹1 lakh'],
      ['Rate of interest', '24%'],
      ['Period', '100 days'],
    ],
  },
];

export const loanTypesForForm = [
  ...loans.map((l) => l.name),
  'Educational Loan',
  'Gold Loan',
];

export const loanBenefits = [
  { icon: 'percent', title: 'Attractive interest rates', text: 'Competitive pricing across every loan product.' },
  { icon: 'file-text', title: 'Documentation made easy', text: 'Minimal paperwork with guidance at every step.' },
  { icon: 'zap', title: 'Quick & easy disbursal', text: 'Fast processing so you get funds when you need them.' },
  { icon: 'handshake', title: 'Efficient customer service', text: 'A local branch team that understands your needs.' },
];
