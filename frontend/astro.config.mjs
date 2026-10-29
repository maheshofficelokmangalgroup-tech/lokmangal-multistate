// @ts-check
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Redirects are content (admin panel: SEO & redirects) and travel with each release snapshot.
// In production Caddy answers them with real HTTP 301/302 responses (deploy/release-controller);
// the pages Astro generates for them are only a fallback for plain static hosting.
process.env.CONTENT_SEED_PATH = fileURLToPath(new URL('./seed/snapshot.json', import.meta.url));

function snapshotRedirects() {
  const path =
    process.env.CONTENT_SNAPSHOT ??
    (process.env.CONTENT_SOURCE === 'seed' || process.argv.includes('dev') ? process.env.CONTENT_SEED_PATH : null);
  if (!path) return {};
  const snap = JSON.parse(readFileSync(path, 'utf8'));
  return Object.fromEntries((snap.collections?.redirect ?? []).map((/** @type {{ data: { from: string; to: string } }} */ r) => [r.data.from, r.data.to]));
}

export default defineConfig({
  site: 'https://lokmangalmultistate.com',
  trailingSlash: 'always',
  outDir: process.env.ASTRO_OUT_DIR ?? './dist',
  redirects: snapshotRedirects(),
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  integrations: [sitemap()],
});
