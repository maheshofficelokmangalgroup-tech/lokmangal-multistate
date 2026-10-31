// The Marathi tab of the content editor. Translations are stored next to the English text under an "mr" key with
// the same shape, and each list item lines up with the English item at the same position. Staff therefore translate
// the existing items here; adding, removing and reordering happens on the English tab. Anything left empty shows the
// English text on the public site.

import { Fields } from '../components/form-renderer';
import type { FieldSpec } from './schemas';

type Json = Record<string, unknown>;

// The server refuses these in a translation: they are the same in both languages.
const NOT_TRANSLATED = new Set(['slug', 'code', 'rateKey', 'calc', 'kind', 'order', 'id', 'language', 'icon', 'image', 'src', 'photo', 'cover', 'href', 'featured', 'published', 'date']);

const translatable = (s: FieldSpec): boolean => {
  if (s.key && NOT_TRANSLATED.has(s.key)) return false;
  if (s.type === 'text') return !s.mono && s.lang !== 'mr';
  if (s.type === 'textarea') return s.lang !== 'mr';
  if (s.type === 'rich') return true;
  if (s.type === 'group') return s.fields.some(translatable);
  if (s.type === 'list') return s.of === 'string' || (Array.isArray(s.of) && s.of.some(translatable));
  return false;
};

export const hasTranslatableFields = (specs: FieldSpec[]) => specs.some(translatable);

/** How many texts have a Marathi version, to show progress on the tab. */
export function translationProgress(specs: FieldSpec[], en: unknown, mr: unknown): { done: number; total: number } {
  let done = 0;
  let total = 0;
  const walk = (list: FieldSpec[], e: Json, m: Json) => {
    for (const s of list.filter(translatable)) {
      if (s.type === 'group') {
        if (s.key) walk(s.fields, (e[s.key] as Json) ?? {}, (m[s.key] as Json) ?? {});
        else walk(s.fields, e, m);
      } else if (s.type === 'list') {
        const items = (e[s.key] as unknown[]) ?? [];
        const over = (m[s.key] as unknown[]) ?? [];
        items.forEach((item, i) => {
          if (s.of === 'string') {
            if (String(item ?? '').trim()) {
              total++;
              if (String(over[i] ?? '').trim()) done++;
            }
          } else if (Array.isArray(s.of)) walk(s.of, (item as Json) ?? {}, (over[i] as Json) ?? {});
        });
      } else if (String(e[s.key] ?? '').trim()) {
        total++;
        if (String(m[s.key] ?? '').trim()) done++;
      }
    }
  };
  walk(specs, (en as Json) ?? {}, (mr as Json) ?? {});
  return { done, total };
}

const plain = (v: unknown) => String(v ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function EnglishNote({ text }: { text: unknown }) {
  const t = plain(text);
  if (!t) return null;
  return (
    <p className="mt-1 rounded-md bg-neutral-soft px-2.5 py-1.5 text-[13px] leading-snug text-text-secondary">
      <span className="font-semibold">English: </span>
      {t}
    </p>
  );
}

function Level({ specs, en, mr, onChange, disabled, path }: { specs: FieldSpec[]; en: Json; mr: Json; onChange: (v: Json) => void; disabled?: boolean; path: string }) {
  return (
    <>
      {specs.filter(translatable).map((s, idx) => {
        if (s.type === 'group') {
          if (!s.key) {
            return (
              <section key={`g${idx}`} className="space-y-4">
                <h3 className="text-[15px] font-semibold">{s.label}</h3>
                <Level specs={s.fields} en={en} mr={mr} onChange={onChange} disabled={disabled} path={path} />
              </section>
            );
          }
          return (
            <section key={s.key} className="space-y-4">
              <h3 className="text-[15px] font-semibold">{s.label}</h3>
              <Level specs={s.fields} en={(en[s.key] as Json) ?? {}} mr={(mr[s.key] as Json) ?? {}} onChange={(v) => onChange({ ...mr, [s.key]: v })} disabled={disabled} path={`${path}${s.key}.`} />
            </section>
          );
        }
        if (s.type === 'list') {
          const items = (en[s.key] as unknown[]) ?? [];
          const over = (mr[s.key] as unknown[]) ?? [];
          // Positions must line up with the English list, so gaps are filled with empty entries.
          const put = (i: number, v: unknown) => {
            const next = items.map((_, j) => (j === i ? v : (over[j] ?? (s.of === 'string' ? '' : {}))));
            onChange({ ...mr, [s.key]: next });
          };
          return (
            <section key={s.key} className="space-y-3">
              <h3 className="text-[15px] font-semibold">{s.label}</h3>
              {items.length === 0 && <p className="text-[13px] text-text-secondary">Nothing to translate yet. Add items on the English tab.</p>}
              {items.map((item, i) => (
                <div key={i} className="space-y-3 rounded-lg border border-line p-3">
                  <p className="text-[12px] font-semibold text-text-secondary">
                    {i + 1}.{s.itemTitle && Array.isArray(s.of) ? ` ${plain((item as Json)?.[s.itemTitle]).slice(0, 90)}` : ''}
                  </p>
                  {s.of === 'string' ? (
                    <>
                      <EnglishNote text={item} />
                      <Fields specs={[{ type: 'text', key: 'v', label: 'Marathi' }]} value={{ v: over[i] ?? '' }} onChange={(v) => put(i, (v as Json).v ?? '')} errors={{}} disabled={disabled} />
                    </>
                  ) : (
                    <Level specs={s.of as FieldSpec[]} en={(item as Json) ?? {}} mr={(over[i] as Json) ?? {}} onChange={(v) => put(i, v)} disabled={disabled} path={`${path}${s.key}.${i}.`} />
                  )}
                </div>
              ))}
            </section>
          );
        }
        return (
          <div key={s.key} lang="mr">
            <Fields specs={[{ ...s, required: false, optional: true, max: undefined } as FieldSpec]} value={mr} onChange={(v) => onChange(v as Json)} errors={{}} disabled={disabled} path={path.replace(/\.$/, '')} />
            <EnglishNote text={en[s.key]} />
          </div>
        );
      })}
    </>
  );
}

export function MarathiFields({ specs, value, onChange, disabled }: { specs: FieldSpec[]; value: Json; onChange: (v: Json) => void; disabled?: boolean }) {
  const mr = (value.mr as Json) ?? {};
  return (
    <div className="space-y-5">
      <p className="text-[13px] text-text-secondary">Type the Marathi for each text. Anything left empty shows the English text on the Marathi site. To add or remove items, use the English tab.</p>
      <Level specs={specs} en={value} mr={mr} onChange={(v) => onChange({ ...value, mr: v })} disabled={disabled} path="mr." />
    </div>
  );
}
