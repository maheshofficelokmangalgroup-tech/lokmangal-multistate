// Content collections: lists, the typed editor with drafts, optimistic locking, revisions, approval
// submission and a resolved-rate preview (M06–M13, M15–M16, M21 organisation settings).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { resolveDeep } from '@lokmangal/finance/tokens';
import { Archive, ArchiveRestore, ArrowLeft, FileText, History, Plus, Search, Send } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FieldDiff } from '../components/field-diff';
import { Fields, useRateEntries } from '../components/form-renderer';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  Drawer,
  EmptyState,
  ErrorState,
  ErrorSummary,
  Field,
  InlineAlert,
  Input,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  StatusBadge,
  Table,
  TableSkeleton,
  Tabs,
  Td,
  Textarea,
  Th,
  useToast,
  useUnsavedChangesWarning,
} from '../components/ui';
import { api, ApiError, qs, type ContentDetail, type ContentListItem, type Data, type List, type Revision } from '../lib/api';
import { diff } from '../lib/diff';
import { fmtDateTime, fmtRelative } from '../lib/format';
import { useSession } from '../lib/session';
import { CareersTabs } from './careers';
import { COLLECTION_UI } from './schemas';
import { hasTranslatableFields, MarathiFields, translationProgress } from './translate';

type Meta = { collection: { name: string; label: string; singleton: boolean; requires_approval: boolean; can_edit: boolean } };

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ------------------------------------------------------------------------------------------------
// Lists
// ------------------------------------------------------------------------------------------------

function CreateDialog({ collection, open, onOpenChange }: { collection: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const ui = COLLECTION_UI[collection];
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [data, setData] = useState<Record<string, unknown>>(() => ui?.blank?.() ?? {});
  const [slug, setSlug] = useState('');
  const create = useMutation({
    mutationFn: () => api.post<Data<ContentDetail>>(`/content/${collection}`, { slug: ui.slugField ? undefined : slug || undefined, data }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['content'] });
      onOpenChange(false);
      navigate({ to: '/content/$collection/$id', params: { collection, id: r.data.id } });
    },
  });
  useEffect(() => {
    if (open) {
      setData(ui?.blank?.() ?? {});
      setSlug('');
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!ui) return null;
  const titleGuess = String(data.title ?? data.name ?? '');
  const errors = create.error instanceof ApiError ? create.error.fields : {};
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title="New item"
      description="It is saved as a draft. Nothing changes on the website until it is published."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={create.isPending} onClick={() => create.mutate()}>
            Create draft
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorSummary error={create.error} />
        {!ui.slugField && (
          <Field label="Web address / identifier" help="Lowercase letters, numbers and dashes. Fixed after creation." error={errors.slug}>
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} invalid={invalid} className="font-mono text-[13px]" value={slug} placeholder={slugify(titleGuess)} onChange={(e) => setSlug(e.target.value)} />}
          </Field>
        )}
        <Fields specs={ui.fields} value={data} onChange={setData} errors={errors} />
      </div>
    </Dialog>
  );
}

