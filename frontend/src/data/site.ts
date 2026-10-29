// Organisation details, navigation, notices and documents. The values come from the content snapshot,
// which staff maintain in the admin panel (Settings, Homepage, Navigation, Notices & documents, Gallery).
// Every value has an English and a Marathi form: siteData('mr') returns the Marathi one, and the plain
// exports below are the English one.

import { isPreview, items, ratesValidityFor, release, singleton } from '../lib/content';
import type { Lang } from '../i18n';

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

type Stat = { value: number; prefix: string; suffix: string; label: string; sub: string };
type Announcement = { enabled: boolean; label: string; text: string; href: string; linkText: string };

export type NavChild = { label: string; href: string; desc?: string; icon?: string };
export type NavItem = { label: string; href: string; children?: NavChild[]; mega?: boolean };
type Link = { label: string; href: string };

type NoticeItem = { label: string; href: string; kind: 'pdf' | 'page' | 'drive' | string };
type Notice = { title: string; category: string; date: string; pinned: boolean; items: NoticeItem[]; expires?: string | null };

type Doc = { category: string; title: string; year: string | null; cover: string | null; href: string | null; sizeMb: number | null };
type Album = { title: string; images: { src: string; caption: string }[] };
type Job = { icon: string; title: string; text: string; location: string; open: boolean };

function build(lang: Lang) {
  const site = { ...singleton<Settings>('settings', lang), formEndpoint, ratesValidity: ratesValidityFor(lang) };

  const home = singleton<{ stats: Stat[]; announcement: Announcement }>('home', lang);
  const navigation = singleton<{ nav: NavItem[]; footerLinks: { quick: Link[]; other: Link[] } }>('navigation', lang);

  const allNotices = items<Notice>('notice', lang);
  // The notices page and homepage show the pinned notice (or the most recent one).
  const notices = allNotices.find((n) => n.pinned) ?? [...allNotices].sort((a, b) => b.date.localeCompare(a.date))[0] ?? { title: '', items: [] };

  const docs = items<Doc>('document', lang);
  return {
    site,
    stats: home.stats,
    announcement: home.announcement,
    nav: navigation.nav,
    footerLinks: navigation.footerLinks,
    notices,
    memberLists: docs.filter((d) => d.category === 'member-list').map((d) => ({ district: d.title, href: d.href!, sizeMb: d.sizeMb ?? 0 })),
    annualReports: docs
      .filter((d) => d.category === 'annual-report')
      .map((d) => ({ year: d.year ?? d.title, cover: d.cover ?? undefined, file: d.href ?? undefined })),
    gallery: items<Album>('gallery_album', lang).flatMap((a) => a.images),
    jobOpenings: items<Job>('job_opening', lang).filter((j) => j.open),
  };
}

const cache: Partial<Record<Lang, ReturnType<typeof build>>> = {};
export const siteData = (lang: Lang) => (cache[lang] ??= build(lang));

const en = siteData('en');
export const { site, stats, announcement, nav, footerLinks, notices, memberLists, annualReports, gallery, jobOpenings } = en;
