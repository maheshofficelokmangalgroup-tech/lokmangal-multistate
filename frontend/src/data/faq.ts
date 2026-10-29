// Frequently asked questions (admin panel: Pages & people → FAQ). Answers are sanitised HTML.

import { singleton } from '../lib/content';

export const faqs = singleton<{ items: { q: string; a: string }[] }>('faq').items;
