// Other services and Rural Wealth Manager categories (admin panel: Pages & people).

import { singleton } from '../lib/content';
import type { Lang } from '../i18n';

type Service = { icon: string; title: string; image?: string; text: string };
type Category = { icon: string; title: string; text?: string; items?: string[] } & Record<string, unknown>;

export const servicesFor = (lang: Lang) => {
  const content = singleton<{ services: Service[]; rwmCategories: Category[] }>('services', lang);
  return { services: content.services, rwmCategories: content.rwmCategories };
};

export const { services, rwmCategories } = servicesFor('en');
