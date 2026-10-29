// Typed client for the Rust admin API (/api/admin). Same-origin cookies carry the session; every
// state-changing request also sends the session's CSRF token. Nothing sensitive is kept in localStorage.

export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  status: number;
  code: string;
  fields: FieldErrors;
  requestId?: string;
  extra: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown> | undefined) {
    const err = (body?.error ?? {}) as Record<string, unknown>;
    super(typeof err.message === 'string' ? err.message : status === 0 ? 'The server could not be reached.' : `Request failed (${status}).`);
    this.status = status;
    this.code = typeof err.code === 'string' ? err.code : status === 0 ? 'network' : 'unknown';
    this.fields = (err.fields as FieldErrors) ?? {};
    this.requestId = typeof err.request_id === 'string' ? err.request_id : undefined;
    this.extra = err;
  }

  get needsReauth() {
    return this.status === 403 && this.extra.reauth_required === true;
  }
}

let csrfToken: string | null = null;
export const setCsrfToken = (t: string | null) => {
  csrfToken = t;
};

type Listener = (e: ApiError) => void;
const listeners = new Set<Listener>();
/** The shell listens for expired sessions and re-authentication prompts. */
export const onApiError = (l: Listener) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

const BASE = '/api/admin';

// Every API call refreshes the server-side idle timer; the idle warning follows the same clock.
let lastActivity = Date.now();
export const lastApiActivity = () => lastActivity;

async function request<T>(method: string, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  lastActivity = Date.now();
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers, body: payload, credentials: 'same-origin', ...init });
  } catch {
    const e = new ApiError(0, undefined);
    listeners.forEach((l) => l(e));
    throw e;
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => undefined);
  if (!res.ok) {
    const e = new ApiError(res.status, json);
    listeners.forEach((l) => l(e));
    throw e;
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
};

/** Builds a query string from defined, non-empty values. */
export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : '';
}

/** Downloads a file response (exports, résumés) through the browser. */
export async function download(path: string, fallbackName: string) {
  const res = await fetch(BASE + path, { credentials: 'same-origin' });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => undefined));
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ------------------------------------------------------------------------------------------------
// Response shapes (mirroring backend/src)
// ------------------------------------------------------------------------------------------------

export type Data<T> = { data: T };
export type ListMeta = { total: number; page: number; per_page: number };
export type List<T, M = object> = { data: T[]; meta: ListMeta & M };

export type Me = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  branches: { id: string; code: string; name: string }[];
  csrf_token: string;
  session: { id: string; expires_at: string; idle_timeout_seconds: number; recently_authenticated: boolean };
};

export type LeadStatus = 'new' | 'contacted' | 'in_progress' | 'converted' | 'not_interested' | 'spam';
export type Lead = {
  id: string;
  reference: string;
  kind: string;
  name: string;
  phone: string;
  email: string | null;
  contact_masked: boolean;
  city: string | null;
  product: string | null;
  status: LeadStatus;
  branch: { id: string; name: string } | null;
  assignee: { id: string; name: string } | null;
  follow_up_at: string | null;
  possible_duplicate: boolean;
  created_at: string;
};
export type LeadEvent = { kind: string; from: string | null; to: string | null; note: string | null; at: string; actor: string | null };
export type LeadDetail = Lead & {
  phone_as_entered: string | null;
  amount: number | null;
  message: string | null;
  details: Record<string, unknown>;
  source_page: string | null;
  consent: { version: string | null; at: string | null };
  retention_until: string | null;
  notes: { id: string; body: string; created_at: string; author: string }[];
  events: LeadEvent[];
  related: Lead[];
  allowed: { update: boolean; assign: boolean; statuses: LeadStatus[] };
};

