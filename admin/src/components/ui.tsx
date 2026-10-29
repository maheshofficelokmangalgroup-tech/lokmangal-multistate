// Shared building blocks. One way to render each pattern, everywhere (specification §6.1).

import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Loader2, ShieldOff, X, XCircle } from 'lucide-react';
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { ApiError } from '../lib/api';

// ------------------------------------------------------------------------------------------------
// Buttons and form controls
// ------------------------------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-brand-primary text-white hover:bg-brand-hover disabled:bg-brand-primary/50',
  secondary: 'bg-surface text-text-primary border border-line hover:bg-canvas disabled:text-text-secondary',
  ghost: 'text-text-secondary hover:bg-line-subtle hover:text-text-primary',
  danger: 'bg-danger text-white hover:bg-red-800 disabled:bg-danger/50',
  link: 'text-brand-primary underline-offset-2 hover:underline px-0 h-auto',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }>(
  ({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium transition-colors disabled:cursor-not-allowed whitespace-nowrap',
        variant !== 'link' && (size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-[42px] px-4 text-sm'),
        variant === 'link' && 'text-sm',
        buttonStyles[variant],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

const hasWidth = (c?: string) => /(^|\s)w-/.test(c ?? '');
const controlBase =
  'rounded-[var(--radius-control)] border bg-surface px-3 text-sm text-text-primary placeholder:text-zinc-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary disabled:bg-line-subtle disabled:text-text-secondary';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(({ invalid, className, ...props }, ref) => (
  <input ref={ref} className={clsx(controlBase, !hasWidth(className) && 'w-full', 'h-[42px]', invalid ? 'border-danger' : 'border-line', className)} aria-invalid={invalid || undefined} {...props} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(({ invalid, className, ...props }, ref) => (
  <textarea ref={ref} className={clsx(controlBase, !hasWidth(className) && 'w-full', 'py-2.5 min-h-[96px]', invalid ? 'border-danger' : 'border-line', className)} aria-invalid={invalid || undefined} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(({ invalid, className, children, ...props }, ref) => (
  <select ref={ref} className={clsx(controlBase, !hasWidth(className) && 'w-full', 'h-[42px] pr-8', invalid ? 'border-danger' : 'border-line', className)} aria-invalid={invalid || undefined} {...props}>
    {children}
  </select>
));
Select.displayName = 'Select';

export function Checkbox({ label, description, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} type="checkbox" className="mt-0.5 size-4 rounded border-line accent-brand-primary" {...props} />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium">{label}</span>
        {description && <span className="block text-[13px] text-text-secondary">{description}</span>}
      </label>
    </div>
  );
}

/** Label, helper text and an inline error tied to the control with aria-describedby. */
export function Field({ label, help, error, required, children, className }: { label: ReactNode; help?: ReactNode; error?: string; required?: boolean; children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode; className?: string }) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-text-primary">
        {label}
        {required && <span className="ml-0.5 text-danger" aria-hidden> *</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children({ id, describedBy: [helpId, errorId].filter(Boolean).join(' ') || undefined, invalid: !!error })}
      {help && !error && (
        <p id={helpId} className="text-[12px] text-text-secondary">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-center gap-1 text-[12px] font-medium text-danger">
          <XCircle className="size-3.5 shrink-0" aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Status and feedback
// ------------------------------------------------------------------------------------------------

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'brand';
const toneStyles: Record<Tone, string> = {
  success: 'bg-success-soft text-success border-green-200',
  warning: 'bg-warning-soft text-warning border-amber-200',
  danger: 'bg-danger-soft text-danger border-red-200',
  neutral: 'bg-neutral-soft text-neutral border-zinc-200',
  info: 'bg-info-soft text-info border-blue-200',
  brand: 'bg-brand-soft text-brand-hover border-orange-200',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium whitespace-nowrap', toneStyles[tone], className)}>{children}</span>;
}

const statusMap: Record<string, [Tone, string]> = {
  new: ['brand', 'New'],
  contacted: ['info', 'Contacted'],
  in_progress: ['warning', 'In progress'],
  converted: ['success', 'Converted'],
  not_interested: ['neutral', 'Not interested'],
  spam: ['neutral', 'Spam'],
  shortlisted: ['info', 'Shortlisted'],
  interview: ['warning', 'Interview'],
  selected: ['success', 'Selected'],
  rejected: ['neutral', 'Rejected'],
  draft: ['neutral', 'Draft'],
  in_review: ['warning', 'Awaiting approval'],
  changes_requested: ['danger', 'Changes requested'],
  approved: ['success', 'Approved'],
  released: ['info', 'In a release'],
  superseded: ['neutral', 'Superseded'],
  archived: ['neutral', 'Archived'],
  pending: ['warning', 'Pending'],
  withdrawn: ['neutral', 'Withdrawn'],
  queued: ['neutral', 'Queued'],
  building: ['info', 'Building'],
  validating: ['info', 'Validating'],
  ready: ['success', 'Ready'],
  scheduled: ['warning', 'Scheduled'],
  activating: ['info', 'Activating'],
  live: ['success', 'Live'],
  failed: ['danger', 'Failed'],
  cancelled: ['neutral', 'Cancelled'],
  active: ['success', 'Active'],
  invited: ['warning', 'Invited'],
  deactivated: ['neutral', 'Deactivated'],
  success: ['success', 'Success'],
  denied: ['danger', 'Denied'],
  failure: ['danger', 'Failure'],
};

export function StatusBadge({ status }: { status: string }) {
  const [tone, label] = statusMap[status] ?? ['neutral', status.replace(/_/g, ' ')];
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'danger' ? XCircle : tone === 'warning' ? AlertTriangle : null;
  return (
    <Badge tone={tone}>
      {Icon && <Icon className="size-3" aria-hidden />}
      {label}
    </Badge>
  );
}

export function InlineAlert({ tone = 'info', title, children, action }: { tone?: 'info' | 'warning' | 'danger' | 'success'; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const Icon = { info: Info, warning: AlertTriangle, danger: XCircle, success: CheckCircle2 }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={clsx('flex gap-3 rounded-[var(--radius-panel)] border p-3.5 text-sm', toneStyles[tone])}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={clsx(title && 'mt-0.5', 'text-[13px] [&_a]:underline')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** A summary of field errors at the top of a form; links move focus to each field by name. */
export function ErrorSummary({ error, labels = {} }: { error: unknown; labels?: Record<string, string> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  if (!error) return null;
  const e = error instanceof ApiError ? error : null;
  const fields = e ? Object.entries(e.fields) : [];
  return (
    <div ref={ref} tabIndex={-1} className="outline-none">
      <InlineAlert tone="danger" title={e?.message ?? 'Something went wrong.'}>
        {fields.length > 0 && (
          <ul className="mt-1 list-disc pl-4">
            {fields.map(([k, v]) => (
              <li key={k}>
                <strong>{labels[k] ?? k}</strong>: {v}
              </li>
            ))}
          </ul>
        )}
        {Array.isArray(e?.extra.problems) && (
          <ul className="mt-1 list-disc pl-4">
            {(e!.extra.problems as string[]).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {e?.requestId && <p className="mt-1 text-[12px] opacity-80">Support reference: {e.requestId}</p>}
      </InlineAlert>
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-text-secondary">
      <Loader2 className="size-4 animate-spin" aria-hidden /> {label}…
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-md bg-line-subtle', className)} aria-hidden />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 rounded-full bg-brand-soft p-3 text-brand-primary">{icon}</div>}
      <p className="text-[15px] font-semibold">{title}</p>
      {children && <p className="mt-1 max-w-md text-[13px] text-text-secondary">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Load failures keep the user's filters; they can retry. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiError ? error : null;
  if (e?.status === 403) return <PermissionMessage message={e.message} />;
  return (
    <div className="p-6">
      <InlineAlert tone="danger" title={e?.status === 0 ? 'The server could not be reached' : 'This could not be loaded'} action={onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>}>
        {e?.message ?? 'Please try again.'} {e?.requestId && <>Support reference: {e.requestId}.</>}
      </InlineAlert>
    </div>
  );
}

export function PermissionMessage({ message }: { message?: string }) {
  return <EmptyState icon={<ShieldOff className="size-5" />} title="You do not have access to this">{message ?? 'Ask a Super Admin if your role should include it.'}</EmptyState>;
}

// ------------------------------------------------------------------------------------------------
// Layout pieces
// ------------------------------------------------------------------------------------------------

export function PageHeader({ title, description, meta, actions }: { title: ReactNode; description?: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-[14px] text-text-secondary">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={clsx('rounded-[var(--radius-panel)] border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          {title && <h2 className="text-[17px] font-semibold">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(padded && 'p-5')}>{children}</div>
    </section>
  );
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[180px_1fr]">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-[13px] text-text-secondary">{k}</dt>
          <dd className="text-sm break-words">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Table({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto" role="region" aria-label={label} tabIndex={0}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th scope="col" className={clsx('border-b border-line bg-canvas px-4 py-2.5 text-left text-[12px] font-semibold tracking-wide text-text-secondary uppercase', className)}>
    {children}
  </th>
);
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={clsx('border-b border-line-subtle px-4 py-3 align-middle', className)}>{children}</td>;

export function Pagination({ page, perPage, total, onPage }: { page: number; perPage: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-text-secondary" aria-label="Pagination">
      <span className="whitespace-nowrap">
        {from}–{Math.min(page * perPage, total)} of {total.toLocaleString('en-IN')}
      </span>
      <span className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" icon={<ChevronLeft className="size-4" />} />
        <span className="px-2">
          Page {page} of {pages}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page" icon={<ChevronRight className="size-4" />} />
      </span>
    </nav>
  );
}

export function Tabs({ value, onChange, tabs, children }: { value: string; onChange: (v: string) => void; tabs: { value: string; label: ReactNode }[]; children?: ReactNode }) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={onChange}>
      <TabsPrimitive.List className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Sections">
        {tabs.map((t) => (
          <TabsPrimitive.Trigger
            key={t.value}
            value={t.value}
            className="-mb-px border-b-2 border-transparent px-3 py-2.5 text-sm font-medium whitespace-nowrap text-text-secondary hover:text-text-primary data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary"
          >
            {t.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}
export const TabPanel = ({ value, children }: { value: string; children: ReactNode }) => (
  <TabsPrimitive.Content value={value} className="pt-5 focus:outline-none">
    {children}
  </TabsPrimitive.Content>
);

// ------------------------------------------------------------------------------------------------
// Dialogs and drawers (focus trapped, focus returned, Escape closes)
// ------------------------------------------------------------------------------------------------

export function Dialog({ open, onOpenChange, title, description, children, footer, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-zinc-950/40" />
        <DialogPrimitive.Content className={clsx('fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[var(--radius-panel)] bg-surface shadow-[var(--shadow-menu)] focus:outline-none', wide ? 'max-w-3xl' : 'max-w-lg')}>
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <DialogPrimitive.Title className="text-[17px] font-semibold">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-1 text-[13px] text-text-secondary">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">Dialog</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-text-secondary hover:bg-line-subtle" aria-label="Close">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          {children && <div className="px-5 py-4">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, danger, onConfirm, loading, children, confirmDisabled }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; loading?: boolean; children?: ReactNode; confirmDisabled?: boolean }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

export function Drawer({ open, onOpenChange, title, children, footer }: { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-zinc-950/30" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-surface shadow-[var(--shadow-menu)] focus:outline-none">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <DialogPrimitive.Title className="text-[17px] font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Details</DialogPrimitive.Description>
            <DialogPrimitive.Close className="rounded-md p-1 text-text-secondary hover:bg-line-subtle" aria-label="Close">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ------------------------------------------------------------------------------------------------
// Toasts — shown only after the server confirms
// ------------------------------------------------------------------------------------------------

type Toast = { id: number; tone: 'success' | 'danger' | 'info'; message: string };
const ToastContext = createContext<(tone: Toast['tone'], message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast['tone'], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={clsx('flex items-start gap-2 rounded-[var(--radius-panel)] border bg-surface p-3 text-sm shadow-[var(--shadow-menu)]', t.tone === 'danger' ? 'border-red-200' : 'border-line')}>
            {t.tone === 'success' ? <CheckCircle2 className="mt-0.5 size-4 text-success" aria-hidden /> : t.tone === 'danger' ? <XCircle className="mt-0.5 size-4 text-danger" aria-hidden /> : <Info className="mt-0.5 size-4 text-info" aria-hidden />}
            <span className="flex-1">{t.message}</span>
            <button className="text-text-secondary" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Warns before leaving a page with unsaved edits (tab close/reload). */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}
