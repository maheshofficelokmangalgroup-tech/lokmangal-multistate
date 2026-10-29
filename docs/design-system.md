# Admin design system

An orange-and-white workspace for non-technical staff: calm, precise, readable tables and forms. The tokens and components below are implemented in `admin/src/styles.css` (tokens) and `admin/src/components/` (components). A clickable reference prototype with sample data is kept in `admin-prototype/`.

## Tokens

Defined once as CSS variables (Tailwind `@theme`), so a colour is changed in one place.

| Token | Value | Use |
| --- | --- | --- |
| `brand-primary` | `#C2410C` | Primary buttons, active navigation, links |
| `brand-hover` | `#9A3412` | Hover/pressed primary, text on soft orange |
| `brand-accent` | `#EA580C` | Small graphic accents, chart bars |
| `brand-soft` | `#FFF7ED` | Selected navigation, gentle highlights |
| `canvas` / `surface` | `#F7F8FA` / `#FFFFFF` | Page background / panels, tables, dialogs |
| `text-primary` / `text-secondary` | `#18181B` / `#52525B` | Headings and values / labels and help |
| `line` | `#E4E4E7` | Borders and dividers |
| `success` `#166534` · `warning` `#92400E` · `danger` `#B91C1C` · `neutral` `#52525B` · `info` `#1D4ED8` | | Status text, each with a soft background |

Contrast: the text/background pairs above were chosen to be at least 4.5:1, but **have not yet been measured with a tool** (see the README).

**Type:** Poppins for headings and navigation, Mukta for Marathi (self-hosted through Fontsource, nothing loaded from Google at runtime). Page title 26 px/600, section title 17 px/600, body and controls 14 px, metadata 12–13 px, Devanagari at least 16 px. Tabular numerals for rates, rupees and counts.

**Shape and space:** 4 px spacing scale; panels 10 px radius, controls 8 px; borders for structure, shadows only on menus and dialogs. Controls are 42 px high, table rows about 48 px.

## Shell

Sidebar 248 px (76 px collapsed; a drawer below 1024 px) with grouped sections, a 64 px topbar with command search (Ctrl/Cmd+K), notifications and the account menu, and a skip link. A menu item appears only if the user's permissions allow its screen. Counts beside *Leads*, *Careers*, *Approvals* and *Publish center* follow the user's own scope.

## Components (`components/ui.tsx`, `shell.tsx`, `form-renderer.tsx`)

One implementation of each pattern, used everywhere:

- **Actions:** `Button` (primary, secondary, ghost, danger, link; loading state).
- **Forms:** `Field` (label, help, inline error tied with `aria-describedby`), `Input`, `Textarea`, `Select`, `Checkbox`, `RichText` (restricted TipTap), `MediaPicker`, `ErrorSummary` (lists field problems and the support reference).
- **Status:** `StatusBadge` (words plus an icon for success, warning and failure, never colour alone), `Badge`, `InlineAlert`.
- **Data:** `Table` (scrollable labelled region), `Pagination` (25/50/100), `Tabs`, `KeyValue`, `Card`, `FieldDiff` (before/after marked with + / − / ≠ and words).
- **States:** `TableSkeleton`, `EmptyState`, `ErrorState` (message, retry, support reference), `PermissionMessage`.
- **Overlays:** `Dialog`, `ConfirmDialog`, `Drawer` (Radix: focus trapped, returned to the opener, Escape closes), toasts that appear only after the server confirms.
- **Typed content forms:** `form-renderer.tsx` turns the field definitions in `features/schemas.ts` into forms, including lists that can be reordered with *Move up/down* buttons.

## Patterns

- **Lists** keep search, filters, tab and page in the URL, show a result count, offer *Clear filters* on an empty result and *Retry* on a failed load without losing the filters.
- **Editors** keep Save draft, Submit for approval, Preview and Publish as separate actions, show revision, author and status, warn before leaving unsaved changes, and on an edit conflict show the other person's version with a field-by-field comparison and an explicit choice.
- **Every action reports truthfully:** buttons show progress, success toasts follow a confirmed response, and the API being unreachable shows a visible error instead of a fake success.
- **Time and money:** staff times are Asia/Kolkata, rupee values use Indian grouping (₹1,00,344), rates show two decimals.
- **Motion:** short transitions only, and `prefers-reduced-motion` switches them off.

## Responsive behaviour

At 1024 px and above: full sidebar, multi-column dashboard, editors with a side summary. Below: drawer navigation, stacked summary, and tables that drop secondary columns (the reference, name and status stay). Wide matrices scroll inside a labelled region; the page itself does not scroll sideways. Checked in Chrome at 1440 px and 390 px on the main screens (see [acceptance-results.md](acceptance-results.md)).

## Accessibility: what is done and what is not

Done: visible focus ring, labels and error association on every field, semantic headings and landmarks, keyboard-operable lists and dialogs, text and icons with every status, chart data also offered as a table, `lang="mr"` text uses Mukta at 16 px or more.

**Not done:** an automated scan (axe/Lighthouse), a manual keyboard and screen-reader walk-through, a 200 % zoom check, and a long-Marathi-text clipping check. Treat WCAG 2.2 AA as a target, not a result, until these are done.
