# Acceptance results

What was run, where, and what happened. Dated 28 October 2026. Nothing here was run on a production server or a hosted CI runner.

## Environment

Windows 11, Node 24.11.1, Rust 1.94.1, Chrome (puppeteer-core), npm workspaces. No Docker, no Caddy, no PostgreSQL server installed. The API tests ran against **PGlite** (the PostgreSQL 17 engine compiled to WebAssembly, served over a socket), single connection, so they exercise real PostgreSQL behaviour (triggers, exclusion constraints, `FOR UPDATE`, JSONB) but not multi-connection concurrency or a native server's performance.

## Automated checks

| Suite | Result |
| --- | --- |
| `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` | Clean |
| Backend unit tests (`cargo test`) | 31 passed |
| Backend API integration tests (`--include-ignored`, PGlite) | 10 passed (list below) |
| `packages/finance` | 15 passed |
| Admin `vitest` | 24 passed (forms cover every published field, diff, formatting, status and error components) |
| Admin `tsc -b` and `vite build` | Clean; 17 route chunks, largest 455 kB (content editor, includes TipTap) |
| Public site build from the seed | 90 pages; clean `npm ci` + `npm run build:site:seed` from a fresh copy produces 113 HTML files (the Render path) |
| Release builder against the real API | 113 pages built, validated and activated |
| `tests/e2e/publish-smoke.mjs` | 18 of 18 on a fresh database (a second run reports 17 of 18 only because nothing is pending the second time) |

## The ten API integration tests

1. **Sign-in:** password alone opens nothing; wrong password gives a generic message; both factors open the session; a missing CSRF header is refused; revoking the session blocks the next request.
2. **Enquiries:** same idempotency key returns the same reference and one row; the same key with different content conflicts; the notification is queued in the same transaction (SMTP not configured, still committed); a branch manager sees only own-branch leads in lists and counts, gets 404 for another branch's lead by id (read and update), and has no export permission.
3. **Maker–checker for rates:** a user holding Super Admin *and* the maker role cannot approve their own rate set; the database also refuses a direct self-review; an independent checker can approve; approved rates are frozen at database level; saving with a stale `lock_version` conflicts; approving a future-dated set queues the release preparation.
4. **Content drafts:** editing an approved revision creates revision 2; a stale save conflicts; submitting needs a note for financial content; editing after submission withdraws the review and approving the old revision returns `stale_review`; a placeholder for a rate that does not exist blocks submission.
5. **Releases:** an unapproved financial draft is rejected for a live release; the baseline release's snapshot contains 9 schemes and 28 rates and no personal data; the same idempotency key returns the same release; `audit_events` cannot be updated or deleted.
6. **Résumés:** a 3 MB PDF passes the global 1 MB limit through its own limit (the test failed without it: HTTP 400); stored outside public paths; an Admin gets 403, HR gets the file with `no-store`; a non-PDF is refused with a field error; refused uploads create nothing.
7. **Read endpoints:** about 50 `GET` endpoints, including every content collection, answer 200 for a full-access user.
8. **Release lifecycle:** baseline goes live and records live revisions; an edited FAQ publishes as release 2 and release 1 is superseded; rollback needs a reason and restores release 1 while the newer draft is kept; a failed release cannot be activated; rollback to a release whose rates are no longer in force is refused (`rates_not_current`); when the published rates end, the watchdog prepares exactly one expiry-notice release, alerts approvers, and does not repeat.
9. **Future rates go live by themselves:** an approved set starting in 10 days produces a release scheduled for 00:00 IST on its first day containing the new rate (9.5); nothing activates early; once the date arrives the scheduler queues the activation, the release goes live, the old release is superseded and cannot be rolled back to.
10. **Re-importing the seed:** a changed seed item that nobody has edited is updated (a new approved revision); an item a staff member has edited keeps the staff version and is reported as a conflict. This test was added after a dry run against the local database reported every changed item as "edited by staff": the importer compared a hash of the seed with the hash of the stored JSON, and PostgreSQL stores object keys in a different order. It now checks whether the draft has an author.

