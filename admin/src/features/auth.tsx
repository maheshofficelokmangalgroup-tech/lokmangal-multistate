// Sign-in, two-factor verification and first-time enrolment, password reset and invitations (M01).

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import QRCode from 'qrcode';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, ErrorSummary, Field, InlineAlert, Input } from '../components/ui';
import { api, ApiError, setCsrfToken, type Data } from '../lib/api';

type Stage = 'credentials' | 'totp' | 'enroll' | 'codes';

function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="hidden flex-col justify-between bg-brand-primary p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-white text-lg font-bold text-brand-primary">L</span>
          <span>
            <span className="block font-semibold">Lokmangal Multistate</span>
            <span className="block text-sm text-white/80">Co-operative Society Ltd.</span>
          </span>
        </div>
        <div>
          <p className="max-w-sm text-[22px] leading-snug font-semibold">Website and enquiry administration</p>
          <p className="mt-2 max-w-sm text-sm text-white/80">Every change is reviewed, previewed and published as a release. All activity is recorded.</p>
        </div>
        <p className="text-[12px] text-white/70">Authorised staff only. Access is logged.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          <h1 className="text-[26px] font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

const credentialsSchema = z.object({
  email: z.string().trim().email('Enter your work email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

function safeNext(next?: string) {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : '/dashboard';
}

function CodeInput({ value, onChange, id, describedBy }: { value: string; onChange: (v: string) => void; id: string; describedBy?: string }) {
  return <Input id={id} aria-describedby={describedBy} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))} className="tabular h-12 text-center text-lg tracking-[0.5em]" autoFocus />;
}

/** Shows the QR code and manual key, then confirms a first code. */
function Enroll({ onDone }: { onDone: (codes: string[]) => void }) {
  const [setup, setSetup] = useState<{ otpauth_url: string; secret: string } | null>(null);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .post<Data<{ otpauth_url: string; secret: string }>>('/auth/2fa/enroll')
      .then(async (r) => {
        setSetup(r.data);
        setQr(await QRCode.toDataURL(r.data.otpauth_url, { margin: 1, width: 200 }));
      })
      .catch(setError);
  }, []);
  return (
    <div className="space-y-5">
      <ErrorSummary error={error} />
      <ol className="list-decimal space-y-1 pl-5 text-sm text-text-secondary">
        <li>Install Google Authenticator or Microsoft Authenticator on your phone.</li>
        <li>Scan this code (or type the key) in the app.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      {setup && (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-panel)] border border-line bg-surface p-4">
          {qr && <img src={qr} alt="QR code for your authenticator app" width={200} height={200} />}
          <p className="text-center text-[12px] text-text-secondary">
            Manual key: <code className="font-mono text-[13px] break-all text-text-primary">{setup.secret.match(/.{1,4}/g)?.join(' ')}</code>
          </p>
        </div>
      )}
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const r = await api.post<Data<{ csrf_token: string; recovery_codes: string[] }>>('/auth/2fa/verify', { code });
            setCsrfToken(r.data.csrf_token);
            onDone(r.data.recovery_codes);
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="6-digit code" required error={error instanceof ApiError ? error.fields.code : undefined}>
          {({ id, describedBy }) => <CodeInput id={id} describedBy={describedBy} value={code} onChange={setCode} />}
        </Field>
        <Button variant="primary" className="w-full" loading={busy} disabled={code.length !== 6 || !setup}>
          Turn on two-step sign-in
        </Button>
      </form>
    </div>
  );
}

function RecoveryCodes({ codes, onContinue }: { codes: string[]; onContinue: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-4">
      <InlineAlert tone="warning" title="Save these recovery codes now">
        Each code works once if you lose your phone. They will not be shown again. Store them somewhere safe, away from your computer.
      </InlineAlert>
      <ul className="grid grid-cols-2 gap-2 rounded-[var(--radius-panel)] border border-line bg-surface p-4 font-mono text-[15px] tabular">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}>Copy</Button>
        <Button
          onClick={() => {
            const url = URL.createObjectURL(new Blob([`Lokmangal admin recovery codes\n\n${codes.join('\n')}\n`], { type: 'text/plain' }));
            Object.assign(document.createElement('a'), { href: url, download: 'lokmangal-recovery-codes.txt' }).click();
            URL.revokeObjectURL(url);
          }}
        >
          Download
        </Button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-4 accent-brand-primary" /> I have saved my recovery codes
      </label>
      <Button variant="primary" className="w-full" disabled={!saved} onClick={onContinue}>
        Continue to the admin panel
      </Button>
    </div>
  );
}

