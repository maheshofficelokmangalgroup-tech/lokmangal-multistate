# 0004: Storage layout and pinned versions

## Files

| Root (env) | Holds | Access |
| --- | --- | --- |
| `MEDIA_STORE_ROOT` | Uploaded media: one folder per immutable version, `480.webp`, `960.webp`, `1600.webp` (never upscaled) or `document.pdf` | API writes; builder reads. Never served directly: drafts and replaced files must not be public. |
| `RELEASES_ROOT/<release>/media/<version>/…` | The versions a release references, hard-linked from the store | Caddy (read-only). Public URL `/media/<version-id>/<file>`; immutable, so cached for a year. |
| `PREVIEWS_ROOT` | Preview builds | Only through the authenticated preview host |
| `PRIVATE_FILES_ROOT` | Résumés (`<id>.pdf`) | Only through the permission-checked, audited download endpoint |

A media item keeps a stable id while each upload is a new immutable *version*; content references a specific version URL. Replacing a file therefore changes nothing on the live site until content that uses the new version is published, and a rolled-back release keeps its own copies. A shared object store (S3 and similar) can replace the folders later behind the same layout.

Upload handling: type checked from the bytes, images decoded within pixel and memory limits and re-encoded to WebP (which drops metadata and anything hidden), PDFs checked for structure and an end marker, server-generated names, SVG/GIF/HTML/archives refused.

## Versions in use

Pinned in manifests and lockfiles; the proposed baselines in the specification were treated as defaults, not requirements.

| Component | Version | Note |
| --- | --- | --- |
| Rust | 1.94 stable, edition 2024 | |
| Axum / SQLx / Tokio | 0.8 / 0.8 / 1 | |
| PostgreSQL | 17 | API tests ran on PGlite (PostgreSQL 17 engine in WebAssembly) |
| Node.js | 24.11.1 (Render and Docker) | `engines`: ≥ 22.12 |
| Astro | 7.3.8 | unchanged from the existing site |
| React | **18.3**, not 19 | `npm` resolved 18; the specification proposed 19. An upgrade is a separate, tested step. |
| Vite / TypeScript / Tailwind | 8 / 7 / 4 | |
| TanStack Router, Query | 1.x, 5.x | |
| Caddy | 2.10 | |

Dependency scanning (`cargo audit`, `npm audit`) is in the CI workflow but has not run yet on a hosted runner.
