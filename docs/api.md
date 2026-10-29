# API

Rust (Axum). Three groups of routes, each reachable only where it should be.

| Prefix | Who | Reached through |
| --- | --- | --- |
| `/api/v1/*` | Anyone: website forms and health | Public host (Caddy allows only the three form/health paths) |
| `/api/admin/*` | Signed-in staff | Admin host only (also refused on other hosts in production) |
| `/api/preview/*` | A browser with a preview grant | Preview host |
| `/api/internal/*` | The builder only | Internal listener (port 8001), never routed by Caddy; bearer `BUILD_SERVICE_TOKEN` |

## Conventions

- JSON in and out (the public enquiry endpoint also accepts `multipart/form-data` and URL-encoded forms, as the website posts them). Request bodies are limited to 1 MB (uploads: 15 MB images, 50 MB PDFs, 5 MB résumés).
- Success: `{ "data": …, "meta": …, "request_id": … }`. Lists accept `page`, `per_page` (25, 50 or 100) and `q`, and return `meta.total`.
- Errors, always:
  ```json
  { "error": { "code": "validation_failed", "message": "Please correct the highlighted fields.",
               "fields": { "phone": "Enter a valid 10-digit mobile or phone number." }, "request_id": "req_…" } }
  ```
  `201` created · `202` accepted (builds) · `401` not signed in · `403` not allowed (a record you may not see is `404`, the same as a missing one) · `409` conflict (`edit_conflict`, `stale_review`, `idempotency_conflict`, `rule_violation`…) · `422` validation · `429` throttled.
- Every response carries `x-request-id`; the same id appears in logs and error bodies.
- Times are ISO 8601 UTC; rates are decimal **strings** (`"9.250"`), never floats.
- **Session:** `__Host-lm_session` cookie (`HttpOnly; Secure; SameSite=Strict`; plain name over HTTP in development). Every non-GET admin request needs `X-CSRF-Token` (the value returned by sign-in and `GET /auth/me`) and, if sent, an `Origin` equal to the admin origin. Sessions are server-side rows, expire after 30 minutes idle / 12 hours, and are revocable instantly.
- **Re-authentication:** sensitive actions (users, roles, 2FA reset, access settings, privacy deletions) return `403` with `reauth_required: true` until `POST /auth/reauth` (password + code) succeeds; it then holds for 10 minutes.
- **Optimistic locking:** drafts and rate sets carry `lock_version` and the draft `revision_id`; saving with a stale one returns `409 edit_conflict`.
- **Idempotency:** public submissions accept an `Idempotency-Key` header (8–100 chars). The same key with the same content returns the original reference (`200`); the same key with different content is `409`.

## Public (`/api/v1`)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/enquiries` | Website enquiry. `form` = `account`, `deposit`, `loan`, `contact`, `callback`, `service`, or `career` (hands over to applications). Validated against the live release's products, branches and open jobs. Committed together with its notification job before `201 { reference }`. |
| POST | `/applications` | Job application with an optional PDF `resume` (checked as a real, complete PDF ≤ 5 MB; stored privately). |
| GET | `/health`, `/ready` | Liveness; readiness (database reachable). No internals exposed. |

Spam handling: a hidden `website` field or a submission under 3 seconds is stored as *spam* (not rejected, not emailed); 8 enquiries and 5 applications per IP per hour.

## Staff (`/api/admin`)

Permission names refer to the roles in [database.md](database.md).

**Auth**: `POST /auth/login` · `/auth/2fa` (code or recovery code) · `/auth/2fa/enroll` · `/auth/2fa/verify` · `/auth/logout` · `/auth/keepalive` · `/auth/reauth` · `/auth/password` · `/auth/recovery-codes` · `/auth/forgot-password` · `/auth/reset-password` · `/auth/invitations/accept` · `/auth/sessions/{id}/revoke` · `/auth/sessions/revoke-others`; `GET /auth/me` · `/auth/sessions`.

**Leads** (`leads.*`): `GET /leads` (filters `status`, `kind`, `branch`, `assignee`, `from`, `to`, `follow_up_due`, `duplicate`, `q`, `sort`; scope applied server-side) · `GET /leads/export?format=csv|xlsx` (`leads.export`, formula-neutralised cells, audited) · `GET`/`PATCH /leads/{id}` · `POST /leads/{id}/notes` · `POST /leads/{id}/follow-ups`.

