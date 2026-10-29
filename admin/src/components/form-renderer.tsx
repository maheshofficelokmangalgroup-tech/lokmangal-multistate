// Renders a collection's typed form definition over its JSON data. Lists can be reordered with buttons
// (keyboard accessible). Empty optional fields are removed so the stored shape matches the schema.

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ImageIcon, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { MediaPicker } from '../features/media';
import { ICONS, type FieldSpec } from '../features/schemas';
import { api, type Data, type RateSet, type RateSetSummary } from '../lib/api';
import { RichText } from './rich-text';
import { Button, Field, Input, Select, Textarea } from './ui';

type Json = Record<string, unknown>;
type Errors = Record<string, string>;

/** Rate keys from the rate set currently in force (or the newest one), for rate pickers. */
export function useRateEntries() {
  return useQuery({
    queryKey: ['rate-entries', 'current'],
    queryFn: async () => {
      const list = await api.get<{ data: RateSetSummary[] }>('/rate-sets');
      const pick = list.data.find((s) => s.current) ?? list.data.find((s) => s.status === 'approved') ?? list.data[0];
      if (!pick) return { label: null as string | null, entries: [] as RateSet['entries'] };
      const set = await api.get<Data<RateSet>>(`/rate-sets/${pick.id}`);
      return { label: `${set.data.label} (revision ${set.data.revision})`, entries: set.data.entries };
    },
    staleTime: 60_000,
  });
}

function set(obj: Json, key: string, value: unknown, optional?: boolean): Json {
  const next = { ...obj };
  if (optional && (value === '' || value === undefined || value === null || (Array.isArray(value) && value.length === 0))) delete next[key];
  else next[key] = value;
  return next;
}

function TokenHelp() {
  return (
    <span>
      Placeholders: <code>{'{rate:KEY}'}</code> (9.5 → 9.50, 10 → 10), <code>{'{rate2:KEY}'}</code> (two decimals), <code>{'{number:KEY}'}</code>, <code>{'{calc}'}</code>, <code>{'{calc:interest}'}</code>.
    </span>
  );
}

