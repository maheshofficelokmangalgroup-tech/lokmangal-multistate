// The signed-in user's own security: password, recovery codes and sessions.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge, Button, Card, ErrorSummary, Field, InlineAlert, Input, PageHeader, Spinner, useToast } from '../components/ui';
import { api, ApiError, type Data } from '../lib/api';
import { fmtDateTime, fmtRelative } from '../lib/format';
import { useSession } from '../lib/session';

type Session = { id: string; current: boolean; created_at: string; last_seen_at: string; expires_at: string; ip: string | null; device: string };

export function AccountSecurityPage() {
  const { me } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<Data<Session[]>>('/auth/sessions').then((r) => r.data) });
  const revoke = useMutation({ mutationFn: (id: string) => api.post(`/auth/sessions/${id}/revoke`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }); toast('success', 'Signed out of that device.'); } });
  const revokeOthers = useMutation({ mutationFn: () => api.post<Data<{ revoked: number }>>('/auth/sessions/revoke-others'), onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['sessions'] }); toast('success', `Signed out of ${r.data.revoked} other session(s).`); } });
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const change = useMutation({ mutationFn: () => api.post('/auth/password', { current_password: pw.current_password, new_password: pw.new_password }), onSuccess: () => { setPw({ current_password: '', new_password: '', confirm: '' }); toast('success', 'Password changed. Other sessions were signed out.'); } });
  const [codes, setCodes] = useState<string[] | null>(null);
  const regen = useMutation({ mutationFn: () => api.post<Data<{ recovery_codes: string[] }>>('/auth/recovery-codes'), onSuccess: (r) => setCodes(r.data.recovery_codes) });
  const fieldErr = (k: string) => (change.error instanceof ApiError ? change.error.fields[k] : undefined);

  return (
    <>
      <PageHeader title="Security and sessions" description={`${me.name} · ${me.email}`} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Change password">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              change.mutate();
            }}
          >
            <ErrorSummary error={change.error} />
            <Field label="Current password" required error={fieldErr('current_password')}>{({ id, invalid }) => <Input id={id} type="password" autoComplete="current-password" invalid={invalid} value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />}</Field>
            <Field label="New password" required help="At least 12 characters." error={fieldErr('new_password')}>{({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} type="password" autoComplete="new-password" invalid={invalid} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />}</Field>
            <Field label="Repeat the new password" required error={pw.confirm && pw.confirm !== pw.new_password ? 'The passwords do not match.' : undefined}>{({ id, invalid }) => <Input id={id} type="password" autoComplete="new-password" invalid={invalid} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />}</Field>
            <Button variant="primary" loading={change.isPending} disabled={!pw.current_password || pw.new_password.length < 12 || pw.new_password !== pw.confirm}>Change password</Button>
          </form>
        </Card>
        <Card title="Recovery codes">
          {codes ? (
            <div className="space-y-3">
              <InlineAlert tone="warning" title="Save these new codes now">Your old codes no longer work. These are shown only once.</InlineAlert>
              <ul className="grid grid-cols-2 gap-2 rounded-md border border-line p-3 font-mono text-[14px]">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
              <Button onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}>Copy</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">Use a recovery code if you lose your phone. Generating new codes cancels the old ones.</p>
              <ErrorSummary error={regen.error && !(regen.error instanceof ApiError && regen.error.needsReauth) ? regen.error : null} />
              <Button loading={regen.isPending} onClick={() => regen.mutate()}>Generate new recovery codes</Button>
            </div>
          )}
        </Card>
        <Card title="Where you are signed in" className="xl:col-span-2" actions={<Button size="sm" loading={revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>Sign out everywhere else</Button>}>
          {sessions.isPending ? (
            <Spinner />
          ) : (
            <ul className="divide-y divide-line-subtle">
              {sessions.data?.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span>
                    <span className="font-medium">{s.device}</span> {s.current && <Badge tone="success">This device</Badge>}
                    <span className="block text-[12px] text-text-secondary">
                      {s.ip ?? 'Unknown address'} · signed in {fmtDateTime(s.created_at)} · active {fmtRelative(s.last_seen_at)}
                    </span>
                  </span>
                  {!s.current && <Button size="sm" onClick={() => revoke.mutate(s.id)}>Sign out</Button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
