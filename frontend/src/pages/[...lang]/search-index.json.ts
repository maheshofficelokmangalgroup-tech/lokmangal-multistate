// Build-time search index for the site search dialog (fetched on first open): /search-index.json for English,
// /mr/search-index.json for Marathi.
import type { APIRoute } from 'astro';
import { depositsData, fmtRate } from '../../data/deposits';
import { loansData } from '../../data/loans';
import { branchesData } from '../../data/branches';
import { faqsFor } from '../../data/faq';
import { servicesFor } from '../../data/services';
import { postsFor } from '../../data/posts';
import { langPaths, localePath, type Lang } from '../../i18n';
import { useT } from '../../i18n/ui';

export function getStaticPaths() {
  return langPaths();
}

type Entry = { t: string; u: string; g: string; k?: string };

const pagesEn: [string, string, string][] = [
  ['Open an Account', '/open-an-account/', 'savings current account apply kyc'],
  ['Apply for a Deposit', '/apply-for-deposits/', 'fd rd book deposit apply'],
  ['Apply for a Loan', '/apply-loan/', 'loan application apply'],
  ['Interest Rates', '/interest-rates/', 'fd rates senior citizen rate chart व्याजदर'],
  ['Calculators', '/calculators/', 'fd rd emi maturity calculator'],
  ['All Deposit Schemes', '/deposits/', 'fixed recurring monthly doubling ठेव'],
  ['All Loans', '/loans/', 'loan products कर्ज'],
  ['Branches', '/branches/', 'branch near me address phone शाखा'],
  ['Contact Us', '/contact-us/', 'phone email address head office ifsc'],
  ['About Us', '/about-us/', 'history vision values since 2004'],
  ["Chairman's Message", '/chairman-message/', 'rohan deshmukh'],
  ['Board of Directors', '/board-of-directors/', 'directors leadership'],
  ['Social Responsibility', '/social-responsibility/', 'csr foundation annapoorna'],
  ['Other Services', '/other-services/', 'net banking mobile upi neft rtgs sms locker bill'],
  ['Rural Wealth Manager', '/rural-wealth-manager/', 'insurance demat gold mutual fund'],
  ['FAQ', '/faq/', 'questions safe deposits'],
  ['Notices: Election 2025', '/notices/', 'election notice board'],
  ['List of Members', '/list-of-members/', 'voter list delegates'],
  ['Careers', '/careers/', 'jobs hiring vacancy'],
  ['Blog & News', '/blog/', 'stories news'],
  ['Annual Reports', '/annual-reports/', 'report accounts'],
  ['Photo Gallery', '/gallery/', 'photos'],
];

// Marathi titles; the keywords stay as they are so English and Roman-script searches still work.
const pagesMr: Record<string, string> = {
  '/open-an-account/': 'खाते उघडा',
  '/apply-for-deposits/': 'ठेवीसाठी अर्ज',
  '/apply-loan/': 'कर्जासाठी अर्ज',
  '/interest-rates/': 'व्याजदर',
  '/calculators/': 'कॅल्क्युलेटर',
  '/deposits/': 'सर्व ठेव योजना',
  '/loans/': 'सर्व कर्ज',
  '/branches/': 'शाखा',
  '/contact-us/': 'संपर्क',
  '/about-us/': 'आमच्याबद्दल',
  '/chairman-message/': 'अध्यक्षांचा संदेश',
  '/board-of-directors/': 'संचालक मंडळ',
  '/social-responsibility/': 'सामाजिक बांधिलकी',
  '/other-services/': 'इतर सेवा',
  '/rural-wealth-manager/': 'रुरल वेल्थ मॅनेजर',
  '/faq/': 'वारंवार विचारले जाणारे प्रश्न',
  '/notices/': 'सूचना: निवडणूक 2025',
  '/list-of-members/': 'सभासदांची यादी',
  '/careers/': 'करिअर',
  '/blog/': 'ब्लॉग आणि बातम्या',
  '/annual-reports/': 'वार्षिक अहवाल',
  '/gallery/': 'छायाचित्रे',
};

function build(lang: Lang): Entry[] {
  const t = useT(lang);
  const l = (p: string) => localePath(p, lang);
  const { schemes } = depositsData(lang);
  const { loans } = loansData(lang);
  const { divisions } = branchesData(lang);
  const englishBranch = new Map(branchesData('en').divisions.flatMap((d) => d.branches.map((b) => [b.code, b.name] as const)));
  const { services } = servicesFor(lang);
  return [
    ...pagesEn.map(([title, u, k]) => ({ t: lang === 'mr' ? (pagesMr[u] ?? title) : title, u: l(u), k: lang === 'mr' ? `${title} ${k}` : k, g: 'Pages' })),
    ...schemes.map((s) => ({
      t: s.name,
      u: l(`/deposits/${s.slug}/`),
      g: 'Deposits',
      k: `${t(`kind.${s.kind}` as 'kind.fd')} ${s.rate !== null ? fmtRate(s.rate) + '%' : 'double'} ${s.nameMr} ${s.pitch}`,
    })),
    ...loans.map((ln) => ({ t: ln.name, u: l(`/loans/#${ln.slug}`), g: 'Loans', k: `${ln.rate} ${ln.amount} ${ln.summary}` })),
    ...services.map((s) => ({ t: s.title, u: l('/other-services/'), g: 'Services', k: s.text })),
    ...divisions.flatMap((d) =>
      d.branches.map((b) => ({ t: lang === 'mr' ? b.name : `${b.name} branch`, a: lang === 'mr' ? englishBranch.get(b.code) : undefined, u: `${l('/branches/')}?q=${encodeURIComponent(b.name)}`, g: 'Branches', k: `${b.address} ${d.name}` })),
    ),
    ...faqsFor(lang).map((f, i) => ({ t: f.q, u: `${l('/faq/')}#q-${i + 1}`, g: 'FAQ' })),
    ...postsFor(lang).map((p) => ({ t: p.title, u: l(`/blog/${p.slug}/`), g: 'Stories' })),
  ];
}

export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(build(params.lang === 'mr' ? 'mr' : 'en')), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
