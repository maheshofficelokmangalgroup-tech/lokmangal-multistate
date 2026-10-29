// Interest rates (M05): versioned rate sets, a spreadsheet-like editor with inline slab checks, a
// side-by-side comparison, and maker–checker submission. No ordinary "publish" bypasses the checker.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import clsx from 'clsx';
import { ArrowLeft, Copy, Percent, Plus, Send, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, ErrorSummary, Field, InlineAlert, Input, PageHeader, Select, StatusBadge, Table, TableSkeleton, Td, Textarea, Th, useToast, useUnsavedChangesWarning } from '../components/ui';
import { api, ApiError, type Data, type RateEntry, type RateSet, type RateSetSummary } from '../lib/api';
import { fmtDate, fmtRelative, trimRate } from '../lib/format';
import { useSession } from '../lib/session';

const SECTIONS: { key: RateEntry['section']; label: string }[] = [
  { key: 'fd_slab', label: 'Fixed deposit slabs' },
  { key: 'deposit', label: 'Scheme rates' },
  { key: 'doubling', label: 'Doubling plan terms' },
  { key: 'loan', label: 'Loan rates' },
];

export function RateSetsPage() {
  const { can } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['rate-sets'], queryFn: () => api.get<{ data: RateSetSummary[]; meta: { today: string } }>('/rate-sets') });
  const [open, setOpen] = useState(false);
  const current = list.data?.data.find((s) => s.current);
  const [form, setForm] = useState({ from_id: '', label: '', valid_from: '', valid_until: '', source_document: '', change_reason: '' });
  useEffect(() => {
    if (open && current) {
      const nextFrom = current.valid_until;
      const y = Number(nextFrom.slice(0, 4));
      setForm({ from_id: current.id, label: `${y}–${String((y + 1) % 100).padStart(2, '0')}`, valid_from: nextFrom, valid_until: `${y + 1}${nextFrom.slice(4)}`, source_document: '', change_reason: '' });
    }
  }, [open, current]);
  const create = useMutation({
    mutationFn: () => api.post<Data<RateSet>>('/rate-sets', { ...form, from_id: form.from_id || undefined }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['rate-sets'] });
      setOpen(false);
      navigate({ to: '/products/rates/$id', params: { id: r.data.id } });
    },
  });
  return (
    <>
      <PageHeader
        title="Interest rates"
        description="Each rate set covers a period. Every rate on the website — tables, scheme text and calculators — comes from the set in force."
        actions={can('rates.edit') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Prepare next rate set</Button>}
      />
      {current && (
        <div className="mb-6">
          <InlineAlert tone="success" title={`In force today: ${current.label}`}>
            Valid {fmtDate(current.valid_from)} to {fmtDate(current.last_valid_day)}. {current.live ? 'This is what the website shows.' : 'Not yet on the website — publish a release.'}
          </InlineAlert>
        </div>
      )}
      {list.data && !current && (
        <div className="mb-6">
          <InlineAlert tone="danger" title="No approved rate set covers today">The website cannot be republished until one is approved.</InlineAlert>
        </div>
      )}
      <Card padded={false}>
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.isPending ? (
          <TableSkeleton />
        ) : list.data.data.length === 0 ? (
          <EmptyState icon={<Percent className="size-5" />} title="No rate sets yet" />
        ) : (
          <Table label="Rate sets">
            <thead>
              <tr>
                <Th>Rate set</Th>
                <Th>Valid</Th>
                <Th>Status</Th>
                <Th className="hidden md:table-cell">Rates</Th>
                <Th className="hidden md:table-cell">Updated</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.data.map((s) => (
                <tr key={s.id} className="hover:bg-canvas">
                  <Td>
                    <Link to="/products/rates/$id" params={{ id: s.id }} className="font-medium text-brand-primary hover:underline">
                      {s.label}
                    </Link>
                    <span className="block text-[12px] text-text-secondary">Revision {s.revision}</span>
                  </Td>
                  <Td className="tabular">
                    {fmtDate(s.valid_from)} – {fmtDate(s.last_valid_day)}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge status={s.status} />
                      {s.current && <Badge tone="success">In force</Badge>}
                      {s.future && <Badge tone="info">Upcoming</Badge>}
                      {s.expired && <Badge>Expired</Badge>}
                      {s.live && <Badge tone="brand">On the website</Badge>}
                    </div>
                  </Td>
                  <Td className="hidden md:table-cell tabular">{s.entries}</Td>
                  <Td className="hidden text-[13px] text-text-secondary md:table-cell">{fmtRelative(s.updated_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Prepare a new rate set"
        description="It starts as a copy, so you only change the rates that move. The end date is exclusive: 2028-04-01 means rates apply up to 31 March 2028."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={create.isPending} onClick={() => create.mutate()}>
              Create draft
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <ErrorSummary error={create.error} />
          <Field label="Copy rates from">
            {({ id }) => (
              <Select id={id} value={form.from_id} onChange={(e) => setForm({ ...form, from_id: e.target.value })}>
                <option value="">Start empty</option>
                {list.data?.data.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} (revision {s.revision})
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Name" required>{({ id }) => <Input id={id} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valid from" required>{({ id }) => <Input id={id} type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />}</Field>
            <Field label="Valid until (exclusive)" required>{({ id }) => <Input id={id} type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />}</Field>
          </div>
        </div>
      </Dialog>
    </>
  );
}

const tenure = (e: RateEntry) => (e.tenure_max_days === null ? `${e.tenure_min_days} days & above` : `${e.tenure_min_days} – ${e.tenure_max_days} days`);

function ValueInput({ entry, onChange, disabled, changed, error }: { entry: RateEntry; onChange: (v: string) => void; disabled: boolean; changed?: string; error?: string }) {
  return (
    <div>
      <div className="flex items-center gap-1">
        <Input
          aria-label={`${entry.label} value`}
          value={entry.value}
          disabled={disabled}
          invalid={!!error}
          inputMode="decimal"
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
          className={clsx('h-9 w-[92px] text-right tabular', changed !== undefined && 'border-warning bg-warning-soft')}
        />
        <span className="text-[12px] text-text-secondary">{entry.unit === 'percent' ? '%' : 'mo'}</span>
      </div>
      {changed !== undefined && <span className="text-[11px] text-warning">≠ was {changed}</span>}
      {error && <span className="block text-[11px] text-danger">{error}</span>}
    </div>
  );
}

export function RateSetPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['rate-set', id],
    queryFn: () => api.get<Data<RateSet>>(`/rate-sets/${id}`).then((r) => ({ ...r.data, entries: r.data.entries.map((e) => ({ ...e, value: trimRate(e.value, e.unit) })) })),
  });
  const [draft, setDraft] = useState<RateSet | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (q.data) setDraft(q.data);
  }, [q.data]);
  const dirty = !!draft && !!q.data && JSON.stringify(draft) !== JSON.stringify(q.data);
  useUnsavedChangesWarning(dirty);

  const save = useMutation({
    mutationFn: () =>
      api.patch<Data<RateSet>>(`/rate-sets/${id}`, {
        lock_version: draft!.lock_version,
        label: draft!.label,
        valid_from: draft!.valid_from,
        valid_until: draft!.valid_until,
        source_document: draft!.source_document,
        change_reason: draft!.change_reason,
        entries: draft!.entries,
      }),
    onSuccess: (r) => {
      qc.setQueryData(['rate-set', id], r.data);
      qc.invalidateQueries({ queryKey: ['rate-sets'] });
      toast('success', 'Rate set saved as a draft.');
    },
  });
  const submit = useMutation({
    mutationFn: () => api.post<Data<RateSet>>(`/rate-sets/${id}/submit`, { note }),
    onSuccess: (r) => {
      qc.setQueryData(['rate-set', id], r.data);
      qc.invalidateQueries({ queryKey: ['rate-sets'] });
      setSubmitOpen(false);
      toast('success', 'Sent for approval. A checker has been notified.');
    },
  });
  const revise = useMutation({
    mutationFn: () => api.post<Data<RateSet>>(`/rate-sets/${id}/revise`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['rate-sets'] });
      navigate({ to: '/products/rates/$id', params: { id: r.data.id } });
    },
  });

  const previous = useMemo(() => {
    const m = new Map<string, string>();
    const unitOf = (k: string) => q.data?.entries.find((e) => e.key === k)?.unit;
    for (const c of q.data?.comparison.changes ?? []) if (c.kind === 'changed' && c.before) m.set(c.key, trimRate(c.before, unitOf(c.key)));
    return m;
  }, [q.data]);

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isPending || !draft) return <TableSkeleton rows={12} />;
  const s = q.data;
  const editable = s.allowed.edit;
  const errorFor = (key: string) => (save.error instanceof ApiError ? save.error.fields[`entries.${key}`] : undefined) ?? s.validation[`entries.${key}`];
  const setEntry = (key: string, patch: Partial<RateEntry>) => setDraft({ ...draft, entries: draft.entries.map((e) => (e.key === key ? { ...e, ...patch } : e)) });
  const unitOf = (k: string) => draft.entries.find((e) => e.key === k)?.unit;
  const slabs = draft.entries.filter((e) => e.section === 'fd_slab');
  const bands = [...new Map(slabs.map((e) => [`${e.tenure_min_days}-${e.tenure_max_days}`, e])).values()].sort((a, b) => (a.tenure_min_days ?? 0) - (b.tenure_min_days ?? 0));

  return (
    <>
      <Link to="/products/rates" className="mb-3 inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary">
        <ArrowLeft className="size-4" /> Interest rates
      </Link>
      <PageHeader
        title={`Rate set ${s.label}`}
        description={`Revision ${s.revision} · finance policy ${s.finance_policy}`}
        meta={
          <>
            <StatusBadge status={s.status} />
            {dirty && <Badge tone="warning">Unsaved changes</Badge>}
            {s.contributors.length > 0 && <Badge>Prepared by {s.contributors.join(', ')}</Badge>}
          </>
        }
        actions={
          <>
            {s.allowed.revise && (
              <Button icon={<Copy className="size-4" />} loading={revise.isPending} onClick={() => revise.mutate()}>
                Create new revision
              </Button>
            )}
            {s.allowed.submit && (
              <Button icon={<Send className="size-4" />} disabled={dirty} title={dirty ? 'Save first' : undefined} onClick={() => setSubmitOpen(true)}>
                Submit for approval
              </Button>
            )}
            {editable && (
              <Button variant="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
                Save draft
              </Button>
            )}
          </>
        }
      />
      {s.approval?.status === 'rejected' && s.status === 'changes_requested' && (
        <div className="mb-4">
          <InlineAlert tone="danger" title={`Changes requested by ${s.approval.reviewer}`}>{s.approval.comment}</InlineAlert>
        </div>
      )}
      {!editable && (
        <div className="mb-4">
          <InlineAlert tone="info">
            {s.status === 'in_review' ? 'Waiting for an independent checker.' : s.status === 'approved' ? 'Approved rates cannot be edited. Create a new revision to change them.' : 'This rate set cannot be edited.'}
          </InlineAlert>
        </div>
      )}
      <ErrorSummary error={save.error ?? revise.error} />
      <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card title="Period and source">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Name" required>{({ id: fid }) => <Input id={fid} value={draft.label} disabled={!editable} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />}</Field>
              <Field label="Valid from" required>{({ id: fid }) => <Input id={fid} type="date" value={draft.valid_from} disabled={!editable} onChange={(e) => setDraft({ ...draft, valid_from: e.target.value })} />}</Field>
              <Field label="Valid until (exclusive)" required help={`Last valid day: ${fmtDate(s.last_valid_day)}`}>
                {({ id: fid, describedBy }) => <Input id={fid} aria-describedby={describedBy} type="date" value={draft.valid_until} disabled={!editable} onChange={(e) => setDraft({ ...draft, valid_until: e.target.value })} />}
              </Field>
              <Field label="Source document" required className="md:col-span-3" help="The approved leaflet, circular or Board resolution these rates come from." error={s.validation.source_document}>
                {({ id: fid, describedBy, invalid }) => <Input id={fid} aria-describedby={describedBy} invalid={invalid} value={draft.source_document ?? ''} disabled={!editable} onChange={(e) => setDraft({ ...draft, source_document: e.target.value })} />}
              </Field>
              <Field label="Reason for the change" required className="md:col-span-3" error={s.validation.change_reason}>
                {({ id: fid, describedBy, invalid }) => <Textarea id={fid} aria-describedby={describedBy} invalid={invalid} rows={2} value={draft.change_reason ?? ''} disabled={!editable} onChange={(e) => setDraft({ ...draft, change_reason: e.target.value })} />}
              </Field>
            </div>
          </Card>

          <Card title="Fixed deposit slabs" padded={false}>
            <Table label="Fixed deposit slabs">
              <thead>
                <tr>
                  <Th>Tenure</Th>
                  <Th>General depositors</Th>
                  <Th>Special categories</Th>
                </tr>
              </thead>
              <tbody>
                {bands.map((b) => {
                  const cell = (cat: 'regular' | 'special') => slabs.find((e) => e.category === cat && e.tenure_min_days === b.tenure_min_days && e.tenure_max_days === b.tenure_max_days);
                  return (
                    <tr key={`${b.tenure_min_days}-${b.tenure_max_days}`}>
                      <Td className="font-medium whitespace-nowrap">{tenure(b)}</Td>
                      {(['regular', 'special'] as const).map((cat) => {
                        const e = cell(cat);
                        return <Td key={cat}>{e ? <ValueInput entry={e} disabled={!editable} changed={previous.get(e.key)} error={errorFor(e.key)} onChange={(v) => setEntry(e.key, { value: v })} /> : <span className="text-danger">Missing</span>}</Td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {s.validation.entries && <p className="px-4 py-2 text-[12px] text-danger">{s.validation.entries}</p>}
          </Card>

          {SECTIONS.filter((x) => x.key !== 'fd_slab').map((section) => {
            const rows = draft.entries.filter((e) => e.section === section.key);
            return (
              <Card key={section.key} title={section.label} padded={false}>
                {rows.length === 0 ? (
                  <p className="p-4 text-[13px] text-text-secondary">None.</p>
                ) : (
                  <Table label={section.label}>
                    <thead>
                      <tr>
                        <Th>Rate</Th>
                        <Th className="hidden md:table-cell">Key used in content</Th>
                        <Th>Value</Th>
                        {editable && <Th />}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((e) => (
                        <tr key={e.key}>
                          <Td>{editable ? <Input aria-label="Label" value={e.label} onChange={(ev) => setEntry(e.key, { label: ev.target.value })} className="h-9" /> : e.label}</Td>
                          <Td className="hidden font-mono text-[12px] text-text-secondary md:table-cell">{e.key}</Td>
                          <Td>
                            <ValueInput entry={e} disabled={!editable} changed={previous.get(e.key)} error={errorFor(e.key)} onChange={(v) => setEntry(e.key, { value: v })} />
                          </Td>
                          {editable && (
                            <Td>
                              <button className="rounded p-1 text-danger hover:bg-danger-soft" aria-label={`Remove ${e.label}`} onClick={() => window.confirm('Remove this rate? Content that uses it will block publishing.') && setDraft({ ...draft, entries: draft.entries.filter((x) => x.key !== e.key) })}>
                                <Trash2 className="size-4" />
                              </button>
                            </Td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
                {editable && (
                  <div className="border-t border-line-subtle p-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Plus className="size-4" />}
                      onClick={() => {
                        const key = window.prompt('Key for the new rate (lowercase, dots and dashes), e.g. loan.gold');
                        if (!key) return;
                        setDraft({ ...draft, entries: [...draft.entries, { key: key.trim().toLowerCase(), section: section.key, label: key, category: null, tenure_min_days: null, tenure_max_days: null, value: '0', unit: section.key === 'doubling' && key.includes('months') ? 'months' : 'percent', sort_order: draft.entries.length }] });
                      }}
                    >
                      Add rate
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card title={s.comparison.label ? `Compared with ${s.comparison.label}` : 'Changes'}>
            {!s.comparison.label ? (
              <p className="text-[13px] text-text-secondary">There is no earlier rate set to compare with.</p>
            ) : s.comparison.changes.length === 0 ? (
              <p className="text-[13px] text-text-secondary">No differences.</p>
            ) : (
              <ul className="space-y-2 text-[13px]">
                {s.comparison.changes.map((c) => (
                  <li key={c.key} className="flex items-start justify-between gap-2">
                    <span>
                      <span className="block">{c.label}</span>
                      <span className="font-mono text-[11px] text-text-secondary">{c.key}</span>
                    </span>
                    <span className="text-right whitespace-nowrap tabular">
                      {c.kind === 'changed' && (
                        <>
                          <del className="text-text-secondary">{trimRate(c.before, unitOf(c.key))}</del> → <strong>{trimRate(c.after, unitOf(c.key))}</strong>
                        </>
                      )}
                      {c.kind === 'added' && <Badge tone="success">+ {trimRate(c.after, unitOf(c.key))}</Badge>}
                      {c.kind === 'removed' && <Badge tone="danger">− removed</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {dirty && <p className="mt-3 text-[12px] text-warning">Save to refresh the comparison.</p>}
          </Card>
          {Object.keys(s.validation).length > 0 && (
            <InlineAlert tone="warning" title="Fix before submitting">
              <ul className="list-disc pl-4">
                {Object.values(s.validation).map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            </InlineAlert>
          )}
        </aside>
      </div>
      <Dialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        title="Submit rates for approval"
        description="An approver who did not prepare these rates must review them. Approved rates in the future are prepared and go live automatically at 00:00 IST on their first day."
        footer={
          <>
            <Button onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={submit.isPending} onClick={() => submit.mutate()}>
              Submit
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <ErrorSummary error={submit.error} labels={{ source_document: 'Source document', change_reason: 'Reason', entries: 'Rates' }} />
          <Field label="Note for the checker">{({ id: fid }) => <Textarea id={fid} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        </div>
      </Dialog>
    </>
  );
}
