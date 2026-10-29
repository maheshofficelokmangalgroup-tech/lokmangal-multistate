// Users and roles (M19). Invitations are single-use links; accounts are deactivated, never deleted.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, ShieldAlert, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Checkbox, ConfirmDialog, Dialog, EmptyState, ErrorState, ErrorSummary, Field, InlineAlert, Input, KeyValue, PageHeader, StatusBadge, Table, TableSkeleton, Tabs, Td, Textarea, Th, useToast } from '../components/ui';
import { api, type Data, type Permission, type Role, type UserDetail, type UserSummary } from '../lib/api';
import { fmtDateTime, fmtRelative } from '../lib/format';
import { useSession } from '../lib/session';
import { useBranches } from './leads';

const useRoles = () => useQuery({ queryKey: ['roles'], queryFn: () => api.get<Data<{ roles: Role[]; permissions: Permission[] }>>('/roles').then((r) => r.data) });

function UsersTabs({ current }: { current: 'users' | 'roles' }) {
  const navigate = useNavigate();
  return <Tabs value={current} onChange={(v) => navigate({ to: v === 'roles' ? '/admin/roles' : '/admin/users' })} tabs={[{ value: 'users', label: 'Users' }, { value: 'roles', label: 'Roles and permissions' }]} />;
}

function RolePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const roles = useRoles();
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-[13px] font-medium">Roles</legend>
      {roles.data?.roles.map((r) => (
        <Checkbox key={r.code} label={r.name} description={r.description} checked={value.includes(r.code)} onChange={(e) => onChange(e.target.checked ? [...value, r.code] : value.filter((c) => c !== r.code))} />
      ))}
    </fieldset>
  );
}

function BranchPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const branches = useBranches();
  const [q, setQ] = useState('');
  const list = (branches.data ?? []).filter((b) => `${b.name} ${b.region} ${b.code}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <fieldset>
      <legend className="mb-1 text-[13px] font-medium">Branch scope</legend>
      <p className="mb-2 text-[12px] text-text-secondary">Branch managers only see enquiries for these branches.</p>
      <Input aria-label="Filter branches" placeholder="Filter branches" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
      <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-line p-2">
        {list.map((b) => (
          <label key={b.id} className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" className="size-4 accent-brand-primary" checked={value.includes(b.id)} onChange={(e) => onChange(e.target.checked ? [...value, b.id] : value.filter((x) => x !== b.id))} />
            {b.name} <span className="text-text-secondary">({b.region})</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function EffectivePermissions({ roles }: { roles: string[] }) {
  const q = useQuery({ queryKey: ['preview-permissions', roles], queryFn: () => api.post<Data<Permission[]>>('/users/preview-permissions', { roles }).then((r) => r.data), enabled: roles.length > 0 });
  if (!roles.length) return null;
  return (
    <details className="text-[13px]">
      <summary className="cursor-pointer text-text-secondary">What these roles allow ({q.data?.length ?? '…'})</summary>
      <ul className="mt-2 space-y-1">
        {q.data?.map((p) => (
          <li key={p.code}>
            {p.description} {p.sensitive && <Badge tone="warning">Sensitive</Badge>}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function UsersPage() {
  const list = useQuery({ queryKey: ['users'], queryFn: () => api.get<Data<UserSummary[]>>('/users').then((r) => r.data) });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', roles: [] as string[], branch_ids: [] as string[] });
  const [link, setLink] = useState<string | null>(null);
  const qc = useQueryClient();
  const invite = useMutation({
    mutationFn: () => api.post<Data<UserDetail>>('/users', form),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setLink(r.data.invitation_link ?? null);
      setForm({ email: '', name: '', roles: [], branch_ids: [] });
    },
  });
  return (
    <>
      <PageHeader title="Users and roles" description="Staff accounts. Everyone signs in with a password and an authenticator app." actions={<Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => { setOpen(true); setLink(null); invite.reset(); }}>Invite user</Button>} />
      <UsersTabs current="users" />
      <Card padded={false} className="mt-5">
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.isPending ? (
          <TableSkeleton />
        ) : list.data.length === 0 ? (
          <EmptyState title="No users" />
        ) : (
          <Table label="Users">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th className="hidden md:table-cell">Roles</Th>
                <Th>Status</Th>
                <Th className="hidden md:table-cell">Two-step</Th>
                <Th className="hidden lg:table-cell">Last sign-in</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((u) => (
                <tr key={u.id} className="hover:bg-canvas">
                  <Td>
                    <Link to="/admin/users/$id" params={{ id: u.id }} className="font-medium text-brand-primary hover:underline">
                      {u.name}
                    </Link>
                    <span className="block text-[12px] text-text-secondary">{u.email}</span>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <Badge key={r}>{r.replace('_', ' ')}</Badge>
                      ))}
                    </div>
                    {u.branches.length > 0 && <span className="mt-1 block text-[12px] text-text-secondary">{u.branches.join(', ')}</span>}
                  </Td>
                  <Td>
                    <StatusBadge status={u.status} />
                  </Td>
                  <Td className="hidden md:table-cell">{u.two_factor ? <Badge tone="success">On</Badge> : <Badge tone="warning">Not set up</Badge>}</Td>
                  <Td className="hidden text-[13px] text-text-secondary lg:table-cell">{u.last_login_at ? fmtRelative(u.last_login_at) : 'Never'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={link ? 'Invitation sent' : 'Invite a staff member'}
        wide
        footer={
          link ? (
            <Button variant="primary" onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" loading={invite.isPending} onClick={() => invite.mutate()}>Send invitation</Button>
            </>
          )
        }
      >
        {link ? (
          <div className="space-y-3">
            <InlineAlert tone="success">An email with this single-use link was queued. It expires in 48 hours.</InlineAlert>
            <p className="text-[13px] text-text-secondary">If email is not set up yet, give this link to the person directly (not by public chat):</p>
            <code className="block rounded-md bg-canvas p-3 text-[12px] break-all">{link}</code>
            <Button size="sm" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <ErrorSummary error={invite.error} />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Full name" required>{({ id }) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
              <Field label="Work email" required>{({ id }) => <Input id={id} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
            </div>
            <RolePicker value={form.roles} onChange={(roles) => setForm({ ...form, roles })} />
            <EffectivePermissions roles={form.roles} />
            {form.roles.includes('branch_manager') && <BranchPicker value={form.branch_ids} onChange={(branch_ids) => setForm({ ...form, branch_ids })} />}
          </div>
        )}
      </Dialog>
    </>
  );
}

export function UserPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { me, can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['user', id], queryFn: () => api.get<Data<UserDetail>>(`/users/${id}`).then((r) => r.data) });
  const [edit, setEdit] = useState<{ roles: string[]; branch_ids: string[]; name: string; reason: string } | null>(null);
  const [action, setAction] = useState<'deactivate' | 'reactivate' | 'reset-2fa' | null>(null);
  const [reason, setReason] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const done = (msg: string) => () => {
    qc.invalidateQueries({ queryKey: ['user', id] });
    qc.invalidateQueries({ queryKey: ['users'] });
    toast('success', msg);
  };
  const save = useMutation({ mutationFn: () => api.patch(`/users/${id}`, edit), onSuccess: () => { setEdit(null); done('Access updated. It applies immediately.')(); } });
  const act = useMutation({ mutationFn: (a: string) => api.post(`/users/${id}/${a}`, { reason }), onSuccess: () => { setAction(null); setReason(''); done('Done.')(); } });
  const resend = useMutation({ mutationFn: () => api.post<Data<{ invitation_link: string }>>(`/users/${id}/resend-invitation`), onSuccess: (r) => setLink(r.data.invitation_link) });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isPending) return <TableSkeleton />;
  const u = q.data;
  return (
    <>
      <Link to="/admin/users" className="mb-3 inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary">
        <ArrowLeft className="size-4" /> Users
      </Link>
      <PageHeader
        title={u.name}
        description={u.email}
        meta={<><StatusBadge status={u.status} />{u.two_factor ? <Badge tone="success">Two-step on</Badge> : <Badge tone="warning">Two-step not set up</Badge>}</>}
        actions={
          <>
            {u.status === 'invited' && <Button loading={resend.isPending} onClick={() => resend.mutate()}>Resend invitation</Button>}
            {can('security.reset_2fa') && u.id !== me.id && u.two_factor && <Button onClick={() => setAction('reset-2fa')}>Reset two-step</Button>}
            {u.status === 'deactivated' ? <Button onClick={() => setAction('reactivate')}>Reactivate</Button> : u.id !== me.id && <Button variant="danger" onClick={() => setAction('deactivate')}>Deactivate</Button>}
          </>
        }
      />
      <ErrorSummary error={act.error ?? save.error ?? resend.error} />
      {link && <div className="mb-4"><InlineAlert tone="success" title="New invitation link">A new email was queued. Link: <code className="break-all">{link}</code></InlineAlert></div>}
      <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card title="Access" actions={!edit && <Button size="sm" onClick={() => setEdit({ roles: u.roles, branch_ids: u.branch_ids, name: u.name, reason: '' })}>Change</Button>}>
          {edit ? (
            <div className="space-y-4">
              <Field label="Name">{({ id: fid }) => <Input id={fid} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />}</Field>
              <RolePicker value={edit.roles} onChange={(roles) => setEdit({ ...edit, roles })} />
              <EffectivePermissions roles={edit.roles} />
              <BranchPicker value={edit.branch_ids} onChange={(branch_ids) => setEdit({ ...edit, branch_ids })} />
              <Field label="Reason" help="Kept in the audit log.">{({ id: fid, describedBy }) => <Input id={fid} aria-describedby={describedBy} value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} />}</Field>
              <div className="flex gap-2">
                <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
                <Button onClick={() => setEdit(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r}>{r.replace('_', ' ')}</Badge>)}</div>
              <details className="text-[13px]">
                <summary className="cursor-pointer text-text-secondary">{u.permissions.length} permissions</summary>
                <ul className="mt-2 columns-1 font-mono text-[12px] md:columns-2">{u.permissions.map((p) => <li key={p}>{p}</li>)}</ul>
              </details>
            </div>
          )}
        </Card>
        <Card title="Account">
          <KeyValue
            items={[
              ['Created', fmtDateTime(u.created_at)],
              ['Last sign-in', u.last_login_at ? fmtDateTime(u.last_login_at) : 'Never'],
              ['Active sessions', u.active_sessions],
              ...(u.deactivated_at ? ([['Deactivated', `${fmtDateTime(u.deactivated_at)} — ${u.deactivated_reason}`]] as [string, string][]) : []),
            ]}
          />
        </Card>
      </div>
      <ConfirmDialog
        open={!!action}
        onOpenChange={(o) => !o && setAction(null)}
        title={action === 'deactivate' ? `Deactivate ${u.name}?` : action === 'reactivate' ? `Reactivate ${u.name}?` : `Reset two-step sign-in for ${u.name}?`}
        description={action === 'deactivate' ? 'They are signed out everywhere at once. History stays intact.' : action === 'reset-2fa' ? 'Only after verifying their identity (for example by phone with their manager). They will set up a new authenticator at their next sign-in.' : undefined}
        confirmLabel={action === 'deactivate' ? 'Deactivate' : action === 'reactivate' ? 'Reactivate' : 'Reset'}
        danger={action !== 'reactivate'}
        confirmDisabled={!reason.trim()}
        loading={act.isPending}
        onConfirm={() => action && act.mutate(action)}
      >
        <Field label="Reason" required>{({ id: fid }) => <Textarea id={fid} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      </ConfirmDialog>
    </>
  );
}

export function RolesPage() {
  const roles = useRoles();
  const { can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Role | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (editing) {
      setPerms(editing.permissions);
      setReason('');
    }
  }, [editing]);
  const save = useMutation({
    mutationFn: () => api.patch(`/roles/${editing!.id}`, { permissions: perms, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      setEditing(null);
      toast('success', 'Role updated. It applies to its members immediately.');
    },
  });
  const catalogue = useMemo(() => roles.data?.permissions ?? [], [roles.data]);
  return (
    <>
      <PageHeader title="Users and roles" description="Roles are bundles of permissions. The maker–checker rule cannot be switched off by any role." />
      <UsersTabs current="roles" />
      <Card padded={false} className="mt-5">
        {roles.isError ? (
          <ErrorState error={roles.error} onRetry={() => roles.refetch()} />
        ) : roles.isPending ? (
          <TableSkeleton />
        ) : (
          <div className="overflow-x-auto" role="region" aria-label="Permission matrix" tabIndex={0}>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 border-b border-line bg-canvas px-3 py-2 text-left">Permission</th>
                  {roles.data.roles.map((r) => (
                    <th key={r.id} scope="col" className="border-b border-line bg-canvas px-2 py-2 text-center font-medium whitespace-nowrap">
                      {r.name}
                      <span className="block text-[11px] font-normal text-text-secondary">{r.members} people</span>
                      {can('roles.manage') && <button className="text-[11px] text-brand-primary underline" onClick={() => setEditing(r)}>Edit</button>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {catalogue.map((p) => (
                  <tr key={p.code} className="hover:bg-canvas">
                    <th scope="row" className="sticky left-0 border-b border-line-subtle bg-surface px-3 py-2 text-left font-normal">
                      {p.description} {p.sensitive && <ShieldAlert className="inline size-3.5 text-warning" aria-label="Sensitive" />}
                      <span className="block font-mono text-[11px] text-text-secondary">{p.code}</span>
                    </th>
                    {roles.data.roles.map((r) => (
                      <td key={r.id} className="border-b border-line-subtle text-center">
                        {r.permissions.includes(p.code) ? <span aria-label="Allowed">✓</span> : <span className="text-line" aria-label="Not allowed">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Dialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={`Edit role: ${editing?.name}`}
        wide
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={save.isPending} disabled={!reason.trim()} onClick={() => save.mutate()}>Save role</Button>
          </>
        }
      >
        <div className="space-y-3">
          <ErrorSummary error={save.error} />
          <div className="grid gap-2 md:grid-cols-2">
            {catalogue.map((p) => (
              <Checkbox key={p.code} label={p.description} description={p.code} checked={perms.includes(p.code)} onChange={(e) => setPerms(e.target.checked ? [...perms, p.code] : perms.filter((x) => x !== p.code))} />
            ))}
          </div>
          <Field label="Reason" required>{({ id }) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        </div>
      </Dialog>
    </>
  );
}
