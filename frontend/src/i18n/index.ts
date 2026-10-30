// Languages. English lives at the site root; Marathi lives under /mr/ with the same page names
// (/about-us/ → /mr/about-us/). Pages are added to the Marathi registry below as they are translated, and
// until then the language switch on those pages sends visitors to the Marathi home page.

export const locales = ['en', 'mr'] as const;
export type Lang = (typeof locales)[number];
export const defaultLang: Lang = 'en';

export const langNames: Record<Lang, string> = { en: 'English', mr: 'मराठी' };
/** BCP 47 tags for hreflang and the sitemap. */
export const langTags: Record<Lang, string> = { en: 'en-IN', mr: 'mr-IN' };
export const ogLocales: Record<Lang, string> = { en: 'en_IN', mr: 'mr_IN' };

/** Page routes under src/pages/[...lang]/ use this to produce both /path/ and /mr/path/. */
export const langPaths = () => [{ params: { lang: undefined } }, { params: { lang: 'mr' } }];

export function langFromPath(pathname: string): Lang {
  return pathname === '/mr' || pathname.startsWith('/mr/') ? 'mr' : 'en';
}

/** '/mr/about-us/' → '/about-us/'; '/mr/' → '/'. */
export function stripLang(pathname: string): string {
  if (pathname === '/mr' || pathname === '/mr/') return '/';
  return pathname.startsWith('/mr/') ? pathname.slice(3) : pathname;
}

export const getLang = (astro: { url: URL }): Lang => langFromPath(astro.url.pathname);

// Pages that have a Marathi version. A trailing * matches the path and everything below it; a trailing +
// matches only the pages below it (/deposits/+ covers each scheme but not /deposits/ itself).
const MARATHI_PAGES: string[] = ['/', '/about-us/', '/chairman-message/', '/board-of-directors/', '/social-responsibility/', '/annual-reports/', '/gallery/', '/deposits/*', '/loans/', '/other-services/', '/rural-wealth-manager/', '/faq/', '/branches/', '/contact-us/', '/careers/', '/blog/*', '/open-an-account/', '/notices/', '/list-of-members/', '/calculators/', '/terms-of-use/', '/privacy-policy/', '/sitemap/'];

const NOT_A_PAGE = /^\/(images|docs|api|media|_astro|wp-content|favicon|apple-touch|search-index|release\.json|sitemap-|robots)/;

export function hasMarathi(path: string): boolean {
  const p = stripLang(path.split(/[?#]/)[0]);
  return MARATHI_PAGES.some((m) => {
    if (m.endsWith('*')) return p.startsWith(m.slice(0, -1));
    if (m.endsWith('+')) return p.startsWith(m.slice(0, -1)) && p.length > m.length - 1;
    return p === m;
  });
}

/** Prefixes an internal page link with the language, when that page has a version in it. */
export function localePath(path: string, lang: Lang): string {
  if (lang === 'en') return path;
  if (!path.startsWith('/') || path.startsWith('//') || NOT_A_PAGE.test(path)) return path;
  if (path === '/mr' || path.startsWith('/mr/')) return path;
  return hasMarathi(path) ? '/mr' + path : path;
}

/** Where the language switch on the current page should point. */
export function switchTarget(pathname: string, to: Lang): string {
  const base = stripLang(pathname);
  if (to === 'en') return base;
  return hasMarathi(base) ? '/mr' + base : '/mr/';
}

/**
 * Overlay a language's translated text onto content. Translations are stored next to the English text under
 * an "mr" key with the same shape; anything not translated falls back to the English value.
 */
export function localize<T>(data: T, lang: Lang): T {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return data;
  const { mr, ...base } = data as Record<string, unknown>;
  if (lang !== 'mr' || mr === undefined || mr === null) return base as T;
  return merge(base, mr) as T;
}

function merge(base: unknown, over: unknown): unknown {
  if (over === undefined || over === null) return base;
  if (typeof over === 'string') return over === '' ? base : over;
  if (Array.isArray(over)) {
    if (!Array.isArray(base)) return base;
    return base.map((b, i) => (i < over.length ? merge(b, over[i]) : b));
  }
  if (typeof over === 'object' && base && typeof base === 'object' && !Array.isArray(base)) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(over as Record<string, unknown>)) out[k] = merge(out[k], v);
    return out;
  }
  return base;
}
