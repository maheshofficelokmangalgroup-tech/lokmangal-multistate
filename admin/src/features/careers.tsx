// Careers (M04): job applications inbox. Job openings are content (collection "job_opening").

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ArrowLeft, Briefcase, Download, FileText } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, EmptyState, ErrorState, ErrorSummary, Field, KeyValue, PageHeader, Pagination, Select, StatusBadge, Table, TableSkeleton, Tabs, Td, Textarea, Th, useToast } from '../components/ui';
import { api, ApiError, download, qs, type ApplicationDetail, type Application, type Data, type List } from '../lib/api';
import { fmtBytes, fmtDateTime } from '../lib/format';
import { useSession } from '../lib/session';

const LABELS: Record<string, string> = { new: 'New', shortlisted: 'Shortlisted', interview: 'Interview', selected: 'Selected', rejected: 'Rejected' };

function CareersTabs({ current }: { current: 'applications' | 'jobs' }) {
  const navigate = useNavigate();
  const { canAny, can } = useSession();
  const tabs = [
    ...(can('applications.view') ? [{ value: 'applications', label: 'Applications' }] : []),
    ...(canAny('careers.edit', 'content.view') ? [{ value: 'jobs', label: 'Job openings' }] : []),
  ];
  return <Tabs value={current} onChange={(v) => navigate({ to: v === 'jobs' ? '/careers/jobs' : '/careers/applications' })} tabs={tabs} />;
}
export { CareersTabs };

