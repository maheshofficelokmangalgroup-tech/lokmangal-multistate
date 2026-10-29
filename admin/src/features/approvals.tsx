// Approvals (M17): queue and review. The decision applies to the exact revision shown; reviewers who
// worked on a change are told why they cannot decide it (the database also refuses).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import clsx from 'clsx';
import { ArrowLeft, CheckSquare } from 'lucide-react';
import { useState } from 'react';
import { FieldDiff } from '../components/field-diff';
import { Badge, Button, Card, EmptyState, ErrorState, ErrorSummary, Field, InlineAlert, KeyValue, PageHeader, StatusBadge, Table, TableSkeleton, Tabs, Td, Textarea, Th, useToast } from '../components/ui';
import { api, ApiError, type ApprovalDetail, type ApprovalSummary, type Data } from '../lib/api';
import { fmtDate, fmtDateTime, fmtRelative, trimRate } from '../lib/format';

export function ApprovalsPage() {
  const [tab, setTab] = useState('pending');
  const list = useQuery({ queryKey: ['approvals', tab], queryFn: () => api.get<Data<ApprovalSummary[]>>(`/approvals?status=${tab === 'pending' ? 'pending' : 'decided'}`).then((r) => r.data) });
  return (
    <>
      <PageHeader title="Approvals" description="Rates, schemes and loans need an independent checker. You cannot approve a change you worked on." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'pending', label: 'Waiting' }, { value: 'decided', label: 'Decided' }]} />
      <Card padded={false} className="mt-5">
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.isPending ? (
          <TableSkeleton />
        ) : list.data.length === 0 ? (
          <EmptyState icon={<CheckSquare className="size-5" />} title={tab === 'pending' ? 'Nothing is waiting for review' : 'No decisions yet'} />
        ) : (
          <Table label="Approvals">
            <thead>
              <tr>
                <Th>Change</Th>
                <Th className="hidden md:table-cell">Submitted by</Th>
                <Th>{tab === 'pending' ? 'Waiting since' : 'Decision'}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((a) => (
                <tr key={a.id} className="hover:bg-canvas">
                  <Td>
                    <Link to="/approvals/$id" params={{ id: a.id }} className="font-medium text-brand-primary hover:underline">
                      {a.title}
                    </Link>
                    {a.financial && <Badge tone="warning" className="ml-2">Financial</Badge>}
                    {a.note && <span className="block max-w-xl truncate text-[12px] text-text-secondary">{a.note}</span>}
                  </Td>
                  <Td className="hidden md:table-cell">{a.mine ? 'You' : a.submitted_by}</Td>
                  <Td>{tab === 'pending' ? fmtRelative(a.submitted_at) : <span className="flex items-center gap-2"><StatusBadge status={a.status} /> {a.reviewer}</span>}</Td>
                  <Td className="text-right">
                    {tab === 'pending' && (a.can_decide ? <Badge tone="brand">Your review</Badge> : a.mine ? <Badge>Your submission</Badge> : <Badge>Someone else</Badge>)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

export function ApprovalPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [comment, setComment] = useState('');
  const q = useQuery({ queryKey: ['approval', id], queryFn: () => api.get<Data<ApprovalDetail>>(`/approvals/${id}`).then((r) => r.data) });
  const decide = useMutation({
    mutationFn: (approve: boolean) => api.post<Data<{ status: string; prepared_future_release: boolean }>>(`/approvals/${id}/${approve ? 'approve' : 'reject'}`, { comment }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['approval', id] });
      toast('success', r.data.status === 'approved' ? (r.data.prepared_future_release ? 'Approved. A release is being prepared for the start date.' : 'Approved. It can now be published from the Publish center.') : 'Sent back with your comments.');
      navigate({ to: '/approvals' });
    },
    onError: () => qc.invalidateQueries({ queryKey: ['approval', id] }),
  });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isPending) return <TableSkeleton rows={10} />;
  const a = q.data;
  const r = a.review;
  return (
    <>
      <Link to="/approvals" className="mb-3 inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary">
        <ArrowLeft className="size-4" /> Approvals
      </Link>
      <PageHeader title={a.title} description={`Submitted by ${a.submitted_by} ${fmtRelative(a.submitted_at)}`} meta={<><StatusBadge status={a.status} />{a.financial && <Badge tone="warning">Financial change</Badge>}</>} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {a.note && (
            <Card title="Maker's explanation">
              <p className="text-sm whitespace-pre-line">{a.note}</p>
            </Card>
          )}
          {a.warnings.length > 0 && (
            <InlineAlert tone="warning" title="Check before approving">
              <ul className="list-disc pl-4">
                {a.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </InlineAlert>
          )}
          {r.kind === 'rate_set' ? (
            <>
              <Card title="Period and source">
                <KeyValue
                  items={[
                    ['Valid', `${fmtDate(r.valid_from)} until ${fmtDate(r.valid_until)} (exclusive)`],
                    ['Source document', r.source_document],
                    ['Reason', r.change_reason],
                    ['Compared with', r.compared_with ?? 'Nothing (first rate set)'],
                  ]}
                />
              </Card>
              <Card title={`Changed rates (${r.changes.length})`} padded={false}>
                {r.changes.length === 0 ? (
                  <p className="p-4 text-[13px] text-text-secondary">No rate differs from the comparison set.</p>
                ) : (
                  <Table label="Changed rates">
                    <thead>
                      <tr>
                        <Th>Rate</Th>
                        <Th>Change</Th>
                        <Th>Before</Th>
                        <Th>After</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.changes.map((c) => (
                        <tr key={c.key}>
                          <Td>
                            {c.label}
                            <span className="block font-mono text-[11px] text-text-secondary">{c.key}</span>
                          </Td>
                          <Td>{c.kind === 'changed' ? '≠ Changed' : c.kind === 'added' ? '+ Added' : '− Removed'}</Td>
                          <Td className="tabular">{c.before !== undefined ? trimRate(c.before, r.entries.find((e) => e.key === c.key)?.unit) : '—'}</Td>
                          <Td className={clsx('tabular font-semibold', c.kind !== 'removed' && 'text-brand-hover')}>{c.after !== undefined ? trimRate(c.after, r.entries.find((e) => e.key === c.key)?.unit) : '—'}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
              <details className="rounded-[var(--radius-panel)] border border-line bg-surface p-4">
                <summary className="cursor-pointer text-sm font-medium">All {r.entries.length} rates in this set</summary>
                <ul className="mt-3 grid gap-1 text-[13px] md:grid-cols-2">
                  {r.entries.map((e) => (
                    <li key={e.key} className="flex justify-between gap-2 border-b border-line-subtle py-1">
                      <span>{e.label}</span>
                      <span className="tabular">
                        {trimRate(e.value, e.unit)}
                        {e.unit === 'percent' ? '%' : ' mo'}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          ) : (
            <Card title={`Changes since the live version (${r.changes.length})`}>
              <FieldDiff changes={r.changes} empty="Identical to the live version." />
              <Link to="/content/$collection/$id" params={{ collection: r.collection, id: r.item_id }} className="mt-3 inline-block text-[13px] text-brand-primary underline">
                Open the item
              </Link>
            </Card>
          )}
        </div>
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card title="Decision">
            {a.status !== 'pending' ? (
              <KeyValue items={[['Decision', <StatusBadge key="s" status={a.status} />], ['Reviewer', a.reviewer], ['When', fmtDateTime(a.decided_at)], ['Comment', a.comment]]} />
            ) : a.can_decide ? (
              <div className="space-y-3">
                <ErrorSummary error={decide.error} />
                {decide.error instanceof ApiError && decide.error.code === 'stale_review' && <InlineAlert tone="warning">The change was edited after submission. Reload to review the new version.</InlineAlert>}
                <Field label="Comment" help="Required when sending back. Kept in the history.">
                  {({ id: fid, describedBy }) => <Textarea id={fid} aria-describedby={describedBy} value={comment} onChange={(e) => setComment(e.target.value)} />}
                </Field>
                <div className="flex flex-col gap-2">
                  <Button variant="primary" loading={decide.isPending && decide.variables === true} onClick={() => decide.mutate(true)}>
                    Approve this revision
                  </Button>
                  <Button variant="danger" disabled={!comment.trim()} loading={decide.isPending && decide.variables === false} onClick={() => decide.mutate(false)}>
                    Send back for changes
                  </Button>
                </div>
              </div>
            ) : (
              <InlineAlert tone="info">{a.blocked_reason}</InlineAlert>
            )}
          </Card>
          <Card title="People">
            <KeyValue items={[['Maker', a.submitted_by], ['Contributors', a.contributors.join(', ') || '—']]} />
          </Card>
        </aside>
      </div>
    </>
  );
}