function AssetInput({ value, onChange, accept, id, describedBy, invalid, disabled }: { value: string; onChange: (v: string) => void; accept?: 'image' | 'document'; id: string; describedBy?: string; invalid?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const isImage = accept !== 'document' && /\.(webp|png|jpe?g)$/i.test(value);
  const preview = value.startsWith('/media/') ? `/api/admin/media/files/${value.slice(7)}` : value.startsWith('/images/') ? null : null;
  return (
    <div className="flex items-start gap-3">
      <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-canvas text-text-secondary">
        {isImage && preview ? <img src={preview} alt="" className="size-full object-cover" /> : <ImageIcon className="size-5" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <Input id={id} aria-describedby={describedBy} invalid={invalid} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-[13px]" placeholder="/media/… or /images/…" disabled={disabled} />
        {!disabled && (
          <Button type="button" size="sm" onClick={() => setOpen(true)}>
            Choose from media library
          </Button>
        )}
      </div>
      <MediaPicker open={open} onOpenChange={setOpen} accept={accept} onPick={(url) => onChange(url)} />
    </div>
  );
}

function Leaf({ spec, value, onChange, error, disabled, path }: { spec: Exclude<FieldSpec, { type: 'group' | 'list' }>; value: unknown; onChange: (v: unknown) => void; error?: string; disabled?: boolean; path: string }) {
  const rates = useRateEntries();
  const help = spec.type === 'text' || spec.type === 'textarea' ? (spec.tokens ? <>{spec.help && <>{spec.help} </>}<TokenHelp /></> : spec.help) : spec.help;
  return (
    <Field label={spec.label} required={spec.required} help={help} error={error}>
      {({ id, describedBy, invalid }) => {
        const common = { id, 'aria-describedby': describedBy, invalid, disabled, 'data-path': path };
        switch (spec.type) {
          case 'text':
            return <Input {...common} lang={spec.lang} maxLength={spec.max ? spec.max + 50 : undefined} className={clsx(spec.mono && 'font-mono text-[13px]', spec.lang === 'mr' && 'font-marathi')} placeholder={spec.placeholder} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
          case 'textarea':
            return <Textarea {...common} lang={spec.lang} rows={spec.rows ?? 4} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
          case 'number':
            return <Input {...common} type="number" inputMode="decimal" min={spec.min} max={spec.max} step={spec.step ?? 1} className="tabular" value={value === null || value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? (spec.optional ? undefined : 0) : Number(e.target.value))} />;
          case 'boolean':
            return (
              <label className="flex h-[42px] items-center gap-2 text-sm">
                <input id={id} type="checkbox" aria-describedby={describedBy} disabled={disabled} className="size-4 accent-brand-primary" checked={value === true} onChange={(e) => onChange(spec.optional && !e.target.checked ? undefined : e.target.checked)} /> Yes
              </label>
            );
          case 'select':
            return (
              <Select {...common} value={value === null || value === undefined ? '' : String(value)} onChange={(e) => onChange(spec.numeric ? Number(e.target.value) : e.target.value)}>
                {!spec.required && <option value="">—</option>}
                {spec.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            );
          case 'link':
            return <Input {...common} className="font-mono text-[13px]" placeholder={spec.placeholder ?? '/page-path/ or https://…'} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
          case 'asset':
            return <AssetInput id={id} describedBy={describedBy} invalid={invalid} disabled={disabled} accept={spec.accept} value={(value as string) ?? ''} onChange={(v) => onChange(v)} />;
          case 'rich':
            return <RichText id={id} describedBy={describedBy} invalid={invalid} value={(value as string) ?? ''} onChange={(v) => onChange(v)} />;
          case 'date': {
            const v = (value as string) ?? '';
            return <Input {...common} type="date" value={v.slice(0, 10)} onChange={(e) => onChange(e.target.value ? e.target.value + v.slice(10) : spec.optional ? undefined : '')} />;
          }
          case 'rateKey': {
            const entries = (rates.data?.entries ?? []).filter((e) => !spec.sections || spec.sections.includes(e.section));
            const v = (value as string) ?? '';
            return (
              <Select {...common} value={v} onChange={(e) => onChange(e.target.value || (spec.optional ? null : ''))}>
                <option value="">{spec.optional ? 'None' : 'Choose a rate…'}</option>
                {v && !entries.some((e) => e.key === v) && <option value={v}>{v} (not in the current rate set)</option>}
                {entries.map((e) => (
                  <option key={e.key} value={e.key}>
                    {e.label} — {e.value}
                    {e.unit === 'percent' ? '%' : ' months'} ({e.key})
                  </option>
                ))}
              </Select>
            );
          }
          case 'icon':
            return (
              <>
                <Input {...common} list="icon-names" className="font-mono text-[13px]" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
                <datalist id="icon-names">
                  {ICONS.map((i) => (
                    <option key={i} value={i} />
                  ))}
                </datalist>
              </>
            );
        }
      }}
    </Field>
  );
}

function ListField({ spec, value, onChange, errors, disabled, path }: { spec: Extract<FieldSpec, { type: 'list' }>; value: unknown[]; onChange: (v: unknown[]) => void; errors: Errors; disabled?: boolean; path: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const move = (i: number, d: number) => {
    const next = [...value];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
    setOpen(open === i ? i + d : open);
  };
  const remove = (i: number) => {
    if (!window.confirm('Remove this item?')) return;
    onChange(value.filter((_, j) => j !== i));
  };
  const add = () => {
    const blank = spec.of === 'string' ? '' : spec.of === 'pair' ? ['', ''] : {};
    onChange([...value, blank]);
    setOpen(value.length);
  };
  const full = spec.max !== undefined && value.length >= spec.max;
  return (
    <fieldset className="rounded-[var(--radius-panel)] border border-line">
      <legend className="ml-3 px-1 text-[13px] font-medium">
        {spec.label} <span className="text-text-secondary">({value.length})</span>
      </legend>
      {spec.help && <p className="px-4 text-[12px] text-text-secondary">{spec.help}</p>}
      <ol className="divide-y divide-line-subtle">
        {value.map((item, i) => {
          const controls = !disabled && (
            <span className="flex shrink-0 items-center gap-0.5">
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-text-secondary hover:bg-line-subtle disabled:opacity-30" aria-label={`Move item ${i + 1} up`}>
                <ArrowUp className="size-4" />
              </button>
              <button type="button" disabled={i === value.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-text-secondary hover:bg-line-subtle disabled:opacity-30" aria-label={`Move item ${i + 1} down`}>
                <ArrowDown className="size-4" />
              </button>
              <button type="button" onClick={() => remove(i)} className="rounded p-1 text-danger hover:bg-danger-soft" aria-label={`Remove item ${i + 1}`}>
                <Trash2 className="size-4" />
              </button>
            </span>
          );
          if (spec.of === 'string') {
            return (
              <li key={i} className="flex items-center gap-2 px-3 py-2">
                <span className="w-6 text-right text-[12px] text-text-secondary tabular">{i + 1}.</span>
                <Input aria-label={`${spec.label} ${i + 1}`} value={(item as string) ?? ''} disabled={disabled} onChange={(e) => onChange(value.map((v, j) => (j === i ? e.target.value : v)))} />
                {controls}
              </li>
            );
          }
          if (spec.of === 'pair') {
            const pair = (item as string[]) ?? ['', ''];
            return (
              <li key={i} className="flex items-center gap-2 px-3 py-2">
                <Input aria-label={`English ${i + 1}`} value={pair[0] ?? ''} disabled={disabled} onChange={(e) => onChange(value.map((v, j) => (j === i ? [e.target.value, pair[1] ?? ''].filter((x, k) => k === 0 || x !== '') : v)))} />
                <Input aria-label={`Marathi ${i + 1}`} lang="mr" className="font-marathi" value={pair[1] ?? ''} disabled={disabled} onChange={(e) => onChange(value.map((v, j) => (j === i ? (e.target.value ? [pair[0] ?? '', e.target.value] : [pair[0] ?? '']) : v)))} />
                {controls}
              </li>
            );
          }
          const obj = (item as Json) ?? {};
          const title = (spec.itemTitle && (obj[spec.itemTitle] as string)) || `Item ${i + 1}`;
          const itemPath = `${path}[${i}]`;
          const hasError = Object.keys(errors).some((k) => k.startsWith(itemPath));
          const expanded = open === i || hasError;
          return (
            <li key={i}>
              <div className="flex items-center gap-2 px-3 py-2">
                <button type="button" onClick={() => setOpen(expanded && open === i ? null : i)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm" aria-expanded={expanded}>
                  {expanded ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                  <span className="w-6 text-right text-[12px] text-text-secondary tabular">{i + 1}.</span>
                  <span className={clsx('truncate', hasError && 'text-danger')} dangerouslySetInnerHTML={undefined}>
                    {title.replace(/<[^>]+>/g, '')}
                  </span>
                </button>
                {controls}
              </div>
              {expanded && (
                <div className="space-y-4 border-t border-line-subtle bg-canvas/50 px-4 py-4">
                  <Fields specs={spec.of as FieldSpec[]} value={obj} onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))} errors={errors} disabled={disabled} path={itemPath} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!disabled && (
        <div className="border-t border-line-subtle px-3 py-2">
          <Button type="button" size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={add} disabled={full}>
            {spec.addLabel ?? 'Add'}
            {full && ` (maximum ${spec.max})`}
          </Button>
        </div>
      )}
    </fieldset>
  );
}

/** Field errors from the server are keyed by top-level field names; nested paths are best effort. */
export function Fields({ specs, value, onChange, errors, disabled, path = '' }: { specs: FieldSpec[]; value: Json; onChange: (v: Json) => void; errors: Errors; disabled?: boolean; path?: string }) {
  return (
    <>
      {specs.map((spec, idx) => {
        const p = spec.key ? (path ? `${path}.${spec.key}` : spec.key) : path;
        const err = errors[p] ?? (spec.key ? errors[spec.key] : undefined);
        if (spec.type === 'group') {
          if (!spec.key) {
            return (
              <section key={`g${idx}`} className="space-y-4">
                <h3 className="text-[15px] font-semibold">{spec.label}</h3>
                <Fields specs={spec.fields} value={value} onChange={onChange} errors={errors} disabled={disabled} path={path} />
              </section>
            );
          }
          return (
            <fieldset key={spec.key} className="space-y-4 rounded-[var(--radius-panel)] border border-line p-4">
              <legend className="px-1 text-[13px] font-medium">{spec.label}</legend>
              <Fields specs={spec.fields} value={(value[spec.key] as Json) ?? {}} onChange={(v) => onChange(set(value, spec.key, v))} errors={errors} disabled={disabled} path={p} />
            </fieldset>
          );
        }
        if (spec.type === 'list') {
          return <ListField key={spec.key} spec={spec} value={(value[spec.key] as unknown[]) ?? []} onChange={(v) => onChange(set(value, spec.key, v, spec.optional))} errors={errors} disabled={disabled} path={p} />;
        }
        return <Leaf key={spec.key} spec={spec} path={p} value={value[spec.key]} error={err} disabled={disabled} onChange={(v) => onChange(set(value, spec.key, v, spec.optional))} />;
      })}
    </>
  );
}