export function ApplicationsPage() {
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const navigate = useNavigate();
  const set = (p: Record<string, string | undefined>) => navigate({ to: '/careers/applications', search: { ...search, page: undefined, ...p } as never, replace: true });
  const list = useQuery({ queryKey: ['applications', search], queryFn: () => api.get<List<Application>>(`/applications${qs(search)}`), placeholderData: (p) => p });
  return (
    <>
      <PageHeader title="Careers" description="Applications from the careers page. Résumés are private and only HR can download them." />
      <CareersTabs current="applications" />
      <Card padded={false} className="mt-5">
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <Select aria-label="Status" value={search.status ?? ''} onChange={(e) => set({ status: e.target.value || undefined })} className="w-[180px]">
            <option value="">All statuses</option>
            {Object.entries(LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.isPending ? (
          <TableSkeleton />
        ) : list.data.data.length === 0 ? (
          <EmptyState icon={<Briefcase className="size-5" />} title="No applications yet" />
        ) : (
          <>
            <Table label="Job applications">
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Applicant</Th>
                  <Th>Position</Th>
                  <Th className="hidden md:table-cell">Experience</Th>
                  <Th>Status</Th>
                  <Th className="hidden sm:table-cell">Received</Th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((a) => (
                  <tr key={a.id} className="hover:bg-canvas">
                    <Td>
                      <Link to="/careers/applications/$id" params={{ id: a.id }} className="font-medium text-brand-primary tabular hover:underline">
                        {a.reference}
                      </Link>
                    </Td>
                    <Td>
                      <span className="block font-medium">{a.name}</span>
                      <span className="block text-[12px] text-text-secondary">{a.city}</span>
                    </Td>
                    <Td>
                      {a.position}
                      {a.has_resume && <FileText className="ml-1.5 inline size-3.5 text-text-secondary" aria-label="Résumé attached" />}
                    </Td>
                    <Td className="hidden md:table-cell">{a.experience_years !== null ? `${a.experience_years} yrs` : '—'}</Td>
                    <Td>
                      <StatusBadge status={a.status} />
                    </Td>
                    <Td className="hidden text-text-secondary sm:table-cell">{fmtDateTime(a.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={list.data.meta.page} perPage={list.data.meta.per_page} total={list.data.meta.total} onPage={(p) => set({ page: String(p) })} />
          </>
        )}
      </Card>
    </>
  );
}

export function ApplicationDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [nextStatus, setNextStatus] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const app = useQuery({ queryKey: ['application', id], queryFn: () => api.get<Data<ApplicationDetail>>(`/applications/${id}`).then((r) => r.data) });
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<Data<ApplicationDetail>>(`/applications/${id}`, body),
    onSuccess: (r) => {
      qc.setQueryData(['application', id], r.data);
      qc.invalidateQueries({ queryKey: ['applications'] });
      setNote('');
      setReason('');
      setNextStatus(null);
      setError(null);
      toast('success', 'Saved.');
    },
    onError: setError,
  });
  if (app.isError) return <ErrorState error={app.error} onRetry={() => app.refetch()} />;
  if (app.isPending) return <TableSkeleton />;
  const a = app.data;
  const decided = a.status === 'selected' || a.status === 'rejected';
  return (
    <>
      <Link to="/careers/applications" className="mb-3 inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary">
        <ArrowLeft className="size-4" /> Applications
      </Link>
      <PageHeader title={<span className="tabular">{a.reference}</span>} description={`${a.position} · received ${fmtDateTime(a.created_at)}`} meta={<StatusBadge status={a.status} />} />
      <ErrorSummary error={error} />
      <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card title="Applicant">
            <KeyValue
              items={[
                ['Name', a.name],
                ['Phone', <span className="tabular" key="p">{a.phone}</span>],
                ['Email', a.email],
                ['City', a.city],
                ['Experience', a.experience_years !== null ? `${a.experience_years} years` : '—'],
                ['About', a.message ? <p className="whitespace-pre-line" key="m">{a.message}</p> : '—'],
              ]}
            />
          </Card>
          <Card title="Résumé">
            {!a.resume ? (
              <p className="text-[13px] text-text-secondary">No résumé was attached.</p>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm">
                  <FileText className="size-5 text-text-secondary" /> {a.resume.name} <span className="text-text-secondary">({fmtBytes(a.resume.size)})</span>
                </span>
                {a.resume.can_download ? (
                  <Button
                    icon={<Download className="size-4" />}
                    onClick={() => download(`/private-files/${a.resume!.id}/download`, 'resume.pdf').catch((e) => toast('danger', e instanceof ApiError ? e.message : 'Download failed.'))}
                  >
                    Download
                  </Button>
                ) : (
                  <span className="text-[12px] text-text-secondary">Only HR can download résumés.</span>
                )}
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          {a.allowed.update && (
            <Card title="Decision">
              <div className="space-y-3">
                <Field label="Status">
                  {({ id: fid }) => (
                    <Select
                      id={fid}
                      value={nextStatus ?? a.status}
                      onChange={(e) => (decided ? setNextStatus(e.target.value) : update.mutate({ status: e.target.value }))}
                    >
                      {a.allowed.statuses.map((s) => (
                        <option key={s} value={s}>
                          {LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {decided && nextStatus && nextStatus !== a.status && (
                  <>
                    <Field label="Reason for reopening" help="Required to change a decided application.">
                      {({ id: fid, describedBy }) => <Textarea id={fid} aria-describedby={describedBy} value={reason} onChange={(e) => setReason(e.target.value)} />}
                    </Field>
                    <Button
                      disabled={!reason.trim()}
                      loading={update.isPending}
                      onClick={() => update.mutate({ status: nextStatus, reason })}
                    >
                      Change status
                    </Button>
                  </>
                )}
                <Field label="Internal note">
                  {({ id: fid }) => <Textarea id={fid} value={note} onChange={(e) => setNote(e.target.value)} />}
                </Field>
                <Button variant="primary" size="sm" disabled={!note.trim()} loading={update.isPending} onClick={() => update.mutate({ note })}>
                  Add note
                </Button>
              </div>
            </Card>
          )}
          <Card title="History">
            <ol className="space-y-3 text-[13px]">
              {a.events.map((e, i) => (
                <li key={i}>
                  {e.kind === 'created' ? 'Application received' : e.kind === 'status' ? `Status: ${LABELS[e.from ?? ''] ?? e.from} → ${LABELS[e.to ?? ''] ?? e.to}` : 'Note'}
                  {e.note && <span className="mt-0.5 block rounded bg-canvas p-2 text-[12px] whitespace-pre-line text-text-secondary">{e.note}</span>}
                  <span className="block text-[11px] text-text-secondary">
                    {e.actor ?? 'Website'} · {fmtDateTime(e.at)}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
