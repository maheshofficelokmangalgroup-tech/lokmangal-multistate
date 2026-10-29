// Frequently asked questions (admin panel: Pages & people → FAQ). Answers are sanitised HTML.

import { singleton } from '../lib/content';
import type { Lang } from '../i18n';

export const faqsFor = (lang: Lang) => singleton<{ items: { q: string; a: string }[] }>('faq', lang).items;
export const faqs = faqsFor('en');