export function LoginPage() {
  const search = useSearch({ strict: false }) as { next?: string; reason?: string };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [stage, setStage] = useState<Stage>('credentials');
  const [error, setError] = useState<unknown>(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [forgot, setForgot] = useState(false);
  const form = useForm<z.infer<typeof credentialsSchema>>({ resolver: zodResolver(credentialsSchema) });

  const finish = async () => {
    await qc.invalidateQueries();
    navigate({ to: safeNext(search.next) });
  };

  if (forgot) return <ForgotPassword onBack={() => setForgot(false)} />;

  const notice = { expired: 'Your session ended. Please sign in again.', idle: 'You were signed out after 30 minutes of inactivity.', signed_out: 'You have signed out.' }[search.reason ?? ''];

  return (
    <AuthLayout
      title={stage === 'credentials' ? 'Sign in' : stage === 'totp' ? 'Two-step verification' : stage === 'enroll' ? 'Set up two-step sign-in' : 'Recovery codes'}
      subtitle={stage === 'credentials' ? 'Lokmangal website admin' : stage === 'totp' ? 'Enter the code from your authenticator app.' : stage === 'enroll' ? 'Two-step sign-in is required for every staff account.' : undefined}
    >
      {notice && stage === 'credentials' && (
        <div className="mb-4">
          <InlineAlert tone="info">{notice}</InlineAlert>
        </div>
      )}
      {stage === 'credentials' && (
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            setBusy(true);
            setError(null);
            try {
              const r = await api.post<Data<{ stage: 'totp' | 'enroll'; csrf_token: string }>>('/auth/login', values);
              setCsrfToken(r.data.csrf_token);
              setStage(r.data.stage);
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          })}
        >
          <ErrorSummary error={error} />
          <Field label="Email" required error={form.formState.errors.email?.message}>
            {({ id, describedBy, invalid }) => <Input id={id} type="email" autoComplete="username" aria-describedby={describedBy} invalid={invalid} {...form.register('email')} />}
          </Field>
          <Field label="Password" required error={form.formState.errors.password?.message}>
            {({ id, describedBy, invalid }) => <Input id={id} type="password" autoComplete="current-password" aria-describedby={describedBy} invalid={invalid} {...form.register('password')} />}
          </Field>
          <Button variant="primary" className="w-full" loading={busy}>
            Continue
          </Button>
          <Button type="button" variant="link" onClick={() => setForgot(true)}>
            Forgot your password?
          </Button>
        </form>
      )}
      {stage === 'totp' && (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const r = await api.post<Data<{ csrf_token: string }>>('/auth/2fa', useRecovery ? { recovery_code: code } : { code });
              setCsrfToken(r.data.csrf_token);
              await finish();
            } catch (err) {
              setError(err);
              if (err instanceof ApiError && err.status === 401) setStage('credentials');
            } finally {
              setBusy(false);
            }
          }}
        >
          <ErrorSummary error={error} />
          {useRecovery ? (
            <Field label="Recovery code" required help="One of the codes you saved when you set up two-step sign-in.">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={code} onChange={(e) => setCode(e.target.value)} className="font-mono uppercase" autoFocus />}
            </Field>
          ) : (
            <Field label="6-digit code" required>
              {({ id, describedBy }) => <CodeInput id={id} describedBy={describedBy} value={code} onChange={setCode} />}
            </Field>
          )}
          <Button variant="primary" className="w-full" loading={busy} disabled={useRecovery ? code.trim().length < 8 : code.length !== 6}>
            Verify and sign in
          </Button>
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setUseRecovery((v) => !v);
              setCode('');
            }}
          >
            {useRecovery ? 'Use my authenticator app instead' : 'Lost your phone? Use a recovery code'}
          </Button>
        </form>
      )}
      {stage === 'enroll' && (
        <Enroll
          onDone={(c) => {
            setCodes(c);
            setStage('codes');
          }}
        />
      )}
      {stage === 'codes' && <RecoveryCodes codes={codes} onContinue={finish} />}
    </AuthLayout>
  );
}

