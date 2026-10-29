// Dashboard (M02): what needs attention, and whether the public site is current. Every number links to
// the filtered list behind it and respects the user's scope.

import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, CalendarClock, CheckSquare, Inbox, Rocket, UploadCloud } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Select, Skeleton, StatusBadge } from '../components/ui';
import { api, qs, type Data } from '../lib/api';
import { fmtDate, fmtDateTime, fmtRelative, humanize, leadKinds } from '../lib/format';
import { useSession } from '../lib/session';

type Dashboard = {
  range: { from: string; to: string };
  scope: 'all' | 'own_branches' | 'none';
  leads?: {
    new: number;
    follow_ups_due: number;
    unhandled: number;
    series: { day: string; kind: string; count: number }[];
    by_branch: { branch: string; count: number }[];
    due: { id: string; reference: string; name: string; kind: string; follow_up_at: string | null }[];
  };
  approvals_pending?: number;
  unreleased_changes?: number;
  applications_new?: number;
  publishing: {
    live: { number: number; activated_at: string | null; rate_set: string | null } | null;
    rates_valid_until: string | null;
    rates_days_left: number | null;
    last_build: { number: number; status: string; at: string; error: string | null } | null;
    scheduled: number;
  };
  activity: { at: string; action: string; entity_type: string | null; entity_id: string | null; actor: string | null }[];
};

const KIND_COLORS: Record<string, string> = { loan: '#c2410c', deposit: '#ea580c', account: '#9a3412', callback: '#f59e0b', contact: '#52525b', service: '#a1a1aa' };

function Metric({ label, value, hint, to, icon, tone = 'default' }: { label: string; value?: number; hint?: string; to: string; icon: React.ReactNode; tone?: 'default' | 'warning' }) {
  return (
    <Link to={to} className="group rounded-[var(--radius-panel)] border border-line bg-surface p-5 transition-colors hover:border-brand-primary/40">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-text-secondary">{label}</span>
        <span className={tone === 'warning' ? 'text-warning' : 'text-brand-primary'}>{icon}</span>
      </div>
      <p className="mt-2 text-[30px] leading-none font-semibold tabular">{value ?? '—'}</p>
      {hint && <p className="mt-2 text-[12px] text-text-secondary group-hover:text-brand-primary">{hint}</p>}
    </Link>
  );
}

