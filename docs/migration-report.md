# Migration report

What moved from the previous project (the Astro site whose content lived in `src/data/*.ts` and `posts.json`) into the new structure, and what needs a decision.

## How

1. The site moved to `frontend/` with `git mv` (history kept).
2. A one-off converter (kept out of the repository) read the old data modules and produced `frontend/seed/snapshot.json`, replacing typed rates with placeholders. It **checked itself**: for every scheme and loan it resolved the placeholders again and required the result to equal the original data exactly, and it refuses to write a file otherwise.
3. The site's `src/data/*.ts` files now read the snapshot instead of holding the content, so the pages are unchanged.
4. `lokmangal-cli import-seed` loads the snapshot into the admin system. Each item has a source key and checksum: re-running changes nothing, updates only items staff have not touched, and reports (never overwrites) items staff changed.

## Verified

| Check | Result |
| --- | --- |
| Public build before vs after | Same 90 pages and the same 291 files, plus the new `release.json` marker. After normalising the random form ids, the only content difference is the careers position list (now data-driven; *EDP / IT Staff* now also appears in the form). |
| Every seed item against the admin schemas | All 197 validate; all but the sanitised FAQ/post HTML round-trip byte for byte. |
| Import | 197 created, then 0 created / 197 unchanged on a second run; a dry run changes nothing. |
| Release built from the imported data | 113 pages; scheme pages show the same rates and maturity examples (₹1,00,344 etc.) as before. |

## Mapping

| Old source | Now |
| --- | --- |
| `site.ts` identity, contacts, links | `settings` (organisation details) |
| `site.ts` statistics | `home.stats`; announcement bar now `home.announcement` |
| `site.ts` navigation and footer | `navigation` |
| `site.ts` election notices, member lists | `notice` (1) and `document` (13 district lists) |
| `site.ts` gallery | `gallery_album` (1 album, 12 photos) |
| `deposits.ts` slabs, scheme rates, validity | the **2026–27 rate set** (28 rates) |
| `deposits.ts` schemes, documents, benefits | `deposit_scheme` (9) and `deposit_page` |
| `loans.ts` | `loan` (11) and `loan_page` |
| `branches.ts` | `branch` (68, including the head office) and the `branches` table |
| `people.ts`, `faq.ts`, `services.ts`, `csr.ts` | `people`, `faq`, `services`, `csr` |
| `posts.json` | `post` (54) |
| `astro.config.mjs` legacy redirects | `redirect` (23) |
| `annual-reports.astro` list | `document` (3 annual-report entries) |
| `careers.astro` positions | `job_opening` (4) |
| `public/api/enquiry.php` | The Rust `/api/v1/enquiries` (the PHP file has been removed) |

## Figures from the earlier brief, checked against the repository

| Brief said | Found |
| --- | --- |
| 54 posts | 54 ✓ |
| 23 redirects | 23 ✓ |
| 13 district voter-list PDFs, about 530 MB | 13 ✓, total 531 MB (listed sizes; the files themselves are not in the repository) |
| 60 branches | **Discrepancy:** the homepage statistic says 60 (2026–27 leaflet) but the branch directory lists **67 branches plus the head office**. Ask the society which is right and whether some entries are sub-offices; the homepage figure is typed content, the directory count is derived. |
| ₹751+ Cr deposits, ₹1195+ Cr business | Typed from the leaflet; not verifiable from the repository. Keep *source* and *as of* filled in. |
| Rates valid to 31 March 2027 | ✓ (rate set valid 1 April 2026 to 1 April 2027, end exclusive) |

## Not migrated, and why

- **Content from the old WordPress site that was spam** (casino, pharmacy and adult-link pages, posts, categories and an injected script). It was never carried over.
- **Full text of the 54 posts.** The seed holds title, date, image and a summary; the earlier full-text importer (`frontend/scripts/import-blog.mjs`) wrote the old `posts.json` and is now marked legacy. Full text can be typed or pasted into the Blog module, or the importer can be adapted to write into the admin system after review.
- **The 13 district voter-list PDFs.** They stay on the old uploads folder (`/wp-content/uploads/2025/04/`) because they are about 530 MB and must be confirmed as suitable for public disclosure first. Moving them into the media library needs the reviewed exception to the 50 MB upload limit.
- **Annual reports 2017–18 onwards.** Never uploaded to the old site. The three list entries have no PDFs (the 2016–17 entry shows a cover image and *Request a copy*); do not invent files.
- **Images in `public/images/`** are served as part of the site's design assets, not through the media library. New uploads go through the media library; existing ones can be re-uploaded gradually (the forms accept both `/images/…` and `/media/…` paths).

## Cutover checklist

1. Run `lokmangal-cli import-seed … --dry-run`, read the report, then import.
2. Publish once; compare the live site with the old one page by page (rates, branches, notices, redirects).
3. Check the old URLs: `/top-banks-in-pune` and the other 22 must answer HTTP 301 to the new pages.
4. Switch DNS only after forms are verified end to end on the new server; then retire `enquiry.php` and the old server.
5. Keep the previous site backup and this seed file until the first month has passed without problems.