function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <AuthLayout title="Reset your password" subtitle="We will email a link that works for 30 minutes.">
      {sent ? (
        <InlineAlert tone="success" title="Check your email">
          If that address belongs to an active account, a reset link is on its way.
        </InlineAlert>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api.post('/auth/forgot-password', { email });
              setSent(true);
            } catch (err) {
              setError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          <ErrorSummary error={error} />
          <Field label="Work email" required>
            {({ id }) => <Input id={id} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Button variant="primary" className="w-full" loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
      <Button variant="link" className="mt-4" onClick={onBack}>
        Back to sign in
      </Button>
    </AuthLayout>
  );
}

/** Reads the one-time token from the URL fragment and removes it from the address bar at once. */
function useFragmentToken() {
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') ?? '');
  useEffect(() => {
    if (location.hash) history.replaceState(null, '', location.pathname);
  }, []);
  return token;
}

function NewPasswordForm({ submitLabel, onSubmit }: { submitLabel: string; onSubmit: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== password;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (password !== confirm) return;
        setBusy(true);
        setError(null);
        try {
          await onSubmit(password);
        } catch (err) {
          setError(err);
        } finally {
          setBusy(false);
        }
      }}
    >
      <ErrorSummary error={error} />
      <Field label="New password" required help="At least 12 characters. A short sentence is easy to remember and hard to guess." error={error instanceof ApiError ? error.fields.password : undefined}>
        {({ id, describedBy, invalid }) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={describedBy} invalid={invalid} value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <Field label="Repeat the password" required error={mismatch ? 'The passwords do not match.' : undefined}>
        {({ id, describedBy, invalid }) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={describedBy} invalid={invalid} value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
      </Field>
      <Button variant="primary" className="w-full" loading={busy} disabled={password.length < 12 || password !== confirm}>
        {submitLabel}
      </Button>
    </form>
  );
}

export function ResetPasswordPage() {
  const token = useFragmentToken();
  const navigate = useNavigate();
  const [done, setDone] = useState(false);
  return (
    <AuthLayout title="Choose a new password">
      {!token ? (
        <InlineAlert tone="danger" title="This link is incomplete">Open the link from your email again, or ask for a new one.</InlineAlert>
      ) : done ? (
        <div className="space-y-4">
          <InlineAlert tone="success" title="Password changed">All your sessions were signed out. Sign in with the new password.</InlineAlert>
          <Button variant="primary" className="w-full" onClick={() => navigate({ to: '/login' })}>
            Sign in
          </Button>
        </div>
      ) : (
        <NewPasswordForm
          submitLabel="Change password"
          onSubmit={async (password) => {
            await api.post('/auth/reset-password', { token, password });
            setDone(true);
          }}
        />
      )}
    </AuthLayout>
  );
}

export function AcceptInvitationPage() {
  const token = useFragmentToken();
  const navigate = useNavigate();
  const [stage, setStage] = useState<'password' | 'enroll' | 'codes'>('password');
  const [codes, setCodes] = useState<string[]>([]);
  return (
    <AuthLayout title={stage === 'password' ? 'Welcome to Lokmangal admin' : stage === 'enroll' ? 'Set up two-step sign-in' : 'Recovery codes'} subtitle={stage === 'password' ? 'Choose a password to activate your account.' : undefined}>
      {!token && stage === 'password' ? (
        <InlineAlert tone="danger" title="This invitation link is incomplete">Open the link from your email again, or ask an administrator to resend it.</InlineAlert>
      ) : stage === 'password' ? (
        <NewPasswordForm
          submitLabel="Activate my account"
          onSubmit={async (password) => {
            const r = await api.post<Data<{ csrf_token: string }>>('/auth/invitations/accept', { token, password });
            setCsrfToken(r.data.csrf_token);
            setStage('enroll');
          }}
        />
      ) : stage === 'enroll' ? (
        <Enroll
          onDone={(c) => {
            setCodes(c);
            setStage('codes');
          }}
        />
      ) : (
        <RecoveryCodes codes={codes} onContinue={() => navigate({ to: '/dashboard' })} />
      )}
    </AuthLayout>
  );
}
