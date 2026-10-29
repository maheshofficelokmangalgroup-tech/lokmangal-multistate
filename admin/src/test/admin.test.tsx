import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ErrorSummary, StatusBadge } from '../components/ui';
import { COLLECTION_UI, type FieldSpec } from '../features/schemas';
import { ApiError } from '../lib/api';
import { diff } from '../lib/diff';
import { fmtINR, istLocalToIso, isoToIstLocal } from '../lib/format';

const seed = JSON.parse(readFileSync(resolve(process.cwd(), '../frontend/seed/snapshot.json'), 'utf8'));

/** Keys a form can edit at the top level (groups without a key edit their parent's keys). */
function editableKeys(specs: FieldSpec[]): Set<string> {
  const out = new Set<string>();
  for (const s of specs) {
    if (s.type === 'group' && !s.key) editableKeys(s.fields).forEach((k) => out.add(k));
    else out.add(s.key);
  }
  return out;
}

describe('content forms cover the published data', () => {
  const collections: [string, Record<string, unknown>][] = [
    ...Object.entries(seed.singletons as Record<string, Record<string, unknown>>),
    ...Object.entries(seed.collections as Record<string, { data: Record<string, unknown> }[]>).map(([k, v]) => [k, v[0].data] as [string, Record<string, unknown>]),
  ];
  it.each(collections)('%s has a form for every field', (name, data) => {
    const ui = COLLECTION_UI[name];
    expect(ui, `no form for ${name}`).toBeDefined();
    const keys = editableKeys(ui.fields);
    // Identifiers kept automatically are not edited by hand.
    const missing = Object.keys(data).filter((k) => !keys.has(k) && !['id', 'order', 'regionOrder'].includes(k) && !(name === 'post' && k === 'order'));
    expect(missing).toEqual([]);
  });
});

describe('diff', () => {
  it('reports nested changes, additions and removals', () => {
    const d = diff({ a: 1, list: [{ v: 'x' }], gone: true }, { a: 2, list: [{ v: 'x' }, { v: 'y' }], added: 1 });
    expect(d.map((c) => `${c.kind}:${c.path}`).sort()).toEqual(['added:added', 'added:list[1]', 'changed:a', 'removed:gone']);
  });
  it('treats a first version as one addition', () => {
    expect(diff(undefined, { a: 1 })).toEqual([{ path: '', kind: 'added', after: { a: 1 } }]);
  });
});

describe('formatting', () => {
  it('uses Indian grouping', () => expect(fmtINR(100344.4)).toBe('₹1,00,344'));
  it('round-trips IST local times', () => {
    const iso = istLocalToIso('2027-04-01T00:00');
    expect(iso).toBe('2027-03-31T18:30:00.000Z');
    expect(isoToIstLocal(iso)).toBe('2027-04-01T00:00');
  });
});

describe('ui', () => {
  it('status badges carry text, not colour alone', () => {
    render(<StatusBadge status="changes_requested" />);
    expect(screen.getByText('Changes requested')).toBeInTheDocument();
  });
  it('error summary lists field problems and the support reference', () => {
    const e = new ApiError(422, { error: { code: 'validation_failed', message: 'Please correct the highlighted fields.', fields: { phone: 'Enter a valid number.' }, request_id: 'req_123' } });
    render(<ErrorSummary error={e} labels={{ phone: 'Phone' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Please correct the highlighted fields.');
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText(/req_123/)).toBeInTheDocument();
  });
});
