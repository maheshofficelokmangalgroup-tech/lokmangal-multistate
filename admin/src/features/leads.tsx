// Leads inbox and enquiry detail (M03). Filters live in the URL; the server applies branch scope and
// masks contact details for roles that may not see them.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import clsx from 'clsx';
import { ArrowLeft, Copy, Download, Inbox, Mail, Phone, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ErrorSummary,
  Field,
  Input,
  KeyValue,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  Table,
  TableSkeleton,
  Td,
  Textarea,
  Th,
  useToast,
} from '../components/ui';
import { api, ApiError, download, qs, type Branch, type Data, type Lead, type LeadDetail, type LeadStatus, type List } from '../lib/api';
import { fmtDateTime, fmtINR, fmtRelative, isoToIstLocal, istLocalToIso, leadKinds } from '../lib/format';
import { useSession } from '../lib/session';

const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'converted', label: 'Converted' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'spam', label: 'Spam' },
  { value: '', label: 'All' },
];
const STATUS_LABEL: Record<LeadStatus, string> = { new: 'New', contacted: 'Contacted', in_progress: 'In progress', converted: 'Converted', not_interested: 'Not interested', spam: 'Spam' };
const CLOSED: LeadStatus[] = ['converted', 'not_interested', 'spam'];

export function useBranches() {
  return useQuery({ queryKey: ['directory', 'branches'], queryFn: () => api.get<Data<Branch[]>>('/directory/branches').then((r) => r.data), staleTime: 5 * 60_000 });
}

type Filters = Record<string, string | undefined>;

