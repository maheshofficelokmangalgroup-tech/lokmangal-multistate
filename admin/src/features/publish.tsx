// Publish center (M18): pending changes, previews, releases with live progress, scheduling and rollback.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import clsx from 'clsx';
import { ArrowLeft, Eye, History, Rocket } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, ErrorState, ErrorSummary, Field, InlineAlert, Input, KeyValue, PageHeader, StatusBadge, Table, TableSkeleton, Tabs, Td, Textarea, Th, useToast } from '../components/ui';
import { api, ApiError, qs, type Data, type Pending, type ReleaseDetail, type ReleaseSummary } from '../lib/api';
import { fmtDate, fmtDateTime, fmtRelative, istLocalToIso } from '../lib/format';
import { useSession } from '../lib/session';

const STEPS = ['queued', 'building', 'validating', 'ready', 'activating', 'live'];

function Progress({ status }: { status: string }) {
  const idx = STEPS.indexOf(status === 'scheduled' ? 'ready' : status);
  if (['failed', 'cancelled', 'superseded'].includes(status)) return <StatusBadge status={status} />;
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[12px]" aria-label="Release progress">
      {STEPS.map((s, i) => (
        <li key={s} className={clsx('flex items-center gap-1', i <= idx ? 'text-brand-hover' : 'text-text-secondary')} aria-current={i === idx ? 'step' : undefined}>
          <span className={clsx('size-2 rounded-full', i < idx ? 'bg-brand-primary' : i === idx ? 'animate-pulse bg-brand-accent' : 'bg-line')} aria-hidden />
          {s}
          {i < STEPS.length - 1 && <span className="mx-0.5 text-line">—</span>}
        </li>
      ))}
    </ol>
  );
}

async function openPreview(id: string) {
  const r = await api.post<Data<{ url: string }>>(`/previews/${id}/access`);
  window.open(r.data.url, '_blank', 'noopener');
}

