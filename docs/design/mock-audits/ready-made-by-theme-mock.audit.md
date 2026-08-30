# Audit brief — Ready-Made by Theme

**Mock:** `docs/design/ready-made-by-theme-mock.html` (open in a browser; theme-aware light/dark)
**Ledger:** `2026-08-22-ready-made-themes`
**Status:** merged Aug 22–23 set — code shipped against this mock; ruling text > merged code > mock pixels on any disagreement.
**Live surfaces:**
- `shared/ready-made-plan-types.ts` (exists — confirmed: exports `READY_MADE_PLAN_TYPE_KEYS`, `planTypeDisplay`, a 20-key closed vocabulary including `custom`)
- `server/routes/ready-made.routes.ts` (exists — confirmed: `GET /api/ready-made` accepts `?planType=`, validated `customLabel only applies to planType=custom`)
- `client/src/pages/discover.tsx` (exists — confirmed: imports `planTypeLabel`/`planTypeDisplay`, implements the theme chip filter and shelf grouping around line ~900–960 and ~1748)
- Note: the index row cites `client/src/pages/ready-made*` generically; the shelf UI actually lives in `discover.tsx` (Discover's Packages tab), not a standalone `ready-made.tsx` — `client/src/pages/ready-made-detail.tsx` (exists) is the per-listing detail page, separately in scope for the theme-label display fix (item 4 below).

## Behaviors the mock ratifies

1. Default view (Screen 1): a chip rail ("Browse by experience") sits above theme shelves. "All experiences" plus one chip per theme, each showing a live count (e.g. "🍜 Food & Culture 5").
2. §13 — chips/shelves render ONLY for themes that have at least one live (approved+active) listing, with REAL stock counts — never the full 20-key vocabulary rendered as empty aisles, and never a guessed/keyword-inferred theme (only what the builder declared at submit).
3. Each shelf groups listings under its theme heading with a "See all N →" link; shelf order follows the feed (not alphabetical or fixed).
4. Author type (Local Expert / Trip Planner) demotes to a small badge/pill on the card (`.author-pill`) — it is NO LONGER a top-level section header ("Trips by Locals" / "Trips by Trip Planners" sections are gone).
5. The author's name keeps a storefront link ONLY when they have a claimed handle — plain text otherwise, never a dead `/p/:handle` link (StorefrontLink rule, reused from the round-1/round-2 storefront lanes).
6. Filtered view (Screen 2): selecting a chip filters via a server-validated query param, `GET /api/ready-made?planType=food_culture_itinerary` (or the matching key) — not a client-only re-sort of an already-fetched superset alone; a filter bar states what's shown ("Showing 5 Food & Culture trips — every one declared by its builder, not guessed from keywords") with a clear/reset control.
7. An unknown/invalid `planType` value passed to the server must return 400 — never a silently empty page (honest failure, not a blank result indistinguishable from "no matches").
8. Custom themes: a builder who picks "Custom…" supplies free-text (e.g. "Ramen Crawl") that renders as the card's eyebrow/label, but the listing still files under the closed-vocabulary `custom` key server-side — free text never enters the actual filter logic.
9. `planTypeDisplay(planType, planTypeCustom)` is the SINGLE shared implementation used by both the shelf cards and the detail page — a custom free-text theme must render identically in both places (no duplicate/divergent label logic, L6).
10. Detail-page fix: `ready-made-detail.tsx`'s theme-to-experience-format resolver map must cover the full current vocabulary (not a stale subset) — a listing's declared theme must not silently fall back to a generic label there.
11. Everything downstream of the shelf browsing layer — buy → clone → refund loop, pricing modes, the Itinerary Templates section, admin review queue — is explicitly UNCHANGED by this lane; do not expect or flag differences there.
12. The approved+active read-gate (F2/§10) is untouched by the new filter — filtering only narrows an already-gated feed, it never widens what's visible.

## Visual grammar

- Coral (`--accent: #E85D55` light / `#F07A72` dark) used for the eyebrow, active-chip state, filter-bar accent border/text, and "See all" links — the primary interactive/selected-state color on this surface.
- Teal (`--teal`) reserved specifically for the author-type pill and storefront-link text — a secondary, muted accent distinct from the coral interactive color; do not let these two hues collide in role.
- Chip rail: horizontal scroll (`overflow-x: auto`), pill chips with a count badge, `.chip.on` for the active/selected state (soft-accent background + accent border+text) — a reusable "quick-category" filter pattern per the mock's own note ("the Discover quick-category pattern, reused").
- Card treatment: `.trip` cards with a gradient hero placeholder + location badge, author-pill, and price row — consistent card-on-ground styling (white/dark card on off-white/dark ground) with the rest of the Aug 22–23 set.
- Fraunces serif for headings/band-title/shelf headings; Archivo sans for body — a distinct type pairing from the optimizer-family mocks (Bricolage/Public Sans) but consistent with the provenance-pill mocks' serif-display convention in spirit.

## How to audit

1. Confirm the closed vocabulary and shared label function:
   `grep -n "READY_MADE_PLAN_TYPE_KEYS\|export function planTypeDisplay" shared/ready-made-plan-types.ts` (already confirmed present).
2. Confirm the server-side validated filter and 400-on-unknown-key behavior:
   `grep -n "planType" server/routes/ready-made.routes.ts` — verify the query param is validated against `READY_MADE_PLAN_TYPE_KEYS` and rejects unknown values with 400, not a silent empty array.
3. Confirm the approved+active gate is untouched (filter narrows, never widens):
   search `ready-made.routes.ts` for the existing read-gate predicate (`approval_status`/`status`) and confirm the `planType` filter is ANDed onto it, not a replacement.
4. Confirm the shelf/chip UI lives in `discover.tsx` and only renders themes with live stock:
   `grep -n "planType\|shelf\|chip" client/src/pages/discover.tsx` (already spot-checked: filter logic present ~line 900–960, 1748) — verify shelves are built from server-returned/live-counted groups, not the static 20-key list rendered unconditionally.
5. Confirm one shared label implementation used by both surfaces:
   `grep -n "planTypeDisplay" client/src/pages/discover.tsx client/src/pages/ready-made-detail.tsx` — expect both files to import and call the same function, no re-implemented label logic in either.
6. Confirm the detail-page resolver-map fix (item 4/§09 "Detail-page fix"): inspect `ready-made-detail.tsx`'s theme→experience-format mapping for coverage of the full 20-key vocabulary (existence/shape check — confirm it references the full key set, not a stale 9-entry table).
7. Confirm custom-theme handling: verify a `planType='custom'` row's `planTypeCustom` free text is used for display only, and that the filter/query logic still keys on the literal string `custom`, never on the free-text value.
8. In the running app: open `/discover?tab=packages`, confirm shelves + chip counts reflect only themes with live listings, click a chip and confirm the URL gains `?planType=` and the filter-bar/clear-control behavior matches Screen 2, then submit an invalid planType via URL manipulation and confirm a 400/graceful handling rather than a blank page.
9. Confirm storefront-link honesty on cards: for an author with no claimed handle, confirm the author name renders as plain text (no link, definitely no dead `/p/:handle`).

## Known divergences / notes

- The SESSION_MOCKS_INDEX.md entry cites `client/src/pages/ready-made*` as the shipped surface; the actual shelf/chip implementation is in `discover.tsx` (Discover's Packages tab), with `ready-made-detail.tsx` covering only the per-listing detail-page fix. This is not a defect — the ledger text itself names `discover.tsx` and `ready-made-detail.tsx` explicitly — but auditors should not expect a dedicated `ready-made.tsx` browse page to exist.
