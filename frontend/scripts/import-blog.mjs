#!/usr/bin/env node
// LEGACY: written for the previous layout. It writes src/data/posts.json, which the site no longer reads
// (posts now live in the admin Blog module and in seed/snapshot.json). Kept only as a reference for pulling
// post text from the old WordPress site; adapt its output before relying on it.
//
// Imports news posts from the old WordPress site into src/data/posts.json
// and downloads each post's featured image into public/images/blog/.
//
//   npm run import:blog            → title, date, image and a short summary
//   npm run import:blog -- --full  → also imports the full post text (sanitised, links removed)
//
// Only the "Blog" category is imported; other categories on the old site are not part of the society's news.

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WP = process.env.WP_URL || 'https://lokmangalmultistate.com';
const BLOG_CATEGORY = 1;
const FULL = process.argv.includes('--full');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG_DIR = path.join(ROOT, 'public', 'images', 'blog');
const OUT = path.join(ROOT, 'src', 'data', 'posts.json');
const SPAM = /(casino|slots?\b|porn|sex|bitcoin|crypto|forex|betting|viagra|tapentadol|short squeeze)/i;

// Old English posts carried SEO keywords in their titles.
const TITLE_OVERRIDES = {
  2701: 'What is a Traimasik (Quarterly) Interest Scheme?',
  2699: 'Everything You Should Know About Fixed Deposits',
  2697: 'Salary Loan — Super Dhamaka Offer',
  2695: 'Mortgage Loan',
  2693: 'Hypothecation Loan',
  2691: 'Home Loan Offer',
  2689: 'Cash Credit Loan',
  5987: 'सौजन्य मूर्ती : रोहन भय्या',
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
// Page-builder shortcodes such as [vc_row] or [vc_single_image image="…"].
const stripShortcodes = (s) => s.replace(/\[\/?[a-z_]+[^\]]*\]/gi, ' ');
const text = (html) => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function summary(html) {
  let s = stripShortcodes(text(html))
    .replace(/\s+/g, ' ')
    .replace(/\[(…|\.\.\.)\]/g, '')
    .replace(/\+91\s?9923203322\s*\|?\s*(www\.)?lokmangalmultistate\.com/gi, '')
    .trim();
  if (s.length > 180) s = s.slice(0, 180).replace(/\s+\S*$/, '') + '…';
  return s;
}

function sanitize(html) {
  const allowed = new Set(['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote']);
  let out = stripShortcodes(decode(html))
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|form|noscript|svg)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?([a-zA-Z0-9]+)\b[^>]*>/g, (m, raw) => {
      const tag = { b: 'strong', i: 'em' }[raw.toLowerCase()] ?? raw.toLowerCase();
      if (!allowed.has(tag)) return tag === 'div' ? '\n' : '';
      if (tag === 'br') return '<br>';
      return m.startsWith('</') ? `</${tag}>` : `<${tag}>`;
    });
  // Escape any "<" that is not one of the clean tags emitted above.
  out = out.replace(/<(?!\/?(p|br|strong|em|ul|ol|li|h2|h3|h4|blockquote)>)/g, '&lt;');
  return out.replace(/<p>(\s|&nbsp;|<br>)*<\/p>/g, '').replace(/\n{2,}/g, '\n').trim();
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'LokmangalSiteImporter/1.0' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return { data: await res.json(), pages: Number(res.headers.get('x-wp-totalpages') || 1) };
}

async function download(url, dest) {
  if (existsSync(dest)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

await mkdir(IMG_DIR, { recursive: true });
const raw = [];
for (let page = 1, pages = 1; page <= pages; page++) {
  const r = await getJson(`${WP}/wp-json/wp/v2/posts?categories=${BLOG_CATEGORY}&per_page=100&page=${page}&_embed=wp:featuredmedia`);
  raw.push(...r.data);
  pages = r.pages;
}

const posts = [];
for (const p of raw) {
  const rawTitle = text(p.title.rendered);
  const excerpt = summary(p.content.rendered);
  if (SPAM.test(rawTitle) || SPAM.test(excerpt)) continue;

  const media = p._embedded?.['wp:featuredmedia']?.[0];
  const sizes = media?.media_details?.sizes ?? {};
  const src = (sizes.medium_large ?? sizes.large ?? sizes.medium ?? media)?.source_url;
  let image = null;
  if (src) {
    const ext = (path.extname(new URL(src).pathname) || '.jpg').toLowerCase();
    try {
      await download(src, path.join(IMG_DIR, `${p.id}${ext}`));
      image = `/images/blog/${p.id}${ext}`;
    } catch (e) {
      console.warn(`  ! image skipped for ${p.id}: ${e.message}`);
    }
  }

  const post = {
    id: p.id,
    slug: decodeURIComponent(p.slug),
    title: TITLE_OVERRIDES[p.id] ?? rawTitle.split(' | ')[0].trim(),
    date: p.date,
    image,
    excerpt,
  };
  if (FULL) post.content = sanitize(p.content.rendered);
  posts.push(post);
  console.log(`  ✓ ${post.date.slice(0, 10)}  ${post.title.slice(0, 60)}`);
}

posts.sort((a, b) => b.date.localeCompare(a.date));
await writeFile(OUT, JSON.stringify(posts, null, 2) + '\n');
console.log(`\nSaved ${posts.length} posts to ${path.relative(ROOT, OUT)}${FULL ? ' (with full text)' : ''}.`);