export type RateEntry = {
  key: string;
  section: 'fd_slab' | 'deposit' | 'doubling' | 'loan';
  label: string;
  category: 'regular' | 'special' | null;
  tenure_min_days: number | null;
  tenure_max_days: number | null;
  value: string;
  unit: 'percent' | 'months';
  sort_order: number;
};
export type RateSetSummary = {
  id: string;
  label: string;
  revision: number;
  status: string;
  valid_from: string;
  valid_until: string;
  last_valid_day: string;
  entries: number;
  created_by: string | null;
  updated_at: string;
  current: boolean;
  future: boolean;
  expired: boolean;
  live: boolean;
};
export type RateChange = { key: string; label: string; kind: 'added' | 'changed' | 'removed'; before?: string; after?: string };
export type RateSet = {
  id: string;
  lineage_id: string;
  revision: number;
  label: string;
  status: string;
  valid_from: string;
  valid_until: string;
  last_valid_day: string;
  source_document: string | null;
  change_reason: string | null;
  finance_policy: string;
  lock_version: number;
  supersedes_id: string | null;
  updated_at: string;
  submitted_at: string | null;
  contributors: string[];
  entries: RateEntry[];
  comparison: { label: string | null; changes: RateChange[] };
  validation: Record<string, string>;
  approval: { id: string; status: string; comment: string | null; decided_at: string | null; reviewer: string | null } | null;
  allowed: { edit: boolean; submit: boolean; revise: boolean };
  created_by_me: boolean;
};

export type CollectionInfo = { name: string; label: string; singleton: boolean; requires_approval: boolean; financial: boolean; can_edit: boolean; items: number; unreleased: number };
export type ContentListItem = {
  id: string;
  slug: string;
  title: string;
  summary: Record<string, unknown> | null;
  draft: { id: string; revision: number; status: string; updated_at: string; updated_by: string | null };
  live_revision: number | null;
  unreleased: boolean;
  archived: boolean;
};
export type ContentDetail = {
  id: string;
  collection: string;
  slug: string;
  title: string;
  archived: boolean;
  draft: {
    id: string;
    revision: number;
    status: string;
    data: Record<string, unknown>;
    lock_version: number;
    updated_at: string;
    updated_by: string | null;
    submitted_at: string | null;
    note: string | null;
    contributors: string[];
  };
  live: { revision: number; data: Record<string, unknown> } | null;
  unreleased: boolean;
  approval: { id: string; status: string; comment: string | null; decided_at: string | null; submitted_by: string; reviewer: string | null } | null;
  collection_info: { label: string; singleton: boolean; requires_approval: boolean; financial: boolean };
  allowed: { edit: boolean; submit: boolean; archive: boolean };
};
export type Revision = { id: string; revision: number; status: string; created_at: string; updated_at: string; submitted_at: string | null; note: string | null; created_by: string | null; is_live: boolean; is_draft: boolean };

export type Change = { path: string; kind: 'added' | 'removed' | 'changed'; before?: unknown; after?: unknown };
export type ApprovalSummary = {
  id: string;
  subject_type: 'content_revision' | 'rate_set';
  subject_id: string;
  title: string;
  collection: string | null;
  financial: boolean;
  status: string;
  submitted_at: string;
  submitted_by: string;
  note: string | null;
  decided_at: string | null;
  reviewer: string | null;
  comment: string | null;
  mine: boolean;
  can_decide: boolean;
};
export type ApprovalDetail = {
  id: string;
  status: string;
  title: string;
  financial: boolean;
  subject_type: string;
  subject_id: string;
  submitted_by: string;
  submitted_at: string;
  note: string | null;
  reviewer: string | null;
  decided_at: string | null;
  comment: string | null;
  contributors: string[];
  warnings: string[];
  can_decide: boolean;
  blocked_reason: string | null;
  review:
    | { kind: 'rate_set'; compared_with: string | null; valid_from: string; valid_until: string; source_document: string | null; change_reason: string | null; entries: RateEntry[]; changes: RateChange[] }
    | { kind: 'content'; collection: string; item_id: string; data: Record<string, unknown>; live: Record<string, unknown> | null; changes: Change[] };
};