**Careers** (`applications.*`): `GET /applications`, `GET`/`PATCH /applications/{id}`, `GET /private-files/{id}/download` (`applications.resume.download`; no-store; audited). Job openings are content (below).

**Content** (any collection in `content::collections`: `settings`, `home`, `navigation`, `people`, `faq`, `services`, `csr`, `deposit_page`, `loan_page`, `deposit_scheme`, `loan`, `branch`, `post`, `notice`, `document`, `gallery_album`, `job_opening`, `redirect`):
`GET /content` (module overview) · `GET`/`POST /content/{collection}` · `GET`/`PATCH /content/{collection}/{id}` · `POST …/submit` (financial collections) · `GET …/revisions`, `GET …/revisions/{n}` · `POST …/restore` (new draft from an old revision) · `POST …/archive`, `…/unarchive`.
Each collection has a typed schema; unknown fields are refused, rich text is sanitised, links and asset paths are allow-listed, rate placeholders are checked.

**Rates**: `GET`/`POST /rate-sets` (`POST` may copy from an existing set) · `GET`/`PATCH /rate-sets/{id}` · `POST …/revise` · `POST …/submit`.

**Approvals**: `GET /approvals` · `GET /approvals/{id}` (before/after) · `POST …/approve` · `POST …/reject` (comment required). Approver ≠ anyone who created, edited or submitted the subject; enforced in a database trigger too.

**Publishing**: `GET /publish/pending` · `POST /previews` · `POST /previews/{id}/access` (single-use grant, 2 minutes) · `GET`/`POST /releases` (`revision_ids`, optional `schedule_at`, `idempotency_key`) · `GET /releases/{id}` · `POST …/activate` · `POST …/schedule` · `POST …/cancel` · `POST …/rollback` (reason; refused if the release's rates are not those in force).

**Media** (`media.*`): `GET`/`POST /media` (multipart) · `GET`/`PATCH`/`DELETE /media/{id}` · `POST /media/{id}/versions` · `GET /media/files/{version}/{file}`.

**Administration**: `GET`/`POST /users` · `POST /users/preview-permissions` · `GET`/`PATCH /users/{id}` · `POST …/deactivate`, `…/reactivate`, `…/reset-2fa`, `…/resend-invitation` · `GET /roles` · `PATCH /roles/{id}` · `GET /settings` · `PUT /settings/{notifications|privacy|publishing|access}` · `POST /settings/test-email` · `GET /system/status` · `GET`/`POST /data-requests` · `POST /data-requests/{id}/complete`.

**Read models**: `GET /dashboard?range=today|7d|30d` · `GET /audit` · `GET /audit/export` (`audit.export`) · `GET /notifications` · `POST /notifications/read-all`, `…/{id}/read` · `GET /directory/branches`, `/directory/assignees` · `GET /search?q=`.

## Preview host (`/api/preview`)

`GET /exchange?grant=…` redeems the single-use grant, sets a host-only cookie scoped to one release and redirects to `/` (the token leaves the URL at once). `GET /check` answers Caddy's `forward_auth` with `X-Preview-Release` (the folder to serve) or `401`. Responses are `no-store`, `no-referrer` and `noindex`.

## Internal (builder)

`GET /api/internal/releases/{id}/snapshot` returns the frozen, allow-listed public snapshot. `POST /api/internal/builds/{id}/status` reports `building | validating | ready | failed` (idempotent; ignored once the release is no longer building). The builder refuses any snapshot or callback URL that is not on the API's own origin.

## Snapshot format

`schemaVersion`, `release` (`id`, `kind`, `financePolicy`, `contentHash`), `rateSet` (entries with decimal-string values), `singletons`, `collections` (each item `{ slug, data }`), `media` (version ids to copy). It contains only approved public content: no leads, applicants, users or notes. `frontend/seed/snapshot.json` is the same format.

## OpenAPI

A generated OpenAPI contract and typed client are **not yet produced**: the admin panel's request/response types are written by hand in `admin/src/lib/api.ts` and the API tests cover the shapes it relies on. Generating the contract from the Rust types (and checking drift in CI) is the next improvement.
