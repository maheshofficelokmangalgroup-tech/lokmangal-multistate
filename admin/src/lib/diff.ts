// Field-level JSON differences (same rules as backend/src/diff.rs), for "changes since live" and conflicts.

import type { Change } from './api';

export function diff(before: unknown, after: unknown, path = '', out: Change[] = []): Change[] {
  if (before === undefined) {
    out.push({ path, kind: 'added', after });
    return out;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    for (let i = 0; i < Math.max(before.length, after.length); i++) {
      const p = `${path}[${i}]`;
      if (i >= after.length) out.push({ path: p, kind: 'removed', before: before[i] });
      else if (i >= before.length) out.push({ path: p, kind: 'added', after: after[i] });
      else diff(before[i], after[i], p, out);
    }
    return out;
  }
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
    const a = before as Record<string, unknown>;
    const b = after as Record<string, unknown>;
    for (const k of Object.keys(a)) {
      const p = path ? `${path}.${k}` : k;
      if (!(k in b)) out.push({ path: p, kind: 'removed', before: a[k] });
      else diff(a[k], b[k], p, out);
    }
    for (const k of Object.keys(b)) if (!(k in a)) out.push({ path: path ? `${path}.${k}` : k, kind: 'added', after: b[k] });
    return out;
  }
  if (JSON.stringify(before) !== JSON.stringify(after)) out.push({ path, kind: 'changed', before, after });
  return out;
}

export const show = (v: unknown) => (v === undefined ? '—' : typeof v === 'string' ? v.replace(/<[^>]+>/g, ' ').trim() || '(empty)' : JSON.stringify(v));