export function CollectionPage({ collection, title, description, header }: { collection: string; title?: string; description?: ReactNode; header?: ReactNode }) {
  const ui = COLLECTION_UI[collection];
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const navigate = useNavigate();
  const [q, setQ] = useState(search.q ?? '');
  const [creating, setCreating] = useState(false);
  const page = Number(search.page ?? 1);
  const status = search.status ?? '';
  const archived = search.archived === 'true';
  const list = useQuery({
    queryKey: ['content', collection, q, page, status, archived],
    queryFn: () => api.get<List<ContentListItem, Meta>>(`/content/${collection}${qs({ q, page, per_page: 50, status, archived })}`),
    placeholderData: (p) => p,
  });
  const meta = list.data?.meta.collection;

  // Singletons open straight in the editor.
  useEffect(() => {
    if (meta?.singleton && list.data?.data[0]) navigate({ to: '/content/$collection/$id', params: { collection, id: list.data.data[0].id }, replace: true });
  }, [meta?.singleton, list.data, collection, navigate]);

  const setSearch = (patch: Record<string, string | undefined>) => navigate({ to: '.', search: { ...search, page: undefined, ...patch } as never, replace: true });

  return (
    <>
      <PageHeader
        title={title ?? meta?.label ?? 'Content'}
        description={description ?? ui?.description}
        meta={meta?.requires_approval && <Badge tone="warning">Changes need approval by a checker</Badge>}
        actions={
          meta?.can_edit &&
          !meta.singleton &&
          ui?.blank && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              New
            </Button>
          )
        }
      />
      {header}
      <Card padded={false} className={header ? 'mt-5' : undefined}>
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary" aria-hidden />
            <Input aria-label="Search" placeholder="Search" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select aria-label="Status" value={status} onChange={(e) => setSearch({ status: e.target.value || undefined })} className="w-[200px]">
            <option value="">All</option>
            <option value="unreleased">Not yet live</option>
            <option value="draft">Draft</option>
            <option value="in_review">Awaiting approval</option>
            <option value="changes_requested">Changes requested</option>
            <option value="approved">Approved</option>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-brand-primary" checked={archived} onChange={(e) => setSearch({ archived: e.target.checked ? 'true' : undefined })} /> Show archived
          </label>
        </div>
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.isPending || meta?.singleton ? (
          <TableSkeleton />
        ) : list.data.data.length === 0 ? (
          <EmptyState icon={<FileText className="size-5" />} title={q || status ? 'Nothing matches' : 'Nothing here yet'} action={meta?.can_edit && ui?.blank && !q && <Button onClick={() => setCreating(true)}>Create the first one</Button>} />
        ) : (
          <>
            <Table label={meta?.label ?? 'Items'}>
              <thead>
                <tr>
                  <Th>Title</Th>
                  {ui?.listColumns?.map((c) => (
                    <Th key={c.label} className="hidden md:table-cell">
                      {c.label}
                    </Th>
                  ))}
                  <Th>Status</Th>
                  <Th className="hidden sm:table-cell">Updated</Th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((i) => (
                  <tr key={i.id} className="hover:bg-canvas">
                    <Td>
                      <Link to="/content/$collection/$id" params={{ collection, id: i.id }} className="font-medium text-brand-primary hover:underline">
                        {i.title || i.slug}
                      </Link>
                      <span className="block font-mono text-[11px] text-text-secondary">{i.slug}</span>
                    </Td>
                    {ui?.listColumns?.map((c) => (
                      <Td key={c.label} className="hidden md:table-cell">
                        {c.value(i.summary ?? {})}
                      </Td>
                    ))}
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge status={i.draft.status} />
                        {i.archived ? <Badge>Archived</Badge> : i.live_revision === null ? <Badge tone="info">Never published</Badge> : i.unreleased && <Badge tone="brand">Not yet live</Badge>}
                      </div>
                    </Td>
                    <Td className="hidden text-[13px] text-text-secondary sm:table-cell">
                      {fmtRelative(i.draft.updated_at)}
                      {i.draft.updated_by && <span className="block text-[11px]">{i.draft.updated_by}</span>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={list.data.meta.page} perPage={list.data.meta.per_page} total={list.data.meta.total} onPage={(p) => setSearch({ page: String(p) })} />
          </>
        )}
      </Card>
      <CreateDialog collection={collection} open={creating} onOpenChange={setCreating} />
    </>
  );
}

export const DepositsPage = () => <CollectionPage collection="deposit_scheme" title="Deposit schemes" />;
export const LoansPage = () => <CollectionPage collection="loan" title="Loans" />;
export const PostsPage = () => <CollectionPage collection="post" title="Blog and news" />;
export const GalleryPage = () => <CollectionPage collection="gallery_album" title="Gallery" />;
export const BranchesPage = () => <CollectionPage collection="branch" title="Branches" />;
export const RedirectsPage = () => <CollectionPage collection="redirect" title="SEO and redirects" />;
export const HomepagePage = () => <CollectionPage collection="home" title="Homepage" />;
export const NavigationPage = () => <CollectionPage collection="navigation" title="Navigation and footer" />;
export const JobsPage = () => <CollectionPage collection="job_opening" title="Careers" description="Open positions appear on the careers page and in the application form." header={<CareersTabs current="jobs" />} />;

export function CollectionRoutePage() {
  const { collection } = useParams({ strict: false }) as { collection: string };
  if (!COLLECTION_UI[collection]) return <EmptyState title="Unknown content type" />;
  return <CollectionPage key={collection} collection={collection} />;
}

export function NoticesPage() {
  const [tab, setTab] = useState('notice');
  return (
    <>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'notice', label: 'Notices' }, { value: 'document', label: 'Annual reports, member lists and forms' }]} />
      <div className="mt-6">
        <CollectionPage key={tab} collection={tab} title={tab === 'notice' ? 'Notices' : 'Documents'} />
      </div>
    </>
  );
}

