// Before/after view used in approvals, conflicts and "changes since live". Changes are marked with
// words and symbols, not colour alone.

import clsx from 'clsx';
import type { Change } from '../lib/api';
import { show } from '../lib/diff';

const label = { added: '+ Added', removed: '− Removed', changed: '≠ Changed' } as const;

export function FieldDiff({ changes, empty = 'No differences.' }: { changes: Change[]; empty?: string }) {
  if (changes.length === 0) return <p className="text-[13px] text-text-secondary">{empty}</p>;
  return (
    <ul className="divide-y divide-line-subtle rounded-[var(--radius-panel)] border border-line">
      {changes.map((c, i) => (
        <li key={i} className="grid gap-2 p-3 text-[13px] md:grid-cols-[200px_1fr_1fr]">
          <div>
            <span className="font-mono text-[12px] break-all">{c.path || '(whole item)'}</span>
            <span className={clsx('mt-1 block text-[11px] font-semibold', c.kind === 'removed' ? 'text-danger' : c.kind === 'added' ? 'text-success' : 'text-warning')}>{label[c.kind]}</span>
          </div>
          <div className="rounded bg-danger-soft/60 p-2 break-words">
            <span className="sr-only">Before: </span>
            {c.kind === 'added' ? <span className="text-text-secondary">—</span> : <del className="no-underline">{show(c.before)}</del>}
          </div>
          <div className="rounded bg-success-soft p-2 break-words">
            <span className="sr-only">After: </span>
            {c.kind === 'removed' ? <span className="text-text-secondary">—</span> : <ins className="no-underline">{show(c.after)}</ins>}
          </div>
        </li>
      ))}
    </ul>
  );
}