export function PublishPage() {
  const { can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState('pending');
  const pending = useQuery({ queryKey: ['publish', 'pending'], queryFn: () => api.get<Data<Pending>>('/publish/pending').then((r) => r.data) });
  const releases = useQuery({
    queryKey: ['releases', tab],
    queryFn: () => api.get<Data<ReleaseSummary[]>>(`/releases${qs({ kind: tab === 'previews' ? 'preview' : 'live' })}`).then((r) => r.data),
    enabled: tab !== 'pending',
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => ['queued', 'building', 'validating', 'activating'].includes(r.status)) ? 3000 : false),
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (pending.data) setSelected(new Set(pending.data.items.filter((i) => i.eligible && i.candidate_revision_id).map((i) => i.candidate_revision_id!)));
  }, [pending.data]);
  const [publishOpen, setPublishOpen] = useState(false);
  const [note, setNote] = useState('');
  const [when, setWhen] = useState('');
  const idempotency = useMemo(() => crypto.randomUUID?.() ?? String(Date.now()), [publishOpen]);

  const preview = useMutation({
    mutationFn: () => api.post<Data<{ id: string; warnings: string[] }>>('/previews', { all_drafts: true }),
    onSuccess: (r) => {
      toast('info', 'Preview is being built. Open it from the Previews tab when it is ready.');
      if (r.data.warnings.length) toast('danger', `Preview warnings: ${r.data.warnings.join('; ')}`);
      setTab('previews');
      qc.invalidateQueries({ queryKey: ['releases'] });
    },
    onError: (e) => toast('danger', e instanceof ApiError ? e.message : 'Preview failed.'),
  });
  const publish = useMutation({
    mutationFn: () => api.post<Data<{ id: string }>>('/releases', { revision_ids: [...selected], note: note || undefined, schedule_at: when ? istLocalToIso(when) : undefined, idempotency_key: idempotency }),
    onSuccess: (r) => {
      setPublishOpen(false);
      qc.invalidateQueries({ queryKey: ['publish'] });
      qc.invalidateQueries({ queryKey: ['releases'] });
      toast('info', when ? 'Release is being built and will go live at the scheduled time.' : 'Release is being built. It goes live when every check passes.');
      navigate({ to: '/publish/releases/$id', params: { id: r.data.id } });
    },
  });

  const p = pending.data;
  return (
    <>
      <PageHeader
        title="Publish center"
        description="Saving never changes the website. A release freezes approved content, builds the site, checks it and then switches visitors to it."
        actions={
          <>
            {can('site.preview') && (
              <Button icon={<Eye className="size-4" />} loading={preview.isPending} onClick={() => preview.mutate()}>
                Preview all drafts
              </Button>
            )}
            {can('site.publish') && (
              <Button variant="primary" icon={<Rocket className="size-4" />} disabled={!p || (selected.size === 0 && !p.rates.changed) || p.rates.missing} onClick={() => setPublishOpen(true)}>
                Publish selected
              </Button>
            )}
          </>
        }
      />
      {p && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <p className="text-[13px] text-text-secondary">Live release</p>
            <p className="mt-1 text-lg font-semibold">{p.live ? `#${p.live.number}` : 'Nothing published yet'}</p>
            {p.live && <p className="text-[12px] text-text-secondary">since {fmtDateTime(p.live.activated_at)}</p>}
          </Card>
          <Card>
            <p className="text-[13px] text-text-secondary">Rates on the website</p>
            <p className="mt-1 text-lg font-semibold">{p.live?.rate_set ?? '—'}</p>
            {p.live?.rates_valid_until && <p className="text-[12px] text-text-secondary">valid until {fmtDate(p.live.rates_valid_until)} (exclusive)</p>}
          </Card>
          <Card>
            <p className="text-[13px] text-text-secondary">Rates in force today</p>
            <p className="mt-1 text-lg font-semibold">{p.rates.label ?? <span className="text-danger">None approved</span>}</p>
            {p.rates.changed && <Badge tone="brand">Will be included in the next release</Badge>}
          </Card>
        </div>
      )}
      {p?.rates.missing && (
        <div className="mb-4">
          <InlineAlert tone="danger" title="No approved interest rates cover today">Publishing is blocked until a rate set is approved.</InlineAlert>
        </div>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'pending', label: `Pending changes${p ? ` (${p.items.length})` : ''}` }, { value: 'history', label: 'Releases' }, { value: 'previews', label: 'Previews' }]} />
      <Card padded={false} className="mt-5">
        {tab === 'pending' ? (
          pending.isError ? (
            <ErrorState error={pending.error} onRetry={() => pending.refetch()} />
          ) : pending.isPending ? (
            <TableSkeleton />
          ) : p!.items.length === 0 ? (
            <EmptyState title="Everything is published" />
          ) : (
            <Table label="Pending changes">
              <thead>
                <tr>
                  <Th>
                    <span className="sr-only">Include</span>
                  </Th>
                  <Th>Item</Th>
                  <Th className="hidden md:table-cell">Revision</Th>
                  <Th>State</Th>
                  <Th className="hidden lg:table-cell">Last edited</Th>
                </tr>
              </thead>
              <tbody>
                {p!.items.map((i) => {
                  const id = i.candidate_revision_id;
                  return (
                    <tr key={i.item_id} className={clsx(!i.eligible && 'opacity-80')}>
                      <Td>
                        <input
                          type="checkbox"
                          className="size-4 accent-brand-primary"
                          aria-label={`Include ${i.title}`}
                          disabled={!i.eligible || !id || !can('site.publish')}
                          checked={!!id && selected.has(id)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(id!);
                            else next.delete(id!);
                            setSelected(next);
                          }}
                        />
                      </Td>
                      <Td>
                        <Link to="/content/$collection/$id" params={{ collection: i.collection, id: i.item_id }} className="font-medium text-brand-primary hover:underline">
                          {i.title}
                        </Link>
                        <span className="block text-[12px] text-text-secondary">{i.collection_label}</span>
                        {i.validation && <span className="block text-[12px] text-danger">{i.validation.join('; ')}</span>}
                      </Td>
                      <Td className="hidden text-[13px] md:table-cell">
                        {i.archived ? 'Removal' : `${i.live_revision ? `Live ${i.live_revision} → ` : 'New: '}${i.approved_revision ?? i.draft_revision}`}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap items-center gap-1">
                          <StatusBadge status={i.draft_status} />
                          {i.reason && <span className="text-[12px] text-text-secondary">{i.reason}</span>}
                        </div>
                      </Td>
                      <Td className="hidden text-[13px] text-text-secondary lg:table-cell">
                        {fmtRelative(i.updated_at)} · {i.updated_by ?? 'Import'}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )
        ) : releases.isError ? (
          <ErrorState error={releases.error} onRetry={() => releases.refetch()} />
        ) : releases.isPending ? (
          <TableSkeleton />
        ) : releases.data.length === 0 ? (
          <EmptyState icon={<History className="size-5" />} title={tab === 'previews' ? 'No previews yet' : 'No releases yet'} />
        ) : (
          <Table label="Releases">
            <thead>
              <tr>
                <Th>Release</Th>
                <Th>Progress</Th>
                <Th className="hidden md:table-cell">Requested</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {releases.data.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link to="/publish/releases/$id" params={{ id: r.id }} className="font-medium text-brand-primary hover:underline">
                      #{r.number}
                    </Link>
                    <span className="block text-[12px] text-text-secondary">
                      {r.selected_items} change{r.selected_items === 1 ? '' : 's'} · {r.rate_set ?? '—'}
                      {r.expiry_fallback && ' · expiry notice'}
                    </span>
                    {r.scheduled_for && r.status === 'scheduled' && <span className="block text-[12px] text-warning">Goes live {fmtDateTime(r.scheduled_for)}</span>}
                  </Td>
                  <Td>
                    <Progress status={r.status} />
                    {r.error && <span className="mt-1 block max-w-md truncate text-[12px] text-danger">{r.error}</span>}
                  </Td>
                  <Td className="hidden text-[13px] text-text-secondary md:table-cell">
                    {fmtDateTime(r.requested_at)} · {r.requested_by ?? 'Scheduler'}
                  </Td>
                  <Td className="text-right">
                    {r.kind === 'preview' && r.status === 'ready' && (
                      <Button size="sm" icon={<Eye className="size-4" />} onClick={() => openPreview(r.id).catch((e) => toast('danger', e instanceof ApiError ? e.message : 'Could not open the preview.'))}>
                        Open
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Dialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Publish to the website"
        description={`${selected.size} change${selected.size === 1 ? '' : 's'}${p?.rates.changed ? ' plus the interest rates in force today' : ''}. Everything already live stays as it is.`}
        footer={
          <>
            <Button onClick={() => setPublishOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={publish.isPending} onClick={() => publish.mutate()}>
              {when ? 'Build and schedule' : 'Build and publish'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <ErrorSummary error={publish.error} />
          <Field label="Note" help="Shown in the release history.">{({ id }) => <Textarea id={id} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          <Field label="Go live at (IST, optional)" help="Leave empty to publish as soon as the checks pass.">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />}
          </Field>
        </div>
      </Dialog>
    </>
  );
}

export function ReleasePage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['release', id],
    queryFn: () => api.get<Data<ReleaseDetail>>(`/releases/${id}`).then((r) => r.data),
    refetchInterval: (query) => (['queued', 'building', 'validating', 'activating'].includes(query.state.data?.status ?? '') ? 2500 : false),
  });
  const [confirm, setConfirm] = useState<'activate' | 'cancel' | 'rollback' | null>(null);
  const [reason, setReason] = useState('');
  const act = useMutation({
    mutationFn: (what: 'activate' | 'cancel' | 'rollback') => api.post(`/releases/${id}/${what}`, what === 'rollback' ? { reason } : {}),
    onSuccess: (_, what) => {
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ['release', id] });
      qc.invalidateQueries({ queryKey: ['releases'] });
      toast('info', what === 'cancel' ? 'Release cancelled.' : 'Activation started. This page updates when it is live.');
    },
  });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isPending) return <TableSkeleton />;
  const r = q.data;
  return (
    <>
      <Link to="/publish" className="mb-3 inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary">
        <ArrowLeft className="size-4" /> Publish center
      </Link>
      <PageHeader
        title={`${r.kind === 'preview' ? 'Preview' : 'Release'} #${r.number}`}
        description={r.note ?? undefined}
        meta={<StatusBadge status={r.status} />}
        actions={
          <>
            {r.allowed.open_preview && <Button icon={<Eye className="size-4" />} onClick={() => openPreview(r.id).catch((e) => toast('danger', e instanceof ApiError ? e.message : 'Could not open.'))}>Open preview</Button>}
            {r.allowed.cancel && <Button onClick={() => setConfirm('cancel')}>Cancel release</Button>}
            {r.allowed.rollback && <Button variant="danger" onClick={() => setConfirm('rollback')}>Restore this release</Button>}
            {r.allowed.activate && <Button variant="primary" icon={<Rocket className="size-4" />} onClick={() => setConfirm('activate')}>Publish now</Button>}
          </>
        }
      />
      <div className="mb-6">
        <Progress status={r.status} />
      </div>
      {r.error && (
        <div className="mb-6">
          <InlineAlert tone="danger" title="This release did not go live">{r.error} The previous release is still being served.</InlineAlert>
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card title={`Changes in this release (${r.items.length})`} padded={false}>
            {r.items.length === 0 ? (
              <p className="p-4 text-[13px] text-text-secondary">Same content as before{r.expiry_fallback ? ', with the expired-rates notice' : ''}.</p>
            ) : (
              <ul className="divide-y divide-line-subtle">
                {r.items.map((i) => (
                  <li key={`${i.collection}/${i.slug}`} className="flex justify-between px-5 py-2.5 text-[13px]">
                    <span>
                      {i.collection.replace('_', ' ')} / <span className="font-mono">{i.slug}</span>
                    </span>
                    <span className="text-text-secondary">revision {i.revision}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Build log">
            <pre className="max-h-[420px] overflow-auto rounded-md bg-zinc-950 p-3 text-[12px] leading-relaxed whitespace-pre-wrap text-zinc-100">{r.build_log ?? 'No output yet.'}</pre>
          </Card>
        </div>
        <aside className="space-y-4">
          <Card title="Details">
            <KeyValue
              items={[
                ['Requested', `${fmtDateTime(r.requested_at)} by ${r.requested_by ?? 'Scheduler'}`],
                ['Scheduled for', r.scheduled_for ? fmtDateTime(r.scheduled_for) : '—'],
                ['Went live', r.activated_at ? fmtDateTime(r.activated_at) : '—'],
                ['Pages', r.page_count ?? '—'],
                ['Interest rates', r.rate_set],
                ['Finance policy', r.finance_policy],
                ['Content hash', <code key="h" className="text-[11px] break-all">{r.content_hash}</code>],
                ['Code version', r.source_commit ?? '—'],
              ]}
            />
          </Card>
          <Card title="Activation history">
            {r.events.length === 0 ? (
              <p className="text-[13px] text-text-secondary">Not activated yet.</p>
            ) : (
              <ol className="space-y-2 text-[13px]">
                {r.events.map((e, i) => (
                  <li key={i}>
                    {e.action}: <StatusBadge status={e.outcome === 'live' ? 'live' : e.outcome === 'failed' ? 'failed' : 'queued'} /> {e.actor && `· ${e.actor}`}
                    <span className="block text-[11px] text-text-secondary">{fmtDateTime(e.at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
      <ConfirmDialog
        open={confirm === 'activate'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Publish this release now?"
        description="Visitors are switched to it once the server confirms it is serving the new files."
        confirmLabel="Publish now"
        loading={act.isPending}
        onConfirm={() => act.mutate('activate')}
      />
      <ConfirmDialog open={confirm === 'cancel'} onOpenChange={(o) => !o && setConfirm(null)} title="Cancel this release?" description="It will not go live. Its content stays in the drafts." confirmLabel="Cancel release" danger loading={act.isPending} onConfirm={() => act.mutate('cancel')} />
      <ConfirmDialog
        open={confirm === 'rollback'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Restore release #${r.number}?`}
        description="The website goes back to exactly this release. Enquiries and current drafts are not affected. Releases with rates that are no longer in force cannot be restored."
        confirmLabel="Restore"
        danger
        loading={act.isPending}
        confirmDisabled={!reason.trim()}
        onConfirm={() => act.mutate('rollback')}
      >
        <ErrorSummary error={act.error} />
        <Field label="Reason" required>{({ id: fid }) => <Textarea id={fid} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      </ConfirmDialog>
    </>
  );
}
