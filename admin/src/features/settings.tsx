// Settings (M21): notifications, privacy, publishing, access, operations and data requests. Secrets
// stay in the deployment environment; the screen only shows whether they are configured.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, ErrorState, ErrorSummary, Field, InlineAlert, Input, KeyValue, PageHeader, PermissionMessage, Select, StatusBadge, Tabs, TabPanel, Textarea, TableSkeleton, useToast } from '../components/ui';
import { api, type Data } from '../lib/api';
import { fmtDateTime, leadKinds } from '../lib/format';
import { useSession } from '../lib/session';

type Values = {
  notifications: { defaultRecipients: string[]; byKind: Record<string, string[]>; applicationRecipients: string[] };
  privacy: { leadRetentionMonths: number; applicationRetentionMonths: number; exportExpiryHours: number };
  publishing: { timezone: string; rateExpiryWarningDays: number; releaseRetention: number; batchSeconds: number };
  access: { idleTimeoutMinutes: number; absoluteTimeoutHours: number; officeNetworks: string[] };
};
type SettingsData = { values: Values; smtp_configured: boolean; activation_driver: string; session: { idle_timeout_minutes: number; absolute_timeout_hours: number } };

const lines = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

function useSave(key: keyof Values) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (value: unknown) => api.put(`/settings/${key}`, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast('success', 'Settings saved.');
    },
  });
}

function NotificationsTab({ v }: { v: Values['notifications'] }) {
  const [form, setForm] = useState({ default: v.defaultRecipients.join('\n'), apps: v.applicationRecipients.join('\n'), byKind: Object.fromEntries(Object.keys(leadKinds).map((k) => [k, (v.byKind[k] ?? []).join('\n')])) as Record<string, string> });
  const save = useSave('notifications');
  const toast = useToast();
  const [test, setTest] = useState('');
  return (
    <Card>
      <div className="space-y-4">
        <ErrorSummary error={save.error} />
        <Field label="Default recipients for enquiries" help="One email per line. Used when a type has no recipients of its own. The chosen branch's email is always added.">
          {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} rows={3} value={form.default} onChange={(e) => setForm({ ...form, default: e.target.value })} />}
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(leadKinds).map(([k, label]) => (
            <Field key={k} label={`${label} enquiries`}>
              {({ id }) => <Textarea id={id} rows={2} value={form.byKind[k]} onChange={(e) => setForm({ ...form, byKind: { ...form.byKind, [k]: e.target.value } })} placeholder="Uses the default recipients" />}
            </Field>
          ))}
        </div>
        <Field label="Job application recipients">{({ id }) => <Textarea id={id} rows={2} value={form.apps} onChange={(e) => setForm({ ...form, apps: e.target.value })} />}</Field>
        <Button
          variant="primary"
          loading={save.isPending}
          onClick={() =>
            save.mutate({
              defaultRecipients: lines(form.default),
              applicationRecipients: lines(form.apps),
              byKind: Object.fromEntries(Object.entries(form.byKind).map(([k, s]) => [k, lines(s)]).filter(([, l]) => (l as string[]).length > 0)),
            })
          }
        >
          Save
        </Button>
        <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
          <Field label="Send a test email to" className="min-w-[240px] flex-1">{({ id }) => <Input id={id} type="email" value={test} onChange={(e) => setTest(e.target.value)} />}</Field>
          <Button onClick={() => api.post('/settings/test-email', { to: test }).then(() => toast('success', 'Test email queued. Check the inbox and Settings → Operations if it does not arrive.')).catch(() => toast('danger', 'Could not queue the test email.'))}>Send test</Button>
        </div>
      </div>
    </Card>
  );
}

function NumberSettings<K extends 'privacy' | 'publishing'>({ k, v, fields }: { k: K; v: Values[K]; fields: { key: keyof Values[K]; label: string; help?: string }[] }) {
  const [form, setForm] = useState(v);
  useEffect(() => setForm(v), [v]);
  const save = useSave(k);
  return (
    <Card>
      <div className="space-y-4">
        <ErrorSummary error={save.error} />
        <div className="grid gap-4 md:grid-cols-3">
          {fields.map((f) => (
            <Field key={String(f.key)} label={f.label} help={f.help}>
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="number" className="tabular" value={String(form[f.key])} onChange={(e) => setForm({ ...form, [f.key]: Number(e.target.value) })} />}
            </Field>
          ))}
        </div>
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(form)}>Save</Button>
      </div>
    </Card>
  );
}