A test that exercises the real API, worker and builder together is `tests/e2e/publish-smoke.mjs`: invitation → password → authenticator enrolment → publish (113 pages) → live site serves the release with rates from the rate set and no unresolved placeholders → legacy URL answers HTTP 301 → website enquiry gets a reference and appears in Leads → preview refuses anonymous access, accepts a single-use grant once, serves with `noindex` and "forms off".

## Browser check

The admin dev server and the API were run together and driven with Chrome: 18 screens at 1440 px (dashboard, leads, rates, deposit schemes, branches, homepage, approvals, publish center, users, roles, audit, settings, media, careers, account security, plus a lead, a scheme editor and a rate set) and 4 at 390 px (dashboard, leads, rates, publish center). **No console errors, no failed requests other than the expected 403 on Careers for a role without applicant access, and no horizontal page overflow.** A signed-out visit to a protected page lands on the sign-in page with a return path. Screenshots were reviewed by eye; this found and fixed: Select width classes not applying, link-button padding, rates showing three decimals, a misleading "Changes" list on a first rate set and a wrong "session ended" notice on first visits.

## Scenarios from the specification (§17.2)

| # | Scenario | Covered by |
| --- | --- | --- |
| 1 | Authentication before data | Automated (API test 1, e2e) |
| 2 | Branch isolation | Automated for lists, counts, ids, update, export; **search and the dashboard scope are implemented but not tested** |
| 3 | Durable enquiry, no duplicate | Automated |
| 4 | Mail failure keeps the enquiry | Automated for "not configured"; **retry and back-off of the email job not tested** |
| 5 | Draft isolation | Partly: financial drafts blocked from releases; previews build from drafts. No test asserts a saved draft leaves the live page unchanged. |
| 6 | Optimistic locking | Automated |
| 7 | Independent review | Automated (application and database) |
| 8 | Stale review | Automated |
| 9 | Rate consistency | Automated (finance fixtures; e2e checks 9.25 and ₹1,00,344 on the live scheme page) |
| 10 | Expiry | Automated (watchdog and future-dated activation); **client-side guard not browser-tested** |
| 11 | Build failure never replaces the live release | Builder failure path seen manually; activation failure keeps the old release (test 8); **no automated test of a failed build callback** |
| 12 | Activation recovery after a crash | **Not tested** (the reconcile code exists) |
| 13 | Rollback | Automated |
| 14 | Invalid financial rollback refused | Automated |
| 15 | Preview privacy | Automated end to end (no grant, single use, cookie); **expired grant and other preview id not tested** |
| 16 | Private documents | Automated (résumé); media search leakage n/a |
| 17 | Media replacement stays unpublished | **Not tested** |
| 18 | Import safety | Automated: dry run, idempotent re-import, an unedited item is updated when the seed changes, and a staff-edited item is kept and reported as a conflict (test 10) |
| 19 | Closed vacancy rejects an application | **Not tested** (validation implemented) |
| 20 | Retention / anonymisation | **Not tested** |
| 21 | Exports | Automated: formula neutralisation (unit), permission, xlsx endpoint answers |
| 22 | API outage, site stays up | By design (static files); **not tested** |
| 23 | Keyboard accessibility | **Not tested** |
| 24 | Restore from backup | **Not tested** (no Docker/restic here) |

## Measurements not taken

Admin API p95 latency, dashboard first useful content, public site Lighthouse or web-vitals comparison, and build time on the target server. Observed once on the development machine: a release of 113 pages builds in about 16 seconds in the builder.

## Outstanding before launch

See "What is not done or not verified" in the README. In short: build and run the Docker stack and the Caddy configuration on a real host, run a restore drill, deliver real email, finish the untested scenarios above, run an accessibility pass and an independent security test, and obtain the business inputs listed there.
