# Database

PostgreSQL 17. Migrations in `backend/migrations` run automatically when the API starts (and once, with `lokmangal-cli migrate`, in `deploy.sh`). Times are `timestamptz` (UTC) and shown in IST; rates are `numeric`, never floating point.

## Tables

| Group | Tables | Notes |
| --- | --- | --- |
| Identity | `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `branches`, `user_branch_scopes` | Users are deactivated, never deleted. Branch scope limits what branch managers can see. |
| Authentication | `sessions`, `recovery_codes`, `auth_tokens`, `login_attempts` | Tokens and recovery codes are stored as keyed hashes (HMAC-SHA-256 with `SESSION_KEY`); authenticator secrets are encrypted (ChaCha20-Poly1305, `DATA_ENCRYPTION_KEY`). |
| Content | `content_items`, `content_revisions`, `revision_contributors` | One item per page/record; immutable once submitted. `draft_revision_id` and `live_revision_id` point into the revisions. |
| Rates | `rate_sets`, `rate_entries`, `rate_set_contributors` | Versioned by `lineage_id` + `revision`. |
| Review | `approvals` | One pending review per subject. |
| Media | `media`, `media_versions`, `media_usage`, `private_files` | Files live on disk; `private_files` holds résumés. |
| Releases | `releases`, `release_items`, `activation_events`, `preview_grants`, `preview_sessions` | `releases.snapshot` is the frozen content a build is made from. |
| Enquiries | `enquiries`, `enquiry_notes`, `enquiry_events`, `job_applications`, `application_events` | Contact data is removed by the retention job; events and counts remain. |
| Operations | `jobs`, `notifications`, `app_settings`, `consent_versions`, `data_requests`, `import_runs`, `source_mappings`, `audit_events` | `jobs` is the durable queue and email outbox. |

## Rules the database enforces (not only the application)

- **`audit_events` is append-only.** A trigger refuses `UPDATE` and `DELETE`, except inside the documented retention procedure (`SET lokmangal.audit_retention = 'on'`). The application database user does not need anything else.
- **Independent review.** `approvals_independent_reviewer` raises an error if the reviewer created, edited or submitted the subject (content revision or rate set). `approvals` also has a `CHECK (reviewer_id <> submitted_by)`, requires reviewer and decision time for a decided review, and requires a comment for a rejection.
- **Frozen revisions.** A trigger refuses edits to the data of a content revision unless it is a draft or *changes requested*. Rate sets and their entries freeze the same way once submitted.
- **One timeline of approved rates.** An exclusion constraint (`daterange(valid_from, valid_until, '[)') WITH &&` where status is approved) prevents two approved rate sets from overlapping. Draft sets may overlap.
- **One live release, one activation at a time.** Partial unique indexes allow at most one `live` and one `activating` release; activation also takes an advisory lock.
- **Idempotent submissions.** Unique `idempotency_key` on enquiries, applications and releases; a unique `dedupe_key` on jobs.
- Slugs, branch codes, rate keys, units and status values are `CHECK`-constrained; `lock_version` supports optimistic locking.

## Permissions and starting roles

Permissions are rows in `permissions`; roles are bundles in `role_permissions` and can be adjusted in the admin panel (Users and roles). The maker–checker rule cannot be switched off by editing a role. Starting roles (migration `0002`):

| Role | Main permissions |
| --- | --- |
| Super Admin | Everything except applicant data: users, roles, settings, publish, rollback, audit, leads (all), content, products, rates, `financial.approve` (never for their own work). Applications and résumés need an explicit grant. |
| Admin | Content, branches, careers, leads (all, with contact details and export), media, preview/publish/rollback, applications (view/update, not résumés), audit view. No rates, no financial approval, no role management. |
| Editor | Content, media, preview. |
| Finance (maker) | Rates, deposit schemes, loans, media, preview. |
| Approver (checker) | `financial.approve`, preview, publish, audit view. |
| Branch Manager | Own-branch leads (contact visible), update leads, suggest branch changes (not yet built). |
| HR | Job openings, applications, résumé download. |
| Auditor | Read-only content, all leads (contact masked), applications, audit. |

## Data lifecycle

- **Retention** (Settings → Privacy, defaults 24 months for enquiries, 12 for applications): a daily job anonymises expired records (name, phone, email, city, message, notes, and the résumé file) while keeping type, status and dates for statistics.
- **Deletion requests** (Settings → Data requests): matching enquiries and applications are anonymised the same way, and recorded.
- **Sessions, login attempts, expired tokens and preview grants** are purged on a schedule.
- **Audit events** are kept until a controlled retention operation removes old rows; they hold references (reference numbers, ids, field names), not contact details.
- **Releases**: the newest N live releases (default 10) keep their files for rollback; previews are removed after two days.

## Migrations policy

Never edit an applied migration; add a new one. Prefer backward-compatible changes (add columns/tables, backfill, then switch code) because `deploy.sh` migrates before the new API starts. `cargo sqlx prepare` is not used: queries are checked at runtime and by the API tests, which apply all migrations to an empty database.
