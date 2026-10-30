// News and blog posts (admin panel: Blog & news), newest first.

import { items } from '../lib/content';
import type { Lang } from '../i18n';

export type Post = { id: number | string; slug: string; title: string; date: string; image: string | null; excerpt: string; content?: string; language?: string; category?: string };

export const postsFor = (lang: Lang) => items<Post>('post', lang).sort((a, b) => b.date.localeCompare(a.date));

const posts = postsFor('en');

export default posts;
