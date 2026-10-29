# Lokmangal Multistate: website, admin panel and API

The public website, a staff admin panel and a Rust API for Lokmangal Multistate Co-operative Society Ltd., packaged for Docker.

> **Status (28 October 2026): built and tested on a development machine, not yet deployed.** The sections [What has been verified](#what-has-been-verified) and [What is not done or not verified](#what-is-not-done-or-not-verified) say exactly what has and has not been proven. The product specification this was built from is in [docs/specification.md](docs/specification.md).

## What it does

- **Staff update the website without a developer.** Interest rates, deposit schemes, loans, branches, news, notices, photos, navigation and redirects are edited in the admin panel.
- **Each rate is entered once.** Rates live in a versioned rate set. Scheme text, rate tables, maturity examples and calculators are all filled in from it, so the website cannot show two different rates for the same product.
- **Two people sign off money matters.** A finance user prepares rates, schemes and loans. A different approver reviews exactly what changed. The database refuses a self-approval, even for a Super Admin.
- **Saving never changes the live site.** *Publish* freezes the approved content into a release, builds the whole site, checks it, and only then switches visitors to it. A failed build leaves the old site up, and any earlier release can be restored.
- **Website enquiries become leads.** Forms post to the Rust API, are stored before any success message, get a reference such as `LMS-2026-00123`, and are routed to the right branch. Branch managers only ever see their own branch.
- **Everything is traceable.** Sign-ins, changes, approvals, exports, résumé downloads and releases go into an audit log the application cannot edit or delete.

The public site stays plain static HTML. Visitors never reach the database, and the site keeps serving if the API is down (only the forms need the API).

## Architecture

```mermaid
flowchart LR
    visitor([Visitor]) --> caddy
    staff([Staff]) --> caddy
    subgraph docker["Docker Compose on one server"]
        caddy["Caddy<br/>HTTPS, routing, redirects"]
        releases[("Release folders<br/>immutable builds")]
        admin["admin<br/>React panel"]
        api["api<br/>Rust + Axum"]
        worker["worker<br/>jobs, schedules, release controller"]
        builder["builder<br/>Astro"]
        db[("PostgreSQL")]
        caddy --> releases
        caddy -->|/api/admin| api
        caddy -->|/api/v1 forms| api
        caddy --> admin
        api --> db
        worker --> db
        worker -->|build request| builder
        builder -->|frozen snapshot| api
        builder -->|writes build| releases
        worker -->|loads config| caddy
    end
    worker --> mail([SMTP])
```

| Address | Serves |
| --- | --- |
| `lokmangalmultistate.com` | The live release, plus `/api/v1/enquiries` and `/api/v1/applications` |
| `admin.lokmangalmultistate.com` | Admin panel and `/api/admin/*` (staff only) |
| `preview.lokmangalmultistate.com` | A private build of drafts, opened through a single-use link |

## Repository layout

```
frontend/          Public website (Astro, static). Reads content from a snapshot; design unchanged.
  seed/            snapshot.json: today's content, used for offline work and as the first import
  builder/         Small internal service that builds a release from a frozen snapshot
admin/             Staff admin panel (React + TypeScript + Tailwind)
backend/           Rust API, job worker, release controller and operator CLI
  migrations/      PostgreSQL schema and the starting roles
  tests/           API tests against a real database
packages/finance/  FD / RD / monthly-income / EMI rules and rate placeholders, shared by site and admin
deploy/            Production Docker Compose, Caddy templates, backup service, operator scripts
docs/              Admin guide, runbook, API, database, design system, decisions, results
tests/e2e/         Publish → live → enquiry → preview smoke test
admin-prototype/   The earlier clickable design prototype (sample data, not connected). Design reference only; its own project (`cd admin-prototype && npm install && npm run dev`).
```

## Run it on your computer

Needs Node.js 22.12 or newer and Rust (stable).

**Quickest, no Docker (Windows, Mac or Linux):** one command starts the database, API, worker, builder, admin panel and the local website, and prints a first admin invitation link:

```bash
npm install
npm run local -- --invite=you@example.com --name="Your Name"
```

Then open http://localhost:5173 with the invitation link, set a password and scan the QR code with an authenticator app, and click **Publish center → Publish selected**; the website appears at http://localhost:4400. Your data is kept in `var/pgdata`, so later runs are just `npm run local` (Ctrl+C stops everything). While developing, `node tools/local-dev/publish.mjs "what changed"` publishes the approved content as a new release without clicking through the panel (it uses a one-off account that is deactivated afterwards, and only talks to a local API). This uses PGlite (PostgreSQL running inside Node, one connection) for convenience; it is for trying the system out, not for production.

**With Docker and a real PostgreSQL** (closer to production), step by step:

```bash
npm install
docker compose up -d                       # PostgreSQL :5432 and Mailpit :8025 (catches every email)

cd backend
cp .env.example .env                       # development settings; edit if your ports differ
cargo run --bin lokmangal-cli -- migrate
cargo run --bin lokmangal-cli -- import-seed ../frontend/seed/snapshot.json
cargo run --bin lokmangal-cli -- create-admin --email you@example.com --name "Your Name"
#   → prints an invitation link: open it, choose a password, scan the QR code with an authenticator app

cargo run --bin lokmangal-server           # API :8000, internal :8001, worker, local site :4400, preview :4401

# in other terminals, from the repository root
npm run builder -w @lokmangal/frontend     # release builder :4300
npm run dev -w @lokmangal/admin            # admin panel http://localhost:5173
```

Then in the admin panel open **Publish center → Publish selected**. The first release builds the website (about 20 seconds) and serves it at http://localhost:4400. The public site can also be worked on alone, with no backend: `npm run dev -w @lokmangal/frontend` (http://localhost:4321, uses `frontend/seed/snapshot.json`).

`just` shortcuts exist for all of this (see [justfile](justfile)). On a machine without Docker, any PostgreSQL 15+ server works; set `DATABASE_URL` in `backend/.env`.

### Checks and tests

```bash
cd backend && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
npm run test:finance                       # calculation rules against the leaflet figures
npm test -w @lokmangal/admin               # admin unit tests
npm run typecheck -w @lokmangal/admin && npm run build -w @lokmangal/admin
npm run build:site:seed                    # public site from the seed
# API integration tests need a PostgreSQL server (each test creates its own database):
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres cargo test -- --include-ignored
# Full publish loop against a running stack (needs a fresh invitation link):
node tests/e2e/publish-smoke.mjs "<invitation link>"
```

## Deploying

### Now: the website only, on Render

`render.yaml` still deploys the public website as a static site, built from `frontend/seed/snapshot.json`. Steps: sign in at render.com with GitHub → **New + → Blueprint** → choose this repository → **Apply**. Render runs `npm ci && npm run build:site:seed` and publishes `frontend/dist`. Render cannot run PHP or the Rust API, so on Render the enquiry forms show the "email us / call us" fallback.

### Next: the whole system on one server with Docker

1. A clean Ubuntu 24.04 server in India (2 vCPU / 4 GB / 80 GB is the planning baseline; measure before you commit), ports 80/443 open, DNS A records for the site, `www`, `admin` and `preview` hosts. **Do not reuse the old WordPress server.**
2. `git clone` the repository, `cd deploy`, `cp .env.example .env`, fill in every value (generate secrets with `openssl rand -base64 48`).
3. Images: push a tag such as `v2026.11.0`; GitHub Actions builds `lokmangal-api`, `lokmangal-site-builder` and `lokmangal-admin` into GHCR ([.github/workflows/release.yml](.github/workflows/release.yml)). Or build them on the server with `docker build -f backend/Dockerfile .` and so on.
4. `docker compose -f compose.prod.yaml up -d`, then:
   ```bash
   docker compose -f compose.prod.yaml run --rm --entrypoint lokmangal-cli api create-admin --email you@org --name "Name"
   docker compose -f compose.prod.yaml run --rm --entrypoint lokmangal-cli -v "$PWD/../frontend/seed:/seed:ro" api import-seed /seed/snapshot.json
   ```
5. Sign in at the admin address, **Publish selected**, and check the public site. Until the first release the public address shows a short holding page.
6. Updates: `./scripts/deploy.sh <tag>` (checks for a recent backup, pulls images, runs migrations once, restarts, waits for health). Day-to-day content changes need no deployment at all: staff publish from the admin panel.

Details, recovery steps and monitoring are in [docs/runbook.md](docs/runbook.md).

## What has been verified

On the development machine (Windows 11, Node 24.11, Rust 1.94, Chrome):

| Area | Result |
| --- | --- |
| Public site | Builds from the snapshot to 90 pages. Output matches the previous site except the careers position list, which now comes from data (it gained *EDP / IT Staff*). |
| Rate rules | 15 tests, including the published Lakshadish maturities (₹1,00,344 / 1,01,705 / 1,01,583 / 1,02,799), FD, monthly income and EMI examples. |
| Backend | `cargo fmt` and `clippy -D warnings` clean. 31 unit tests and 9 API integration tests pass. |
| API integration tests | Run against PGlite, which is the real PostgreSQL 17 engine compiled to WebAssembly (not a separate PostgreSQL server). They cover sign-in with two factors and instant session revocation, idempotent enquiries, branch isolation (lists, counts, direct ids, exports), a maker being unable to approve their own rates (also directly in the database), stale reviews after an edit, edit conflicts, an unapproved financial draft being blocked from a live release, an append-only audit table, private résumés, release activation, **rollback (and its refusal when rates are no longer in force)**, the **rate-expiry watchdog**, **approved future rates producing a release that goes live on their first day**, and about 50 read endpoints answering for a full-access user. Testing found and fixed three real bugs: résumé uploads were blocked by the 1 MB body limit and the scheduler held a database connection while asking for another (both found by the new tests), and the rate-set list failed on an ambiguous SQL column (found by the browser check, now covered by the read-endpoint test). |
| Migration | The 197 existing items import cleanly: one rate set (28 rates), 9 single-page contents and 187 collection items (9 schemes, 11 loans, 68 branches including the head office, 54 posts, 23 redirects, 16 documents, 4 jobs, 1 notice, 1 gallery album). Importing again changes nothing. |
| Release loop, end to end | A real API, worker and builder: invitation → password → authenticator setup → publish → **113 pages built, validated and activated** → live site serves the release with rates from the rate set and no unresolved placeholders → legacy URL answers with a real HTTP 301 → a website enquiry gets a reference and appears in the inbox → a private preview works only through a single-use link. 18 of 18 checks. |
| Admin panel | Type-check, 24 unit tests and a production build pass. 18 admin screens were opened in Chrome against the running API at 1440 px and 4 at 390 px: no console errors, no horizontal overflow. |

Full detail, including the numbers, is in [docs/acceptance-results.md](docs/acceptance-results.md).

## What is not done or not verified

Please read this before launch.

**Not run at all on this machine**

- **Docker images and the Compose stack** (Docker is not installed here). The Dockerfiles, `compose.prod.yaml` and the CI workflow were written to the same layout as the tested local run, but have never been built.
- **Caddy.** The Caddyfile templates and the activation through Caddy's admin API have never been loaded into a real Caddy. Locally the release controller uses a file-based driver instead.
- **Backups and restore** (`deploy/backup`, `restore.sh`), real **SMTP delivery**, and a real PostgreSQL server (only PGlite).
- **Performance targets, a manual keyboard and screen-reader pass, an automated accessibility scan, and an independent security test (VAPT).** None has been done.

**Specified features that are not built yet**

- Homepage **hero slides** and scheduled slides (the hero is still part of the page template; the Homepage screen edits the statistics and the announcement bar).
- Long-form page text (About, Chairman's message, Terms, Privacy) stays in the reviewed templates; Pages and people edits the structured content (people, FAQ, services, social responsibility, deposit and loan page details, organisation details).
- Branch **spreadsheet import/export** and the branch manager's **"suggest a change"** flow (the permission exists; there is no screen or endpoint yet).
- **Per-post scheduling** (a whole release can be scheduled instead), the SEO **link checker**, per-page SEO overrides, saved table views and column preferences, drag-and-drop ordering (move up/down buttons are provided), a custom date range in the dashboard UI, and a translation dictionary for the admin interface (English only).
- A **Nearest branch** field in the public enquiry forms (the API already accepts it), CAPTCHA (honeypot, timing and rate limits are in), and merging duplicate leads.
- Marathi public-site translation is outside this build; Marathi text and Devanagari fonts are supported in content fields.

**Needs the society's input before launch**

Approved logo and approver/checker names; real rates and calculation policy sign-off ([docs/decisions/0002-calculation-policy.md](docs/decisions/0002-calculation-policy.md)); SMTP provider and recipient mailboxes; server, domain and DNS access; retention periods; consent wording reviewed by the society's legal adviser; whether voter-list PDFs may stay public; whether staff may sign in from anywhere or only office networks.

## Documentation

| Document | For |
| --- | --- |
| [docs/admin-guide.md](docs/admin-guide.md) | Staff: how to do each job in the admin panel |
| [docs/runbook.md](docs/runbook.md) | Whoever runs the server: failed builds, outages, backups, restore |
| [docs/api.md](docs/api.md) | Developers: conventions, errors and every endpoint |
| [docs/database.md](docs/database.md) | Developers: schema, constraints and data lifecycle |
| [docs/design-system.md](docs/design-system.md) | Designers and developers: tokens and components |
| [docs/migration-report.md](docs/migration-report.md) | What moved from the old site, and what was left out |
| [docs/acceptance-results.md](docs/acceptance-results.md) | Test environment and observed results |
| [docs/decisions/](docs/decisions/) | Why the important choices were made |
| [docs/specification.md](docs/specification.md) | The specification this was built from |

## Before going live

- **Secure or retire the old server.** Only genuine pages and posts were carried over from the old WordPress site. Reset every WordPress, hosting and FTP password, and use a new, clean server for this system.
- **Keep `/wp-content/uploads/2025/04/` reachable** until the 13 district voter-list PDFs (about 530 MB) are moved into the media library; the notices page links to them there.
- Have someone review the rewritten page wording, especially the Chairman's message, Terms of use and Privacy policy.
- Figures come from the 2026–27 leaflets: 60 branches, ₹751+ Cr deposits, ₹1195+ Cr business, rates valid until 31 March 2027. The homepage statistics are typed content, not live data: keep their *source* and *as of* fields filled in.
- Annual reports for 2017–18 onwards were never uploaded to the old site. Add them in **Notices and documents**.