function AccessTab({ v, data }: { v: Values['access']; data: SettingsData }) {
  const [nets, setNets] = useState(v.officeNetworks.join('\n'));
  const save = useSave('access');
  return (
    <Card>
      <div className="space-y-4">
        <ErrorSummary error={save.error} />
        <KeyValue items={[['Idle sign-out', `${data.session.idle_timeout_minutes} minutes`], ['Maximum session', `${data.session.absolute_timeout_hours} hours`], ['Two-step sign-in', 'Required for everyone']]} />
        <Field label="Office networks (optional)" help="One network per line, e.g. 203.0.113.0/24. When set, the admin panel only works from these addresses. Make sure your own address is included.">
          {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} rows={3} className="font-mono text-[13px]" value={nets} onChange={(e) => setNets(e.target.value)} />}
        </Field>
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ ...v, officeNetworks: lines(nets) })}>Save</Button>
      </div>
    </Card>
  );
}

type Status = { jobs: Record<string, number>; oldest_due_job: string | null; recent_failures: { kind: string; error: string | null; at: string }[]; smtp_configured: boolean; backup: { ok: boolean; message: string; at: string } | null; version: { commit: string | null } };

function OperationsTab() {
  const q = useQuery({ queryKey: ['system-status'], queryFn: () => api.get<Data<Status>>('/system/status').then((r) => r.data), refetchInterval: 30_000 });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isPending) return <TableSkeleton />;
  const s = q.data;
  const backupAge = s.backup ? (Date.now() - new Date(s.backup.at).getTime()) / 3600_000 : null;
  return (
    <div className="space-y-4">
      {(!s.backup || !s.backup.ok || (backupAge ?? 99) > 26) && <InlineAlert tone="danger" title="Backups need attention">{s.backup ? `Last backup ${s.backup.ok ? 'succeeded' : 'FAILED'} ${fmtDateTime(s.backup.at)}. ${s.backup.message}` : 'No backup has been reported yet.'}</InlineAlert>}
      {!s.smtp_configured && <InlineAlert tone="warning" title="Email is not configured">Notifications and invitations cannot be sent until SMTP is set up on the server.</InlineAlert>}
      <Card title="Background jobs (last 7 days)">
        <div className="flex flex-wrap gap-2">
          {Object.entries(s.jobs).map(([k, n]) => (
            <span key={k} className="flex items-center gap-1">
              <StatusBadge status={k === 'succeeded' ? 'success' : k} /> <span className="tabular">{n}</span>
            </span>
          ))}
        </div>
        {s.oldest_due_job && <p className="mt-2 text-[13px] text-warning">Oldest waiting job since {fmtDateTime(s.oldest_due_job)}</p>}
        {s.recent_failures.length > 0 && (
          <ul className="mt-3 space-y-1 text-[12px]">
            {s.recent_failures.map((f, i) => (
              <li key={i}>
                <code>{f.kind}</code> — {f.error} <span className="text-text-secondary">({fmtDateTime(f.at)})</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Version">
        <KeyValue items={[['Code version', s.version.commit ?? 'development'], ['Email', s.smtp_configured ? <Badge key="e" tone="success">Configured</Badge> : <Badge key="e" tone="warning">Not configured</Badge>]]} />
      </Card>
    </div>
  );
}

function DataRequestsTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ['data-requests'], queryFn: () => api.get<Data<{ id: string; kind: string; status: string; notes: string | null; created_at: string; completed_at: string | null; created_by: string | null }[]>>('/data-requests').then((r) => r.data) });
  const [form, setForm] = useState({ kind: 'deletion', phone: '', email: '', notes: '' });
  const create = useMutation({
    mutationFn: () => api.post<Data<{ matching_enquiries: number; matching_applications: number }>>('/data-requests', form),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['data-requests'] });
      toast('info', `Recorded. Matching records: ${r.data.matching_enquiries} enquiries, ${r.data.matching_applications} applications.`);
      setForm({ kind: 'deletion', phone: '', email: '', notes: '' });
    },
  });
  const complete = useMutation({
    mutationFn: ({ id, anonymize }: { id: string; anonymize: boolean }) => api.post(`/data-requests/${id}/complete`, { anonymize }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['data-requests'] });
      toast('success', 'Request completed.');
    },
  });
  return (
    <div className="space-y-4">
      <Card title="Record a request from a person about their data">
        <div className="grid gap-4 md:grid-cols-2">
          <ErrorSummary error={create.error ?? complete.error} />
          <Field label="Type">
            {({ id }) => (
              <Select id={id} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="access">Access (send them a copy)</option>
                <option value="correction">Correction</option>
                <option value="deletion">Deletion</option>
              </Select>
            )}
          </Field>
          <Field label="Phone">{({ id }) => <Input id={id} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}</Field>
          <Field label="Email">{({ id }) => <Input id={id} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
          <Field label="Notes">{({ id }) => <Input id={id} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}</Field>
        </div>
        <Button className="mt-4" variant="primary" loading={create.isPending} onClick={() => create.mutate()}>Record request</Button>
      </Card>
      <Card title="Requests" padded={false}>
        <ul className="divide-y divide-line-subtle">
          {list.data?.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <span>
                <strong className="capitalize">{r.kind}</strong> · {fmtDateTime(r.created_at)} by {r.created_by}
                {r.notes && <span className="block text-[12px] text-text-secondary">{r.notes}</span>}
              </span>
              {r.status === 'open' ? (
                <span className="flex gap-2">
                  {r.kind === 'deletion' && <Button size="sm" variant="danger" onClick={() => window.confirm('Remove this person’s details from all enquiries and applications? This cannot be undone.') && complete.mutate({ id: r.id, anonymize: true })}>Delete their data</Button>}
                  <Button size="sm" onClick={() => complete.mutate({ id: r.id, anonymize: false })}>Mark done</Button>
                </span>
              ) : (
                <StatusBadge status="success" />
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function SettingsPage() {
  const { can } = useSession();
  const [tab, setTab] = useState(can('settings.manage') ? 'organisation' : 'operations');
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Data<SettingsData>>('/settings').then((r) => r.data), enabled: can('settings.manage') });
  if (!can('settings.manage') && !can('system.health')) return <PermissionMessage />;
  const tabs = [
    ...(can('settings.manage')
      ? [
          { value: 'organisation', label: 'Organisation' },
          { value: 'notifications', label: 'Notifications' },
          { value: 'privacy', label: 'Privacy' },
          { value: 'publishing', label: 'Publishing' },
          { value: 'access', label: 'Access' },
          { value: 'requests', label: 'Data requests' },
        ]
      : []),
    ...(can('system.health') ? [{ value: 'operations', label: 'Operations' }] : []),
  ];
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs value={tab} onChange={setTab} tabs={tabs}>
        <TabPanel value="organisation">
          <Card>
            <p className="text-sm">Organisation details (name, registration, contact numbers, address, links) are website content, so they are previewed and published like any other change.</p>
            <Link to="/content/$collection" params={{ collection: 'settings' }} className="mt-3 inline-block text-sm text-brand-primary underline">
              Edit organisation details
            </Link>
          </Card>
        </TabPanel>
        {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {q.data && (
          <>
            <TabPanel value="notifications"><NotificationsTab v={q.data.values.notifications} /></TabPanel>
            <TabPanel value="privacy">
              <NumberSettings k="privacy" v={q.data.values.privacy} fields={[
                { key: 'leadRetentionMonths', label: 'Keep enquiries for (months)', help: 'Then contact details and notes are removed automatically.' },
                { key: 'applicationRetentionMonths', label: 'Keep job applications for (months)', help: 'Résumés are deleted with them.' },
                { key: 'exportExpiryHours', label: 'Export links expire after (hours)' },
              ]} />
            </TabPanel>
            <TabPanel value="publishing">
              <NumberSettings k="publishing" v={q.data.values.publishing} fields={[
                { key: 'rateExpiryWarningDays', label: 'Warn before rates expire (days)' },
                { key: 'releaseRetention', label: 'Releases kept for rollback' },
                { key: 'batchSeconds', label: 'Batch window (seconds)' },
              ]} />
            </TabPanel>
            <TabPanel value="access"><AccessTab v={q.data.values.access} data={q.data} /></TabPanel>
            <TabPanel value="requests"><DataRequestsTab /></TabPanel>
          </>
        )}
        <TabPanel value="operations">{can('system.health') ? <OperationsTab /> : <PermissionMessage />}</TabPanel>
      </Tabs>
    </>
  );
}
