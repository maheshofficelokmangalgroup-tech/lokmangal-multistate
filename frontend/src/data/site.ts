// Organisation details, navigation, notices and documents. The values come from the content snapshot,
// which staff maintain in the admin panel (Settings, Homepage, Navigation, Notices & documents, Gallery).

import { isPreview, items, ratesValidityText, release, singleton } from '../lib/content';

type Social = { label: string; icon: string; href: string };
type Settings = {
  name: string;
  legalName: string;
  nameMr: string;
  tagline: string;
  taglineMr: string;
  url: string;
  description: string;
  registration: string;
  act: string;
  founded: number;
  operationsSince: number;
  ifsc: string;
  phone: string;
  phoneHref: string;
  email: string;
  hrEmail: string;
  address: { line1: string; line2: string; city: string; pin: string; state: string };
  mapEmbed: string;
  mapLink: string;
  appUrl: string;
  aboutVideo: string;
  foundationUrl: string;
  social: Social[];
};

// Where enquiry forms are POSTed. Release builds use the Rust API; seed builds keep the legacy PHP handler
// until the API is live. Preview builds never submit (see main.ts), so tests cannot create real enquiries.
const formEndpoint = isPreview
  ? ''
  : (process.env.PUBLIC_FORM_ENDPOINT ?? (release.kind === 'seed' ? '/api/enquiry.php' : '/api/v1/enquiries'));

export const site = { ...singleton<Settings>('settings'), formEndpoint, ratesValidity: ratesValidityText };

type Stat = { value: number; prefix: string; suffix: string; label: string; sub: string };
type Announcement = { enabled: boolean; label: string; text: string; href: string; linkText: string };
const home = singleton<{ stats: Stat[]; announcement: Announcement }>('home');
export const stats = home.stats;
export const announcement = home.announcement;

export type NavChild = { label: string; href: string; desc?: string; icon?: string };
export type NavItem = { label: string; href: string; children?: NavChild[]; mega?: boolean };
type Link = { label: string; href: string };
const navigation = singleton<{ nav: NavItem[]; footerLinks: { quick: Link[]; other: Link[] } }>('navigation');
export const nav = navigation.nav;
export const footerLinks = navigation.footerLinks;

type NoticeItem = { label: string; href: string; kind: 'pdf' | 'page' | 'drive' | string };
type Notice = { title: string; category: string; date: string; pinned: boolean; items: NoticeItem[]; expires?: string | null };
const allNotices = items<Notice>('notice');
// The notices page and homepage show the pinned notice (or the most recent one).
export const notices = allNotices.find((n) => n.pinned) ?? [...allNotices].sort((a, b) => b.date.localeCompare(a.date))[0] ?? { title: '', items: [] };

type Doc = { category: string; title: string; year: string | null; cover: string | null; href: string | null; sizeMb: number | null };
const docs = items<Doc>('document');
export const memberLists = docs.filter((d) => d.category === 'member-list').map((d) => ({ district: d.title, href: d.href!, sizeMb: d.sizeMb ?? 0 }));
export const annualReports = docs
  .filter((d) => d.category === 'annual-report')
  .map((d) => ({ year: d.year ?? d.title, cover: d.cover ?? undefined, file: d.href ?? undefined }));

type Album = { title: string; images: { src: string; caption: string }[] };
export const gallery = items<Album>('gallery_album').flatMap((a) => a.images);

type Job = { icon: string; title: string; text: string; location: string; open: boolean };
export const jobOpenings = items<Job>('job_opening').filter((j) => j.open);