function LeadsChart({ series }: { series: NonNullable<Dashboard['leads']>['series'] }) {
  const { rows, kinds } = useMemo(() => {
    const byDay = new Map<string, Record<string, number | string>>();
    const kinds = new Set<string>();
    for (const s of series) {
      kinds.add(s.kind);
      const row = byDay.get(s.day) ?? { day: s.day };
      row[s.kind] = s.count;
      byDay.set(s.day, row);
    }
    return { rows: [...byDay.values()], kinds: [...kinds] };
  }, [series]);
  if (rows.length === 0) return <EmptyState title="No enquiries in this period" />;
  return (
    <>
      <div className="h-[260px]" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#f4f4f5" />
            <XAxis dataKey="day" tickFormatter={(d: string) => fmtDate(d).slice(0, 6)} tick={{ fontSize: 12, fill: '#52525b' }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#52525b' }} axisLine={false} tickLine={false} />
            <Tooltip labelFormatter={(d) => fmtDate(String(d))} formatter={(v, k) => [v as number, leadKinds[String(k)] ?? String(k)]} />
            <Legend formatter={(k: string) => leadKinds[k] ?? k} wrapperStyle={{ fontSize: 12 }} />
            {kinds.map((k) => (
              <Bar key={k} dataKey={k} stackId="a" fill={KIND_COLORS[k] ?? '#a1a1aa'} radius={[2, 2, 0, 0]} maxBarSize={36} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-[13px]">
        <summary className="cursor-pointer text-text-secondary">View as a table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th className="py-1 pr-3 font-medium">Day</th>
              {kinds.map((k) => (
                <th key={k} className="py-1 pr-3 font-medium">
                  {leadKinds[k] ?? k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.day)}>
                <td className="py-1 pr-3">{fmtDate(String(r.day))}</td>
                {kinds.map((k) => (
                  <td key={k} className="py-1 pr-3 tabular">
                    {r[k] ?? 0}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

export function DashboardPage() {
  const { me, can } = useSession();
  const [range, setRange] = useState('7d');
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['dashboard', range], queryFn: () => api.get<Data<Dashboard>>(`/dashboard${qs({ range })}`).then((r) => r.data) });
  const d = q.data;
  const days = d?.publishing.rates_days_left;
  const rateWarning = days !== null && days !== undefined && days <= 30;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${me.name.split(' ')[0]}.`}
        meta={d && <Badge tone="neutral">{d.scope === 'all' ? 'All branches' : d.scope === 'own_branches' ? `Your branches: ${me.branches.map((b) => b.name).join(', ') || 'none assigned'}` : 'No enquiry access'}</Badge>}
        actions={
          <>
            <label className="sr-only" htmlFor="range">
              Period
            </label>
            <Select id="range" value={range} onChange={(e) => setRange(e.target.value)} className="w-[150px]">
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </Select>
            {can('site.publish') && (
              <Button variant="primary" icon={<Rocket className="size-4" />} onClick={() => navigate({ to: '/publish' })}>
                Publish website
              </Button>
            )}
          </>
        }
      />

      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}

      {rateWarning && (
        <div className={`mb-6 flex items-start gap-3 rounded-[var(--radius-panel)] border p-4 ${days! <= 7 ? 'border-red-200 bg-danger-soft text-danger' : 'border-amber-200 bg-warning-soft text-warning'}`} role="status">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold">{days! <= 0 ? 'Published interest rates have expired' : `Published interest rates expire in ${days} day${days === 1 ? '' : 's'}`}</p>
            <p>
              Valid until {fmtDate(d?.publishing.rates_valid_until)} (exclusive). <Link to="/products/rates" className="underline">Prepare the next rate set</Link>.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {q.isPending ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[120px]" />)
        ) : (
          <>
            {d?.leads && <Metric label="New enquiries" value={d.leads.new} hint="Open the leads inbox" to="/leads" icon={<Inbox className="size-5" />} />}
            {d?.leads && <Metric label="Follow-ups due" value={d.leads.follow_ups_due} hint="Due today or tomorrow" to="/leads?follow_up_due=true" icon={<CalendarClock className="size-5" />} tone={d.leads.follow_ups_due > 0 ? 'warning' : 'default'} />}
            {d?.approvals_pending !== undefined && <Metric label="Waiting for your review" value={d.approvals_pending} hint="Open approvals" to="/approvals" icon={<CheckSquare className="size-5" />} />}
            {d?.unreleased_changes !== undefined && <Metric label="Changes not yet live" value={d.unreleased_changes} hint="Open the publish center" to="/publish" icon={<UploadCloud className="size-5" />} />}
            {d?.applications_new !== undefined && <Metric label="New job applications" value={d.applications_new} hint="Open applications" to="/careers/applications" icon={<Inbox className="size-5" />} />}
          </>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {d?.leads && (
          <Card title="Enquiries over time">
            <LeadsChart series={d.leads.series} />
          </Card>
        )}
        {d?.leads && (
          <Card title="Enquiries by branch">
            {d.leads.by_branch.length === 0 ? (
              <EmptyState title="No enquiries in this period" />
            ) : (
              <ol className="space-y-3">
                {d.leads.by_branch.map((b) => {
                  const max = d.leads!.by_branch[0].count || 1;
                  return (
                    <li key={b.branch}>
                      <div className="flex justify-between text-[13px]">
                        <span className="truncate">{b.branch}</span>
                        <span className="font-semibold tabular">{b.count}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-line-subtle" aria-hidden>
                        <div className="h-2 rounded-full bg-brand-accent" style={{ width: `${(b.count / max) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {d?.leads && (
          <Card title="Follow-ups" actions={<Link to="/leads" search={{ follow_up_due: 'true' } as never} className="text-[13px] text-brand-primary hover:underline">All</Link>} padded={false}>
            {d.leads.due.length === 0 ? (
              <EmptyState title="Nothing due" />
            ) : (
              <ul>
                {d.leads.due.map((l) => (
                  <li key={l.id} className="border-b border-line-subtle last:border-0">
                    <Link to="/leads/$id" params={{ id: l.id }} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-canvas">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{l.name}</span>
                        <span className="block text-[12px] text-text-secondary">
                          {l.reference} · {leadKinds[l.kind] ?? l.kind}
                        </span>
                      </span>
                      <span className="text-[12px] whitespace-nowrap text-text-secondary">{fmtRelative(l.follow_up_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        <Card title="Website releases">
          {d ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Live release</span>
                <span>{d.publishing.live ? `#${d.publishing.live.number} · ${fmtRelative(d.publishing.live.activated_at)}` : 'Nothing published yet'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Interest rates</span>
                <span>{d.publishing.live?.rate_set ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Last build</span>
                <span>{d.publishing.last_build ? <StatusBadge status={d.publishing.last_build.status} /> : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Scheduled releases</span>
                <span className="tabular">{d.publishing.scheduled}</span>
              </div>
              {d.publishing.last_build?.error && <p className="rounded-md bg-danger-soft p-2 text-[12px] text-danger">{d.publishing.last_build.error}</p>}
            </div>
          ) : (
            <Skeleton className="h-28" />
          )}
        </Card>
        <Card title="Recent activity" padded={false}>
          {(d?.activity ?? []).length === 0 ? (
            <EmptyState title="No recent activity" />
          ) : (
            <ul>
              {d!.activity.map((a, i) => (
                <li key={i} className="border-b border-line-subtle px-5 py-2.5 text-[13px] last:border-0">
                  <span className="font-medium">{a.actor ?? 'System'}</span> <span>{humanize(a.action)}</span>
                  {a.entity_type && <span className="text-text-secondary"> · {humanize(a.entity_type)}</span>}
                  <span className="block text-[11px] text-text-secondary" title={fmtDateTime(a.at)}>
                    {fmtRelative(a.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
