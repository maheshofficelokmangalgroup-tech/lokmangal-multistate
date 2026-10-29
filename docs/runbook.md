# Runbook

For whoever runs the server. Commands run in the `deploy/` folder on the production host. `dc` below means `docker compose -f compose.prod.yaml`.

> Status: written alongside the code. The Docker stack, Caddy and the backup service have **not yet been run** (see the README). Treat the first production deployment as the real test of these steps and correct this document with what you learn.

## Map

| Container | Does | Public? |
| --- | --- | --- |
| `caddy` | HTTPS, host routing, serves the live release and previews, real HTTP redirects | Ports 80/443 only |
| `api` | Rust API (`/api/v1` public, `/api/admin` staff, `/api/preview`, internal listener on 8001) | No |
| `worker` | Job queue, schedules, release controller (renders and loads the Caddy config) | No |
| `builder` | Builds a release with Astro from a frozen snapshot | No |
| `admin` | The admin single-page app | No |
| `db` | PostgreSQL 17 | No |
| `backup` | Nightly encrypted restic backup | No |

Volumes: `pgdata`, `media` (uploads), `private` (résumés), `releases`, `previews`, `state` (rendered Caddy config), `caddy_data` (certificates).

The public site is plain files. **If the API or worker is down, visitors still get the site;** only the enquiry forms fail (the page then shows the email/phone fallback).

## First installation

1. Server: Ubuntu 24.04 in India, firewall allows 22 (key only), 80, 443. Install Docker Engine. Point DNS A records for `@`, `www`, `admin` and `preview` at it.
2. `cp .env.example .env` and fill every value. Store a copy of `DATA_ENCRYPTION_KEY` and `BACKUP_PASSWORD` **offline and separately**: without them, authenticator secrets and backups cannot be read.
3. `dc up -d`, then `dc ps` (everything `healthy`/`running`).
4. Create the first Super Admin and import the starting content (commands in the README), open the admin address, finish sign-in, **Publish**.
5. Check: public site loads over HTTPS; `https://<site>/release.json` shows the release id; an enquiry from the form appears in Leads; `admin.` redirects to sign-in.

## Routine

| When | What |
| --- | --- |
| Content change | Nothing. Staff publish from the admin panel. |
| New software version | `./scripts/deploy.sh <tag>` (refuses without a backup in the last 26 h unless `SKIP_BACKUP_CHECK=1`). Migrations run once before the API restarts. Publish once afterwards if the site design changed. |
| Daily | Look at the admin **Settings → Operations**: backup status, failed jobs. |
| Monthly | **Restore drill** on a spare machine (below). |
| Quarterly | Rotate secrets that staff or contractors have seen; check disk use (`docker system df`, `df -h`). |
| Before each 1 April | An approved rate set for the new year should exist by March. The dashboard warns 30, 7 and 1 days before expiry. |

## Problems

### A release failed to build
The old site is still live. Admin → Publish center → open the release → *Build log* and the error. Common causes: a placeholder for a rate that does not exist (fix the content or the rate set), content that fails validation, an image reference that was retired, the builder out of memory (`dc logs builder`; raise its memory limit in the compose file). Fix and publish again. A stuck build is failed automatically after `BUILD_TIMEOUT_SECONDS` (300 by default).

### Activation failed or a release is stuck "activating"
The worker restores the previous release if activation fails. After a crash it reconciles on start by checking what Caddy is really serving (`/release.json`) and either completes or fails the activation. Force it: `dc exec worker lokmangal-cli reconcile`. Look at `dc logs worker`. If Caddy rejected the rendered config, the message is in the release's error; the rendered file is in the `state` volume (`Caddyfile.rendered`).

### A scheduled release did not go live
Check `dc ps` (worker running?) and `dc logs worker`. The release row stays `scheduled`; the scheduler re-checks every 30 seconds, so it goes live as soon as the worker is back, after re-checking that its rates are still the approved ones in force.

### Rates are about to expire / have expired
Approve the next rate set in time (admin → Interest rates). If rates expire with nothing ready, the watchdog publishes an *expiry notice* release by itself (calculators paused, validity notice shown) and alerts approvers. Approve the new set and publish; the notice disappears.

### Emails are not arriving
Admin → Settings → Operations (failed jobs) and *Send test*. `dc logs worker | grep -i smtp`. Jobs retry with back-off (30 s doubling, up to 8 attempts) and failed ones raise a notification. **Enquiries are saved even when email fails**; staff still see them in Leads.

### The admin panel says "connection" or 5xx
`dc ps`, `dc logs api`. Readiness: `dc exec api curl -fsS http://127.0.0.1:8000/api/v1/ready`. A failing readiness check means the database is unreachable: `dc logs db`, disk full?

### Locked out
- Lost phone: use a recovery code at sign-in. No codes left: another Super Admin resets two-step (Users and roles → person → *Reset two-step*), or on the server `dc run --rm --entrypoint lokmangal-cli api reset-2fa --email x --reason "verified by phone"`.
- No Super Admin can sign in: `dc run --rm --entrypoint lokmangal-cli api create-admin --email x --name "Name"` prints an invitation link.
- Login throttling lifts by itself after 15 minutes.

### Suspected intrusion
Deactivate the account (signs it out everywhere), review **Audit log** filtered by actor and time, rotate `SESSION_KEY` (signs everyone out and invalidates every recovery code, so people will need new ones), and `DATA_ENCRYPTION_KEY` only with a planned re-enrolment of two-step for all users (their authenticator secrets cannot be read with a new key). Keep the audit export.

## Backups and restore

- **What:** nightly (01:30 IST) `pg_dump`, `media`, `private` and the rendered Caddy config, encrypted with restic to the off-site repository. Kept: 7 daily, 4 weekly, 12 monthly. A 2 % data check runs each night. The result shows in admin → Settings → Operations.
- **Run now:** `dc exec backup backup.sh`.
- **Targets (to be demonstrated in a drill, not yet proven):** at most 24 hours of data loss, back within 4 hours on a fresh server.
- **Drill / disaster recovery:** on a clean host with the same `.env` (leave `SMTP_HOST` empty so no mail is sent): `./scripts/restore.sh latest`, copy the restored `media` and `private` folders into their volumes, `dc up -d`, publish once from the admin panel to rebuild the site from restored content, then verify: sign-in works, Leads count matches, a résumé downloads for HR, the site loads, `release.json` matches.
- **Important:** a website rollback does not restore deleted data. Database recovery is a restore.
- **Privacy:** a restore brings back data that may since have been anonymised or deleted. The retention job runs by itself every day, but re-apply any deletion requests completed since the backup (they are listed under Settings → Data requests).

## Monitoring (set up on the host)

Watch from outside the server: `https://<site>/`, `https://admin.<site>/`, `https://<site>/api/v1/health`. Alert on: failed release or build, failed backup or backup older than 26 h, disk over 80 %, repeated login failures, certificate expiry under 14 days. Logs are JSON on stdout (`dc logs -f --tail 200 api`); keep 30 days (Docker log rotation in `/etc/docker/daemon.json`). Logs contain request ids but no contact details, passwords or tokens.

## Security notes

Only Caddy publishes ports. The `internal` Docker network has no internet access. Containers drop capabilities and the API and worker run read-only. Caddy's admin API listens only on the internal network. Secrets live only in `.env` (mode 600, never in git). Keep the host patched (unattended upgrades) and use SSH keys only. Have an independent security test done before launch.
