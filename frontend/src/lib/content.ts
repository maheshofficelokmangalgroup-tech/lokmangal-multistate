// Loads the public content snapshot this build is made from.
//
//   CONTENT_SNAPSHOT=/path/snapshot.json   release and preview builds (written by the builder service)
//   CONTENT_SOURCE=seed                    explicitly use seed/snapshot.json (offline work, static hosting
//                                          without the admin system, e.g. Render)
//
// `astro dev` falls back to the seed with a warning. A production build with neither setting fails, so a
// release can never silently be built from demo data.

import { readFileSync } from 'node:fs';
import { resolveDeep, type CalcConfig, type RateEntries } from '@lokmangal/finance/tokens';
import type { CalcMode } from '@lokmangal/finance';

export type RateEntry = {
  key: string;
  section: 'fd_slab' | 'deposit' | 'doubling' | 'loan';
  label: string;
  value: string; // decimal string, exactly as approved
  unit: 'percent' | 'months';
  category?: string;
  minDays?: number;
  maxDays?: number | null;
};

export type SnapshotItem<T = Record<string, unknown>> = { slug: string; data: T };

export type Snapshot = {
  schemaVersion: 1;
  release: { id: string; kind: 'live' | 'preview' | 'seed'; createdAt: string; financePolicy: string; contentHash: string | null };
  rateSet: { id: string; label: string; validFrom: string; validUntil: string; timezone: string; entries: RateEntry[] };
  singletons: Record<string, any>;
  collections: Record<string, SnapshotItem<any>[]>;
};

function load(): Snapshot {
  const explicit = process.env.CONTENT_SNAPSHOT;
  // Set by astro.config.mjs (this module is bundled, so its own URL is not a stable reference point).
  const seedPath = process.env.CONTENT_SEED_PATH!;
  let path: string;
  if (explicit) path = explicit;
  else if (process.env.CONTENT_SOURCE === 'seed') path = seedPath;
  else if (import.meta.env.DEV) {
    console.warn('[content] CONTENT_SNAPSHOT not set — using seed/snapshot.json for development.');
    path = seedPath;
  } else {
    throw new Error('No content snapshot: set CONTENT_SNAPSHOT to a release snapshot, or CONTENT_SOURCE=seed to build from the seed on purpose.');
  }
  const snap = JSON.parse(readFileSync(path, 'utf8')) as Snapshot;
  if (snap.schemaVersion !== 1) throw new Error(`Unsupported snapshot schema version ${snap.schemaVersion} in ${path}`);
  return snap;
}

export const snapshot = load();
export const release = snapshot.release;
export const isPreview = release.kind === 'preview';

export const rates: RateEntries = Object.fromEntries(
  snapshot.rateSet.entries.map((e) => {
    const n = Number(e.value);
    if (!Number.isFinite(n)) throw new Error(`Rate entry ${e.key} has an invalid value "${e.value}"`);
    return [e.key, n];
  }),
);

/** Published items of a collection, in their display order. */
export function items<T = any>(collection: string): T[] {
  return (snapshot.collections[collection] ?? [])
    .map((i) => i.data as T & { order?: number })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function singleton<T = any>(name: string): T {
  const value = snapshot.singletons[name];
  if (value === undefined) throw new Error(`Snapshot is missing the "${name}" content`);
  return value as T;
}

export function rate(key: string): number {
  const v = rates[key];
  if (v === undefined) throw new Error(`Unknown rate key "${key}"`);
  return v;
}

/** Fills {rate:…}, {number:…} and {calc…} placeholders; an unknown key fails the build. */
export function resolve<T>(value: T, calc?: { mode: CalcMode; amount: number; months: number; rateKey: string }, where?: string): T {
  const c: CalcConfig | undefined = calc ? { mode: calc.mode, amount: calc.amount, months: calc.months, rate: rate(calc.rateKey) } : undefined;
  return resolveDeep(value, { rates, calc: c, where });
}

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${months[m - 1]} ${y}`;
};
/** Rate sets end exclusively; the public text shows the last valid day. */
function lastValidDay(isoExclusive: string) {
  const d = new Date(`${isoExclusive}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
export const ratesValidFrom = snapshot.rateSet.validFrom;
export const ratesValidUntil = snapshot.rateSet.validUntil;
export const ratesValidityText = `${longDate(ratesValidFrom)} – ${longDate(lastValidDay(ratesValidUntil))}`;
