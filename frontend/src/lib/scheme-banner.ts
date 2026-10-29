// Banner photo for a deposit scheme, from frontend/public/images/schemes/banner-*.webp. The pages look the
// file up at build time, so adding a banner with the right name is all it takes. Returns null when a scheme
// has no banner yet.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

const named: Record<string, string> = {
  'vishwamangal-fixed-deposit-scheme': 'fd',
  'vishvamangal-monthly-interest': 'monthly',
  'vishvamangal-recurring-deposit': 'recurring',
  'daam-duppat-yojna': 'duppat',
  'vishvamangal-fixed-deposit-scheme-2': 'fd12',
};

export function schemeBanner(slug: string, kind: string): string | null {
  // Each Lakshadish scheme has its own banner (banner-lakshadish-1.webp …); banner-lakshadish.webp is the fallback.
  const lakshadishNo = slug.match(/^lakshadish-deposit-scheme-(\d+)$/)?.[1];
  const names = [named[slug] ?? (lakshadishNo ? `lakshadish-${lakshadishNo}` : kind), ...(lakshadishNo ? ['lakshadish'] : [])];
  return names.map((n) => `/images/schemes/banner-${n}.webp`).find((p) => existsSync(join(process.cwd(), 'public', p))) ?? null;
}
