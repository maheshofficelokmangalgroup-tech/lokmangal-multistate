// Social responsibility pillars and initiatives (admin panel: Pages & people).
// csrData('mr') is the Marathi version; the plain exports are English.

import { singleton } from '../lib/content';
import type { Lang } from '../i18n';

type Pillar = { icon: string; title: string };
type Initiative = { icon: string; title: string; stat: string; text: string; link?: string } & Record<string, unknown>;

const build = (lang: Lang) => {
  const content = singleton<{ pillars: Pillar[]; initiatives: Initiative[] }>('csr', lang);
  return { csrPillars: content.pillars, initiatives: content.initiatives };
};

const cache: Partial<Record<Lang, ReturnType<typeof build>>> = {};
export const csrData = (lang: Lang) => (cache[lang] ??= build(lang));

export const { csrPillars, initiatives } = csrData('en');
