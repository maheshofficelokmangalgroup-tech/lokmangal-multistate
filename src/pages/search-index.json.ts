// Build-time search index for the site search dialog (fetched on first open).
import type { APIRoute } from 'astro';
import { schemes, kindLabels, fmtRate } from '../data/deposits';
import { loans } from '../data/loans';
import { divisions } from '../data/branches';
import { faqs } from '../data/faq';
import { services } from '../data/services';
import posts from '../data/posts.json';

type Entry = { t: string; u: string; g: string; k?: string };

const pages: Entry[] = [
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
  ['Notices — Election 2025', '/notices/', 'election notice board'],
  ['List of Members', '/list-of-members/', 'voter list delegates'],
  ['Careers', '/careers/', 'jobs hiring vacancy'],
  ['Blog & News', '/blog/', 'stories news'],
  ['Annual Reports', '/annual-reports/', 'report accounts'],
  ['Photo Gallery', '/gallery/', 'photos'],
].map(([t, u, k]) => ({ t, u, k, g: 'Pages' }));

const index: Entry[] = [
  ...pages,
  ...schemes.map((s) => ({
    t: s.name,
    u: `/deposits/${s.slug}/`,
    g: 'Deposits',
    k: `${kindLabels[s.kind]} ${s.rate !== null ? fmtRate(s.rate) + '%' : 'double'} ${s.nameMr} ${s.pitch}`,
  })),
  ...loans.map((l) => ({ t: l.name, u: `/loans/#${l.slug}`, g: 'Loans', k: `${l.rate} ${l.amount} ${l.summary}` })),
  ...services.map((s) => ({ t: s.title, u: '/other-services/', g: 'Services', k: s.text })),
  ...divisions.flatMap((d) =>
    d.branches.map((b) => ({ t: `${b.name} branch`, u: `/branches/?q=${encodeURIComponent(b.name)}`, g: 'Branches', k: `${b.address} ${d.name}` })),
  ),
  ...faqs.map((f) => ({ t: f.q, u: '/faq/', g: 'FAQ' })),
  ...posts.map((p) => ({ t: p.title, u: `/blog/${p.slug}/`, g: 'Stories' })),
];

export const GET: APIRoute = () =>
  new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