export function LeadsPage() {
  const search = useSearch({ strict: false }) as Filters;
  const navigate = useNavigate();
  const { can } = useSession();
  const toast = useToast();
  const branches = useBranches();
  const [q, setQ] = useState(search.q ?? '');
  const status = search.status ?? 'open';
  const filters = { ...search, status, page: search.page ?? '1', per_page: search.per_page ?? '25' };
  const set = (patch: Filters) => navigate({ to: '/leads', search: { ...search, page: undefined, ...patch } as never, replace: true });
  useEffect(() => {
    const t = setTimeout(() => {
      if ((search.q ?? '') !== q) set({ q: q || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const list = useQuery({
    queryKey: ['leads', filters],
    queryFn: () => api.get<List<Lead, { by_status: Record<string, number>; scope: string }>>(`/leads${qs(filters)}`),
    placeholderData: (prev) => prev,
  });
  const counts = list.data?.meta.by_status ?? {};
  const openCount = (counts.new ?? 0) + (counts.contacted ?? 0) + (counts.in_progress ?? 0);
  const filtered = ['kind', 'branch', 'assignee', 'from', 'to', 'follow_up_due', 'duplicate', 'q'].some((k) => search[k]);

  const exportAs = async (format: 'csv' | 'xlsx') => {
    try {
      await download(`/leads/export${qs({ ...filters, page: undefined, per_page: undefined, format })}`, `enquiries.${format}`);
      toast('success', 'Export downloaded. It has been recorded in the audit log.');
    } catch (e) {
      toast('danger', e instanceof ApiError ? e.message : 'Export failed.');
    }
  };

  return (
    <>
      <PageHeader
        title="Leads"
        description="Enquiries from the website forms."
        meta={list.data && <Badge tone="neutral">{list.data.meta.scope === 'all' ? 'All branches' : 'Your branches only'}</Badge>}
        actions={
          can('leads.export') && (
            <>
              <Button icon={<Download className="size-4" />} onClick={() => exportAs('xlsx')}>
                Export Excel
              </Button>
              <Button onClick={() => exportAs('csv')}>CSV</Button>
            </>
          )
        }
      />
      <Card padded={false}>
        <div className="flex gap-1 overflow-x-auto border-b border-line px-3" role="tablist" aria-label="Status">
          {STATUS_TABS.map((t) => {
            const n = t.value === 'open' ? openCount : t.value === '' ? undefined : counts[t.value];
            const active = status === (t.value || 'all');
            return (
              <button
                key={t.value || 'all'}
                role="tab"
                aria-selected={active}
                onClick={() => set({ status: t.value || 'all' })}
                className={clsx('-mb-px flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap', active ? 'border-brand-primary text-brand-primary' : 'border-transparent text-text-secondary hover:text-text-primary')}
              >
                {t.label}
                {n !== undefined && <span className="rounded-full bg-line-subtle px-1.5 text-[11px] tabular">{n}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary" aria-hidden />
            <Input aria-label="Search by name, phone or reference" placeholder="Name, phone or reference" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Select aria-label="Type" value={search.kind ?? ''} onChange={(e) => set({ kind: e.target.value || undefined })} className="w-[170px]">
            <option value="">All types</option>
            {Object.entries(leadKinds).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Select aria-label="Branch" value={search.branch ?? ''} onChange={(e) => set({ branch: e.target.value || undefined })} className="w-[190px]">
            <option value="">All branches</option>
            {branches.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Assigned to" value={search.assignee ?? ''} onChange={(e) => set({ assignee: e.target.value || undefined })} className="w-[160px]">
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="none">Unassigned</option>
          </Select>
          <label className="flex h-[42px] items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-brand-primary" checked={search.follow_up_due === 'true'} onChange={(e) => set({ follow_up_due: e.target.checked ? 'true' : undefined })} /> Follow-up due
          </label>
          <label className="flex h-[42px] items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-brand-primary" checked={search.duplicate === 'true'} onChange={(e) => set({ duplicate: e.target.checked ? 'true' : undefined })} /> Possible duplicates
          </label>
          {filtered && (
            <Button
              variant="ghost"
              onClick={() => {
                setQ('');
                navigate({ to: '/leads', search: { status } as never });
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.isPending ? (
          <TableSkeleton />
        ) : list.data.data.length === 0 ? (
          filtered ? (
            <EmptyState title="No enquiries match these filters" action={<Button onClick={() => navigate({ to: '/leads', search: { status } as never })}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={<Inbox className="size-5" />} title="No enquiries here yet">
              New website enquiries appear here as soon as they are submitted.
            </EmptyState>
          )
        ) : (
          <>
            <Table label="Enquiries">
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Name</Th>
                  <Th className="hidden md:table-cell">Type</Th>
                  <Th className="hidden lg:table-cell">Branch</Th>
                  <Th>Status</Th>
                  <Th className="hidden lg:table-cell">Assigned</Th>
                  <Th className="hidden md:table-cell">Follow-up</Th>
                  <Th className="hidden sm:table-cell">Received</Th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((l) => (
                  <tr key={l.id} className="hover:bg-canvas">
                    <Td>
                      <Link to="/leads/$id" params={{ id: l.id }} className="font-medium text-brand-primary hover:underline tabular">
                        {l.reference}
                      </Link>
                      {l.possible_duplicate && (
                        <Badge tone="warning" className="ml-2">
                          Possible duplicate
                        </Badge>
                      )}
                    </Td>
                    <Td>
                      <span className="block font-medium">{l.name}</span>
                      <span className="block text-[12px] text-text-secondary tabular">{l.phone}</span>
                    </Td>
                    <Td className="hidden md:table-cell">
                      {leadKinds[l.kind] ?? l.kind}
                      {l.product && <span className="block text-[12px] text-text-secondary">{l.product}</span>}
                    </Td>
                    <Td className="hidden lg:table-cell">{l.branch?.name ?? <span className="text-text-secondary">Not assigned</span>}</Td>
                    <Td>
                      <StatusBadge status={l.status} />
                    </Td>
                    <Td className="hidden lg:table-cell">{l.assignee?.name ?? <span className="text-text-secondary">—</span>}</Td>
                    <Td className="hidden md:table-cell">
                      <span className={clsx(l.follow_up_at && new Date(l.follow_up_at) < new Date() && !CLOSED.includes(l.status) && 'font-medium text-danger')}>{l.follow_up_at ? fmtRelative(l.follow_up_at) : '—'}</span>
                    </Td>
                    <Td className="hidden whitespace-nowrap text-text-secondary sm:table-cell">{fmtDateTime(l.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-between">
              <Pagination page={list.data.meta.page} perPage={list.data.meta.per_page} total={list.data.meta.total} onPage={(p) => set({ page: String(p) })} />
              <Select aria-label="Rows per page" value={String(list.data.meta.per_page)} onChange={(e) => set({ per_page: e.target.value })} className="mr-4 w-[110px]">
                {[25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} rows
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}
      </Card>
    </>
  );
}

function Timeline({ events }: { events: LeadDetail['events'] }) {
  const text = (e: LeadDetail['events'][number]) => {
    switch (e.kind) {
      case 'created':
        return 'Enquiry received from the website';
      case 'status':
        return `Status changed from ${STATUS_LABEL[e.from as LeadStatus] ?? e.from} to ${STATUS_LABEL[e.to as LeadStatus] ?? e.to}`;
      case 'assignee':
        return e.to ? `Assigned to ${e.to}` : 'Unassigned';
      case 'branch':
        return e.to ? `Moved to ${e.to} branch` : 'Branch removed';
      case 'follow_up':
        return e.to ? `Follow-up set for ${fmtDateTime(e.to)}` : 'Follow-up cleared';
      case 'note':
        return 'Note added';
      default:
        return e.kind;
    }
  };
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {events.map((e, i) => (
        <li key={i}>
          <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-white bg-brand-accent" aria-hidden />
          <p className="text-[13px]">{text(e)}</p>
          {e.note && <p className="mt-0.5 rounded-md bg-canvas p-2 text-[12px] text-text-secondary">Reason: {e.note}</p>}
          <p className="text-[11px] text-text-secondary">
            {e.actor ?? 'Website'} · {fmtDateTime(e.at)}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function LeadDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const qc = useQueryClient();
  const toast = useToast();
  const branches = useBranches();
  const lead = useQuery({ queryKey: ['lead', id], queryFn: () => api.get<Data<LeadDetail>>(`/leads/${id}`).then((r) => r.data) });
  const branchId = lead.data?.branch?.id;
  const assignees = useQuery({
    queryKey: ['directory', 'assignees', branchId],
    queryFn: () => api.get<Data<{ id: string; name: string }[]>>(`/directory/assignees${qs({ branch_id: branchId })}`).then((r) => r.data),
    enabled: !!lead.data?.allowed.assign,
  });
  const [note, setNote] = useState('');
  const [reopen, setReopen] = useState<{ status: LeadStatus } | null>(null);
  const [reason, setReason] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [error, setError] = useState<unknown>(null);
  useEffect(() => setFollowUp(isoToIstLocal(lead.data?.follow_up_at)), [lead.data?.follow_up_at]);

  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<Data<LeadDetail>>(`/leads/${id}`, body),
    onSuccess: (r) => {
      qc.setQueryData(['lead', id], r.data);
      qc.invalidateQueries({ queryKey: ['leads'] });
      setError(null);
      toast('success', 'Saved.');
    },
    onError: setError,
  });
  const addNote = useMutation({
    mutationFn: () => api.post(`/leads/${id}/notes`, { body: note }),
    onSuccess: () => {
      setNote('');
      qc.invalidateQueries({ queryKey: ['lead', id] });
      toast('success', 'Note added.');
    },
    onError: setError,
  });

  if (lead.isError) return <ErrorState error={lead.error} onRetry={() => lead.refetch()} />;
  if (lead.isPending) return <TableSkeleton rows={8} />;
  const l = lead.data;
  const closed = CLOSED.includes(l.status);

  const changeStatus = (status: LeadStatus) => {
    if (closed) {
      setReason('');
      setReopen({ status });
    } else update.mutate({ status });
  };

  return (
    <>
      <Link to="/leads" className="mb-3 inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary">
        <ArrowLeft className="size-4" /> Leads
      </Link>
      <PageHeader
        title={<span className="tabular">{l.reference}</span>}
        description={`${leadKinds[l.kind] ?? l.kind}${l.product ? ` · ${l.product}` : ''} · received ${fmtDateTime(l.created_at)}`}
        meta={
          <>
            <StatusBadge status={l.status} />
            {l.possible_duplicate && <Badge tone="warning">Possible duplicate (same phone within 30 days)</Badge>}
            {l.contact_masked && <Badge tone="neutral">Contact details hidden for your role</Badge>}
          </>
        }
        actions={
          l.allowed.update && (
            <Select aria-label="Change status" value={l.status} onChange={(e) => changeStatus(e.target.value as LeadStatus)} className="w-[190px]" disabled={update.isPending}>
              {l.allowed.statuses.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          )
        }
      />
      <ErrorSummary error={error} />
      <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card title="Details">
            <KeyValue
              items={[
                ['Name', l.name],
                [
                  'Phone',
                  <span className="flex items-center gap-2" key="p">
                    <span className="tabular">{l.phone}</span>
                    {!l.contact_masked && (
                      <>
                        <a href={`tel:${l.phone}`} className="text-brand-primary" aria-label="Call">
                          <Phone className="size-4" />
                        </a>
                        <button onClick={() => navigator.clipboard?.writeText(l.phone)} aria-label="Copy phone number" className="text-text-secondary">
                          <Copy className="size-4" />
                        </button>
                      </>
                    )}
                  </span>,
                ],
                ['Email', l.email ? <span className="flex items-center gap-2" key="e">{l.email}{!l.contact_masked && <a href={`mailto:${l.email}`} className="text-brand-primary" aria-label="Email"><Mail className="size-4" /></a>}</span> : '—'],
                ['City', l.city],
                ['Product', l.product],
                ['Loan amount', l.amount ? fmtINR(l.amount) : null],
                ['Message', l.message ? <p className="whitespace-pre-line" key="m">{l.message}</p> : null],
                ['Submitted from', l.source_page],
              ].filter(([, v]) => v !== null && v !== undefined && v !== '') as [React.ReactNode, React.ReactNode][]}
            />
          </Card>
          <Card title={`Notes (${l.notes.length})`}>
            <div className="space-y-3">
              {l.notes.length === 0 && <p className="text-[13px] text-text-secondary">No internal notes yet.</p>}
              {l.notes.map((n) => (
                <div key={n.id} className="rounded-[var(--radius-control)] bg-canvas p-3">
                  <p className="text-sm whitespace-pre-line">{n.body}</p>
                  <p className="mt-1 text-[11px] text-text-secondary">
                    {n.author} · {fmtDateTime(n.created_at)}
                  </p>
                </div>
              ))}
              {l.allowed.update && (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (note.trim()) addNote.mutate();
                  }}
                >
                  <label htmlFor="note" className="sr-only">
                    Add a note
                  </label>
                  <Textarea id="note" placeholder="Add an internal note (not visible to the customer)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} />
                  <Button variant="primary" size="sm" loading={addNote.isPending} disabled={!note.trim()}>
                    Add note
                  </Button>
                </form>
              )}
            </div>
          </Card>
          {l.related.length > 0 && (
            <Card title="Other enquiries from this phone number" padded={false}>
              <ul>
                {l.related.map((r) => (
                  <li key={r.id} className="border-b border-line-subtle last:border-0">
                    <Link to="/leads/$id" params={{ id: r.id }} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-canvas">
                      <span>
                        <span className="font-medium tabular">{r.reference}</span> · {leadKinds[r.kind] ?? r.kind}
                      </span>
                      <StatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card title="Assignment">
            <div className="space-y-4">
              <Field label="Branch">
                {({ id: fid }) => (
                  <Select id={fid} value={l.branch?.id ?? ''} disabled={!l.allowed.assign || update.isPending} onChange={(e) => update.mutate({ branch_id: e.target.value || null })}>
                    <option value="">Not assigned</option>
                    {branches.data
                      ?.filter((b) => b.active)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.region})
                        </option>
                      ))}
                  </Select>
                )}
              </Field>
              <Field label="Assigned to" help={!l.allowed.assign ? 'Your role cannot reassign enquiries.' : undefined}>
                {({ id: fid, describedBy }) => (
                  <Select id={fid} aria-describedby={describedBy} value={l.assignee?.id ?? ''} disabled={!l.allowed.assign || update.isPending} onChange={(e) => update.mutate({ assignee_id: e.target.value || null })}>
                    <option value="">Nobody</option>
                    {l.assignee && !assignees.data?.some((a) => a.id === l.assignee!.id) && <option value={l.assignee.id}>{l.assignee.name}</option>}
                    {assignees.data?.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Next follow-up (IST)">
                {({ id: fid }) => (
                  <div className="flex gap-2">
                    <Input id={fid} type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} disabled={!l.allowed.update || closed} />
                    <Button disabled={!l.allowed.update || closed || followUp === isoToIstLocal(l.follow_up_at)} loading={update.isPending} onClick={() => update.mutate({ follow_up_at: followUp ? istLocalToIso(followUp) : null })}>
                      Save
                    </Button>
                  </div>
                )}
              </Field>
            </div>
          </Card>
          <Card title="Activity">
            <Timeline events={l.events} />
          </Card>
          <Card title="Privacy">
            <KeyValue
              items={[
                ['Consent', l.consent.at ? `${fmtDateTime(l.consent.at)} (${l.consent.version})` : 'Not recorded'],
                ['Kept until', l.retention_until ?? '—'],
              ]}
            />
          </Card>
        </div>
      </div>
      <ConfirmDialog
        open={!!reopen}
        onOpenChange={(o) => !o && setReopen(null)}
        title="Change a closed enquiry"
        description="Closed enquiries keep their history. Explain why the status is changing."
        confirmLabel="Change status"
        confirmDisabled={!reason.trim()}
        loading={update.isPending}
        onConfirm={() => {
          update.mutate({ status: reopen!.status, reason });
          setReopen(null);
        }}
      >
        <Field label="Reason" required>
          {({ id: fid }) => <Textarea id={fid} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </ConfirmDialog>
    </>
  );
}