export type PendingItem = {
  item_id: string;
  collection: string;
  collection_label: string;
  slug: string;
  title: string;
  draft_revision: number;
  draft_status: string;
  live_revision: number | null;
  approved_revision: number | null;
  candidate_revision_id: string | null;
  eligible: boolean;
  reason: string | null;
  validation: string[] | null;
  archived: boolean;
  requires_approval: boolean;
  updated_at: string;
  updated_by: string | null;
};
export type Pending = {
  items: PendingItem[];
  rates: { approved_for_today: string | null; label: string | null; live: string | null; changed: boolean; missing: boolean };
  live: { id: string; number: number; activated_at: string | null; rate_set: string | null; rates_valid_until: string | null; content_hash: string } | null;
  can_publish: boolean;
};
export type ReleaseSummary = {
  id: string;
  number: number;
  kind: 'live' | 'preview';
  status: string;
  requested_at: string;
  requested_by: string | null;
  activated_at: string | null;
  scheduled_for: string | null;
  superseded_at: string | null;
  page_count: number | null;
  error: string | null;
  note: string | null;
  content_hash: string;
  rate_set: string | null;
  selected_items: number;
  expiry_fallback: boolean;
};
export type ReleaseDetail = ReleaseSummary & {
  build_log: string | null;
  finance_policy: string;
  source_commit: string | null;
  builder_image: string | null;
  items: { collection: string; slug: string; revision: number }[];
  events: { action: string; outcome: string; details: Record<string, unknown>; at: string; actor: string | null }[];
  allowed: { activate: boolean; schedule: boolean; cancel: boolean; rollback: boolean; open_preview: boolean };
};

export type MediaVariant = { file: string; bytes: number; width: number | null; height: number | null; url: string };
export type MediaItem = {
  id: string;
  kind: 'image' | 'document';
  title: string;
  alt: string | null;
  decorative: boolean;
  updated_at: string;
  version_id: string | null;
  variants: MediaVariant[] | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  usage: number;
};
export type MediaDetail = {
  id: string;
  kind: 'image' | 'document';
  title: string;
  alt: string | null;
  decorative: boolean;
  created_at: string;
  created_by: string | null;
  current: { id: string | null; version: number | null; original_name: string | null; mime: string | null; size_bytes: number | null; width: number | null; height: number | null; sha256: string | null; variants: MediaVariant[] | null; status: string | null };
  versions: { id: string; version: number; original_name: string; size_bytes: number; created_at: string }[];
  used_by: { item_id: string; collection: string; slug: string; live: boolean }[];
};

export type UserSummary = { id: string; email: string; name: string; status: string; two_factor: boolean; last_login_at: string | null; created_at: string; roles: string[]; branches: string[] };
export type UserDetail = {
  id: string;
  email: string;
  name: string;
  status: string;
  two_factor: boolean;
  last_login_at: string | null;
  created_at: string;
  deactivated_at: string | null;
  deactivated_reason: string | null;
  roles: string[];
  branch_ids: string[];
  permissions: string[];
  active_sessions: number;
  invitation_link?: string;
};
export type Role = { id: string; code: string; name: string; description: string; is_system: boolean; permissions: string[]; members: number };
export type Permission = { code: string; description: string; sensitive: boolean };
export type Branch = { id: string; code: string; name: string; region: string; head_office: boolean; active: boolean };

export type AuditEvent = { id: number; at: string; action: string; entity_type: string | null; entity_id: string | null; outcome: string; request_id: string | null; ip: string | null; details: Record<string, unknown>; actor: string | null };
export type Notification = { id: string; kind: string; title: string; body: string; link: string | null; read: boolean; created_at: string };

export type Application = {
  id: string;
  reference: string;
  position: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  experience_years: number | null;
  status: string;
  has_resume?: boolean;
  created_at: string;
};
export type ApplicationDetail = Application & {
  message: string | null;
  resume: { id: string; name: string | null; size: number | null; can_download: boolean } | null;
  consent: { version: string | null; at: string | null };
  retention_until: string | null;
  events: LeadEvent[];
  allowed: { update: boolean; statuses: string[] };
};
