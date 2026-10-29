// News and blog posts (admin panel: Blog & news), newest first.

import { items } from '../lib/content';

export type Post = { id: number | string; slug: string; title: string; date: string; image: string | null; excerpt: string; content?: string; language?: string };

const posts = items<Post>('post').sort((a, b) => b.date.localeCompare(a.date));

export default posts;
