// The signed-in staff member, their permissions, idle-timeout warning and re-authentication prompt.
// Permission checks here only hide or explain controls; the API enforces every rule.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Button, ConfirmDialog, Dialog, ErrorSummary, Field, Input, Spinner } from '../components/ui';
import { api, ApiError, lastApiActivity, onApiError, setCsrfToken, type Data, type Me } from './api';

type Session = { me: Me; can: (permission: string) => boolean; canAny: (...permissions: string[]) => boolean };
const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}

export const meQueryKey = ['auth', 'me'] as const;

export function SessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: meQueryKey,
    queryFn: async () => {
      const r = await api.get<Data<Me>>('/auth/me');
      setCsrfToken(r.data.csrf_token);
      return r.data;
    },
    retry: false,
    staleTime: 60_000,
  });

  // Any 401 from the API means the session ended: go to sign-in, keeping a safe internal return path.
  useEffect(
    () =>
      onApiError((e) => {
        if (e.status === 401 && !location.pathname.startsWith('/login')) {
          const hadSession = !!qc.getQueryData(meQueryKey);
          qc.clear();
          const next = location.pathname + location.search;
          navigate({ to: '/login', search: { next: next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard', ...(hadSession && { reason: 'expired' }) } as never });
        }
      }),
    [navigate, qc],
  );

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) {
      const next = location.pathname + location.search;
      navigate({ to: '/login', search: { next: next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard' } as never });
    }
  }, [me.error, navigate]);

  const can = useCallback((p: string) => !!me.data?.permissions.includes(p), [me.data]);
  const canAny = useCallback((...ps: string[]) => ps.some((p) => me.data?.permissions.includes(p)), [me.data]);

  if (me.isPending || (me.error && me.error instanceof ApiError && me.error.status === 401)) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Checking your session" />
      </div>
    );
  }
  if (me.error || !me.data) {
    return (
      <div className="mx-auto max-w-md p-8">
        <ErrorSummary error={me.error} />
        <Button className="mt-4" onClick={() => me.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <SessionContext.Provider value={{ me: me.data, can, canAny }}>
      {children}
      <IdleWatch idleSeconds={me.data.session.idle_timeout_seconds} />
      <ReauthPrompt />
    </SessionContext.Provider>
  );
}

/** Warns two minutes before the 30-minute idle timeout and offers to continue. */
function IdleWatch({ idleSeconds }: { idleSeconds: number }) {
  const [warn, setWarn] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const t = setInterval(() => {
      const idle = (Date.now() - lastApiActivity()) / 1000;
      if (idle > idleSeconds) {
        clearInterval(t);
        navigate({ to: '/login', search: { reason: 'idle' } as never });
      } else setWarn(idle > idleSeconds - 120);
    }, 5000);
    return () => clearInterval(t);
  }, [idleSeconds, navigate]);
  return (
    <ConfirmDialog
      open={warn}
      onOpenChange={setWarn}
      title="Are you still there?"
      description="You will be signed out in about two minutes because of inactivity. Unsaved changes would be lost."
      confirmLabel="Continue session"
      onConfirm={async () => {
        await api.post('/auth/keepalive').catch(() => {});
        setWarn(false);
      }}
    />
  );
}

/** Security-sensitive actions ask for password + authenticator code again (valid 10 minutes). */
function ReauthPrompt() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  useEffect(
    () =>
      onApiError((e) => {
        if (e.needsReauth) {
          setError(null);
          setPassword('');
          setCode('');
          setOpen(true);
        }
      }),
    [],
  );
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Confirm it's you"
      description="This action changes security settings or access. Enter your password and a fresh authenticator code, then try the action again."
      footer={
        <>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api.post('/auth/reauth', { password, code });
                await qc.invalidateQueries({ queryKey: meQueryKey });
                setOpen(false);
              } catch (e) {
                setError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirm
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorSummary error={error} />
        <Field label="Password" required>
          {({ id, describedBy, invalid }) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby={describedBy} invalid={invalid} />}
        </Field>
        <Field label="Authenticator code" required>
          {({ id, describedBy }) => <Input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-describedby={describedBy} className="tabular tracking-[0.3em]" />}
        </Field>
      </div>
    </Dialog>
  );
}
