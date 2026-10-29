// Other services and Rural Wealth Manager categories (admin panel: Pages & people).

import { singleton } from '../lib/content';

type Service = { icon: string; title: string; image?: string; text: string };
type Category = { icon: string; title: string; text?: string; items?: string[] } & Record<string, unknown>;
const content = singleton<{ services: Service[]; rwmCategories: Category[] }>('services');

export const services = content.services;
export const rwmCategories = content.rwmCategories;