const HUB: { collection: string; title: string; text: string }[] = [
  { collection: 'people', title: 'People', text: 'Chairman, mentor and the Board of Directors.' },
  { collection: 'faq', title: 'FAQ', text: 'Questions and answers on the FAQ page.' },
  { collection: 'services', title: 'Other services and Rural Wealth Manager', text: 'Service cards and wealth manager categories.' },
  { collection: 'csr', title: 'Social responsibility', text: 'Pillars and Lokmangal Foundation initiatives.' },
  { collection: 'deposit_page', title: 'Deposit page details', text: 'Documents required, benefits and special categories. Needs approval.' },
  { collection: 'loan_page', title: 'Loan page details', text: 'Loan benefits and extra loan types in the enquiry form. Needs approval.' },
  { collection: 'settings', title: 'Organisation details', text: 'Name, registration, contact details, address and links.' },
];

export function PagesHubPage() {
  const { canAny } = useSession();
  return (
    <>
      <PageHeader title="Pages and people" description="Structured page content. Long-form page text (About, Chairman's message, Terms, Privacy) is part of the reviewed site templates." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {HUB.filter((h) => h.collection !== 'settings' || canAny('settings.manage', 'content.view')).map((h) => (
          <Link key={h.collection} to="/content/$collection" params={{ collection: h.collection }} className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 hover:border-brand-primary/40">
            <p className="font-semibold">{h.title}</p>
            <p className="mt-1 text-[13px] text-text-secondary">{h.text}</p>
          </Link>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------------------
// Editor
// ------------------------------------------------------------------------------------------------

/** Shows product text with the rate placeholders filled in from the current rate set. */
function ResolvedPreview({ collection, data }: { collection: string; data: Record<string, unknown> }) {
  const rates = useRateEntries();
  const result = useMemo(() => {
    if (!rates.data) return null;
    const map = Object.fromEntries(rates.data.entries.map((e) => [e.key, Number(e.value)]));
    const calc = data.calc as { mode: 'fd' | 'rd' | 'monthly'; amount: number; months: number; rateKey: string } | undefined;
    try {
      const resolved = resolveDeep(data, {
        rates: map,
        calc: calc && map[calc.rateKey] !== undefined ? { mode: calc.mode, amount: calc.amount, months: calc.months, rate: map[calc.rateKey] } : undefined,
      });
      return { ok: true as const, resolved };
    } catch (e) {
      return { ok: false as const, message: (e as Error).message };
    }
  }, [rates.data, data]);
  if (rates.isPending) return <Spinner label="Loading rates" />;
  if (!result) return null;
  if (!result.ok) return <InlineAlert tone="danger" title="A placeholder cannot be filled in">{result.message}. Publishing will be blocked until this is fixed.</InlineAlert>;
  const r = result.resolved as Record<string, unknown>;
  const facts = (r.facts as { label: string; value: string }[] | undefined) ?? (r.details as { label: string; value: string }[] | undefined) ?? [];
  return (
    <div className="space-y-2 text-[13px]">
      <p className="text-[11px] text-text-secondary">Using {rates.data?.label}</p>
      {typeof r.pitch === 'string' && <p className="font-medium">{r.pitch}</p>}
      {typeof r.rate === 'string' && <p className="font-medium">Rate: {r.rate}</p>}
      <dl className="space-y-1">
        {facts.map((f, i) => (
          <div key={i} className="flex justify-between gap-3">
            <dt className="text-text-secondary">{f.label}</dt>
            <dd className="text-right tabular">{f.value}</dd>
          </div>
        ))}
      </dl>
      {collection === 'deposit_scheme' && (r.highlight as { label: string; value: string }[] | undefined)?.length ? (
        <p className="text-text-secondary">Highlights: {(r.highlight as { label: string; value: string }[]).map((h) => `${h.label} ${h.value}`).join(' · ')}</p>
      ) : null}
    </div>
  );
}

function RevisionsDrawer({ collection, item, open, onOpenChange, onRestore, canRestore }: { collection: string; item: ContentDetail; open: boolean; onOpenChange: (o: boolean) => void; onRestore: (rev: number) => void; canRestore: boolean }) {
  const list = useQuery({ queryKey: ['revisions', item.id], queryFn: () => api.get<Data<Revision[]>>(`/content/${collection}/${item.id}/revisions`).then((r) => r.data), enabled: open });
  const [viewing, setViewing] = useState<number | null>(null);
  const rev = useQuery({ queryKey: ['revision', item.id, viewing], queryFn: () => api.get<Data<{ data: Record<string, unknown> }>>(`/content/${collection}/${item.id}/revisions/${viewing}`).then((r) => r.data), enabled: viewing !== null });
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Revision history">
      {list.isPending ? (
        <Spinner />
      ) : (
        <ol className="space-y-2">
          {list.data?.map((r) => (
            <li key={r.id} className="rounded-[var(--radius-control)] border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Revision {r.revision}</span>
                <span className="flex gap-1">
                  {r.is_live && <Badge tone="success">Live</Badge>}
                  {r.is_draft && <Badge tone="brand">Current draft</Badge>}
                  <StatusBadge status={r.status} />
                </span>
              </div>
              <p className="mt-1 text-[12px] text-text-secondary">
                {r.created_by ?? 'Import'} · {fmtDateTime(r.updated_at)}
              </p>
              {r.note && <p className="mt-1 text-[12px]">{r.note}</p>}
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => setViewing(viewing === r.revision ? null : r.revision)}>
                  {viewing === r.revision ? 'Hide changes' : 'Compare with draft'}
                </Button>
                {canRestore && !r.is_draft && (
                  <Button size="sm" onClick={() => onRestore(r.revision)}>
                    Restore as new draft
                  </Button>
                )}
              </div>
              {viewing === r.revision && rev.data && (
                <div className="mt-3">
                  <FieldDiff changes={diff(rev.data.data, item.draft.data)} empty="Same as the current draft." />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Drawer>
  );
}

export function ContentEditorPage() {
  const { collection, id } = useParams({ strict: false }) as { collection: string; id: string };
  const ui = COLLECTION_UI[collection];
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const key = ['content-item', collection, id];
  const item = useQuery({ queryKey: key, queryFn: () => api.get<Data<ContentDetail>>(`/content/${collection}/${id}`).then((r) => r.data) });
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [base, setBase] = useState<{ revision_id: string; lock_version: number } | null>(null);
  const [conflict, setConflict] = useState<ContentDetail | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [note, setNote] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [lang, setLang] = useState<'en' | 'mr'>('en');

  useEffect(() => {
    if (item.data && (!base || base.revision_id !== item.data.draft.id || base.lock_version !== item.data.draft.lock_version) && !conflict) {
      setData(item.data.draft.data);
      setBase({ revision_id: item.data.draft.id, lock_version: item.data.draft.lock_version });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.data]);

  const dirty = !!item.data && !!data && JSON.stringify(data) !== JSON.stringify(item.data.draft.data);
  useUnsavedChangesWarning(dirty);

  const applyServer = (d: ContentDetail) => {
    qc.setQueryData(key, d);
    setData(d.draft.data);
    setBase({ revision_id: d.draft.id, lock_version: d.draft.lock_version });
    qc.invalidateQueries({ queryKey: ['content', collection] });
  };

  const save = useMutation({
    mutationFn: () => api.patch<Data<ContentDetail>>(`/content/${collection}/${id}`, { data, revision_id: base!.revision_id, lock_version: base!.lock_version }),
    onSuccess: (r) => {
      applyServer(r.data);
      toast('success', `Draft saved (revision ${r.data.draft.revision}). The website changes only after publishing.`);
    },
    onError: async (e) => {
      if (e instanceof ApiError && e.code === 'edit_conflict') {
        const latest = await api.get<Data<ContentDetail>>(`/content/${collection}/${id}`);
        setConflict(latest.data);
      }
    },
  });
  const submit = useMutation({
    mutationFn: () => api.post<Data<ContentDetail>>(`/content/${collection}/${id}/submit`, { note }),
    onSuccess: (r) => {
      applyServer(r.data);
      setSubmitOpen(false);
      setNote('');
      toast('success', 'Sent for approval. A checker has been notified.');
    },
  });
  const archive = useMutation({
    mutationFn: (archived: boolean) => api.post<Data<ContentDetail>>(`/content/${collection}/${id}/${archived ? 'archive' : 'unarchive'}`),
    onSuccess: (r) => {
      applyServer(r.data);
      setArchiveOpen(false);
      toast('success', r.data.archived ? 'Archived. It disappears from the website with the next release.' : 'Restored from the archive.');
    },
  });
  const restore = useMutation({
    mutationFn: (revision: number) => api.post<Data<ContentDetail>>(`/content/${collection}/${id}/restore`, { revision, revision_id: base!.revision_id, lock_version: base!.lock_version }),
    onSuccess: (r) => {
      applyServer(r.data);
      setHistoryOpen(false);
      toast('success', `Restored into a new draft (revision ${r.data.draft.revision}).`);
    },
  });

  if (!ui) return <EmptyState title="Unknown content type" />;
  if (item.isError) return <ErrorState error={item.error} onRetry={() => item.refetch()} />;
  if (item.isPending || !data) return <TableSkeleton rows={10} />;
  const d = item.data;
  const canEdit = d.allowed.edit && !d.archived;
  const status = d.draft.status;
  const frozen = status === 'in_review' || status === 'approved' || status === 'released';
  const errors = save.error instanceof ApiError ? save.error.fields : submit.error instanceof ApiError ? submit.error.fields : {};
  const sinceLive = diff(d.live?.data, data);
  const progress = translationProgress(ui.fields, data, data.mr);
  const backTo = d.collection_info.singleton ? '/website/pages' : `/content/${collection}`;

  return (
    <>
      <button onClick={() => navigate({ to: backTo })} className="mb-3 inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary">
        <ArrowLeft className="size-4" /> {d.collection_info.singleton ? 'Pages and people' : d.collection_info.label}
      </button>
      <PageHeader
        title={d.collection_info.singleton ? d.collection_info.label : d.title || d.slug}
        description={d.collection_info.singleton ? COLLECTION_UI[collection]?.description : `${d.collection_info.label} · ${d.slug}`}
        meta={
          <>
            <StatusBadge status={status} />
            <Badge>Revision {d.draft.revision}</Badge>
            {d.live ? d.unreleased ? <Badge tone="brand">Live is revision {d.live.revision}</Badge> : <Badge tone="success">This is what's live</Badge> : <Badge tone="info">Never published</Badge>}
            {d.archived && <Badge>Archived</Badge>}
            {dirty && <Badge tone="warning">Unsaved changes</Badge>}
          </>
        }
        actions={
          <>
            <Button icon={<History className="size-4" />} onClick={() => setHistoryOpen(true)}>
              History
            </Button>
            {d.allowed.archive && (
              <Button icon={d.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} onClick={() => (d.archived ? archive.mutate(false) : setArchiveOpen(true))}>
                {d.archived ? 'Unarchive' : 'Archive'}
              </Button>
            )}
            {d.collection_info.requires_approval && canEdit && (
              <Button icon={<Send className="size-4" />} disabled={dirty || !d.allowed.submit} title={dirty ? 'Save the draft first' : !d.allowed.submit ? 'Only drafts can be submitted' : undefined} onClick={() => setSubmitOpen(true)}>
                Submit for approval
              </Button>
            )}
            {canEdit && (
              <Button variant="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
                {frozen ? 'Save as new draft' : 'Save draft'}
              </Button>
            )}
          </>
        }
      />

      {d.approval?.status === 'rejected' && status === 'changes_requested' && (
        <div className="mb-4">
          <InlineAlert tone="danger" title={`Changes requested by ${d.approval.reviewer}`}>
            {d.approval.comment}
          </InlineAlert>
        </div>
      )}
      {status === 'in_review' && (
        <div className="mb-4">
          <InlineAlert tone="warning" title="Waiting for approval">
            Submitted {fmtRelative(d.draft.submitted_at)}. Editing now creates a new draft, and the pending review is withdrawn.
          </InlineAlert>
        </div>
      )}
      {!canEdit && !d.archived && (
        <div className="mb-4">
          <InlineAlert tone="info">You can view this content but your role cannot change it.</InlineAlert>
        </div>
      )}
      {conflict && (
        <div className="mb-4">
          <InlineAlert
            tone="danger"
            title="Someone else saved this item while you were editing"
            action={
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    applyServer(conflict);
                    setConflict(null);
                  }}
                >
                  Use their version
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    qc.setQueryData(key, conflict);
                    setBase({ revision_id: conflict.draft.id, lock_version: conflict.draft.lock_version });
                    setConflict(null);
                  }}
                >
                  Keep mine on top
                </Button>
              </div>
            }
          >
            Revision {conflict.draft.revision} by {conflict.draft.updated_by ?? 'another user'} ({fmtRelative(conflict.draft.updated_at)}). Differences between their version and yours:
            <div className="mt-2">
              <FieldDiff changes={diff(conflict.draft.data, data)} />
            </div>
          </InlineAlert>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <div className="space-y-5">
            <ErrorSummary error={save.error && !conflict ? save.error : submit.error} />
            {hasTranslatableFields(ui.fields) && (
              <Tabs
                value={lang}
                onChange={(v) => setLang(v as 'en' | 'mr')}
                tabs={[
                  { value: 'en', label: 'English' },
                  { value: 'mr', label: `मराठी (${progress.done}/${progress.total})` },
                ]}
              />
            )}
            {lang === 'mr' && hasTranslatableFields(ui.fields) ? (
              <MarathiFields specs={ui.fields} value={data} onChange={setData} disabled={!canEdit} />
            ) : (
              <Fields specs={ui.fields} value={data} onChange={setData} errors={errors} disabled={!canEdit} />
            )}
          </div>
        </Card>
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card title="Summary">
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between gap-2">
                <dt className="text-text-secondary">Last saved</dt>
                <dd>{fmtRelative(d.draft.updated_at)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-text-secondary">By</dt>
                <dd>{d.draft.updated_by ?? 'Import'}</dd>
              </div>
              {d.draft.contributors.length > 0 && (
                <div className="flex justify-between gap-2">
                  <dt className="text-text-secondary">Contributors</dt>
                  <dd className="text-right">{d.draft.contributors.join(', ')}</dd>
                </div>
              )}
              {d.collection_info.requires_approval && (
                <div className="flex justify-between gap-2">
                  <dt className="text-text-secondary">Approval</dt>
                  <dd>{d.approval ? <StatusBadge status={d.approval.status} /> : 'Not submitted'}</dd>
                </div>
              )}
            </dl>
            <Button size="sm" variant="link" className="mt-3" onClick={() => setShowDiff((v) => !v)}>
              {showDiff ? 'Hide' : 'Show'} changes since the live version ({sinceLive.length})
            </Button>
          </Card>
          {COLLECTION_UI[collection] && ['deposit_scheme', 'loan'].includes(collection) && (
            <Card title="How it will read">
              <ResolvedPreview collection={collection} data={data} />
            </Card>
          )}
          <Card title="Publishing">
            <p className="text-[13px] text-text-secondary">
              Saved drafts stay private.{' '}
              {d.collection_info.requires_approval ? 'After approval, publish from the Publish center.' : 'Publish from the Publish center when ready.'}
            </p>
            <Link to="/publish" className="mt-2 inline-block text-[13px] text-brand-primary underline">
              Open the Publish center
            </Link>
          </Card>
        </aside>
      </div>

      {showDiff && (
        <Card title="Changes since the live version" className="mt-6">
          <FieldDiff changes={sinceLive} empty={d.live ? 'The draft matches the live version.' : 'This item has never been published.'} />
        </Card>
      )}

      <Dialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        title="Submit for approval"
        description="A different person with approval rights must review it. You cannot approve your own change."
        footer={
          <>
            <Button onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={submit.isPending} onClick={() => submit.mutate()} disabled={d.collection_info.financial && !note.trim()}>
              Submit
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <ErrorSummary error={submit.error} />
          <Field label="What changed, and the source document" required={d.collection_info.financial} help="For example: “Updated eligibility per Board resolution 14/2027 and the 2027–28 leaflet.”">
            {({ id: fid, describedBy }) => <Textarea id={fid} aria-describedby={describedBy} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
        </div>
      </Dialog>
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive this item?"
        description="It stays on the website until the next release, then disappears. History is kept and it can be unarchived."
        confirmLabel="Archive"
        danger
        loading={archive.isPending}
        onConfirm={() => archive.mutate(true)}
      />
      <RevisionsDrawer collection={collection} item={d} open={historyOpen} onOpenChange={setHistoryOpen} canRestore={canEdit && !dirty} onRestore={(rev) => restore.mutate(rev)} />
    </>
  );
}
