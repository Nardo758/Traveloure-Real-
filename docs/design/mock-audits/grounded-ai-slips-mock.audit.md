# Audit brief — Grounded AI Slips (Phase 1)

**Mock:** `docs/design/grounded-ai-slips-mock.html` (open in a browser; theme-aware light/dark)
**Ledger:** `2026-08-23-item2-grounding` (Phase 1 build that answers this mock's Q1–Q4)
**Status:** merged Aug 22–23 set — code shipped against this mock; ruling text > merged code > mock pixels on any disagreement.
**Live surfaces:**
- `server/services/slip-grounding.service.ts` (exists)
- `server/services/slip-grounding-match.ts` (exists)
- migrations 255/256 (exist: `server/migrations/255_itinerary_item_dmo_grounding.sql`, `256_itinerary_item_affiliate_grounding.sql`, both registered in `server/migrations/migration-files.ts`)

## Behaviors the mock ratifies

Note: this mock is framed as a **pre-build decision mock** ("Nothing built yet — awaiting Q1–Q4 answers"). Its own footer is stale relative to the ledger — Q1–Q4 were answered and the resolver shipped. Audit against the ledger's actual answers, not the mock's "not yet decided" framing.

1. Before grounding: the raw `generate-itinerary` build produces pure free-text items — none bookable, none pinnable, "0 links" — this is the pre-Phase-1 baseline the resolver replaces.
2. After grounding, each item resolves to exactly one state: DMO place (recognized, map-pinned, informational link), Catalog match (bookable, real price, add-to-cart + view-listing), or AI suggestion (unmatched, no fake link/pin).
3. Resolver pipeline (Step 1–4): load destination-scoped approved catalog (`loadOptimizerCatalog`) + market DMO places → match by normalized name/geo/category → gate on a confidence threshold, fail-closed → stamp the link (`providerServiceId` + real coords, or `dmoExtractedPlaceId` + its coords) on the item.
4. **Q1 (ratified: automatic)** — grounding runs automatically inside the same AI generate pass, not a separate traveler-triggered action.
5. **Q2 (ratified: mark bookable, never auto-cart)** — a catalog match marks the item bookable via `providerServiceId`; it must never be auto-added to the cart. The traveler chooses to add.
6. **Q3 (ratified: DMO informational only in Phase 1)** — a DMO-matched item shows a real pin + "Official info & tickets" link, never a "book on Traveloure" CTA. Affiliate/partner booking is explicitly deferred to Phase 2 (§16 rail), not part of this mock's scope.
7. **Q4 (ratified: conservative/fail-closed)** — an ambiguous or low-confidence match must never ground; the item stays an honest AI suggestion rather than risk a wrong link (§13).
8. A DMO match displays its match confidence and normalized-name provenance (e.g. "DMO place · 0.94 match") — not a bare pin with no source.
9. An unmatched item is still shown, labelled "AI suggestion · no confident match" — never silently dropped, never invented a pin/link for it (§13).
10. Coordinates on a grounded item come only from the matched entity (catalog row or DMO place) — never geocoded/guessed.
11. `itinerary_items.dmoExtractedPlaceId` is additive-nullable, no CHECK constraint, and must be declared in `shared/schema.ts` (publish-trap rule, per CLAUDE.md migration guidance).

## Visual grammar

- Legend/tag hues: `--catalog` (bookable), `--place` (DMO/informational), `--ai`/`--border-strong` dashed (unmatched) — a fixed three-way semantic vocabulary that should read consistently with the plan-card mock's provenance pills (catalog=green-family, DMO=distinct hue, honest/AI=neutral grey).
- Unmatched items get a dashed left border (`.item.la`) — a deliberate "less certain" visual cue distinct from the solid-border grounded states.
- IBM Plex Mono for eyebrow/timestamps/match-confidence figures; Fraunces serif for headings only.
- "Have vs New" two-column contrast panel (`--green` check vs `--amber` plus) is a spec-authoring convention, not part of the shipped UI — do not audit this panel against code.

## How to audit

1. Confirm the resolver exists and loads both sources:
   `grep -n "loadOptimizerCatalog\|getExtractedPlacesForMarket\|dmoExtractedPlaceId\|providerServiceId" server/services/slip-grounding.service.ts` — expect all four terms present.
2. Confirm fail-closed match threshold:
   `grep -n "MATCH_THRESHOLD\|0.82" server/services/slip-grounding-match.ts` — expect a numeric confidence gate, not an always-true match.
3. Confirm mutual exclusivity / rung order (catalog before DMO before honest) by reading the resolver's control flow structure only (per task scope, existence/shape check — not full contents review).
4. Confirm migration 255/256 registration:
   `grep -n "255_itinerary_item_dmo_grounding\|256_itinerary_item_affiliate_grounding" server/migrations/migration-files.ts` — expect both listed.
5. Confirm `dmoExtractedPlaceId` is declared in the schema (publish-trap rule):
   `grep -n "dmoExtractedPlaceId\|dmo_extracted_place_id" shared/schema.ts` — expect a column declaration, not only the raw migration SQL.
6. Confirm Q2 (never auto-cart): search the cart projection for where `providerServiceId` triggers cart insertion — confirm it is gated behind an explicit traveler "add to cart" action, not automatic on grounding.
7. In the running app: trigger `generate-itinerary` for a market with catalog + DMO coverage, inspect the resulting items for the three tag states, and confirm an unmatched item renders with no link/pin rather than being silently omitted.

## Known divergences / notes

- The mock's own footer text ("Nothing built yet — awaiting Q1–Q4 answers before implementation") is superseded — this is a pre-sign-off artifact. The ledger (`2026-08-23-item2-grounding`) confirms the build shipped with the mock's own recommended defaults for all four questions. Auditors should treat the mock's Q1–Q4 recommendation column as ratified, not as open questions.
- This mock's "Phase 2 — filed" affiliate/registry rung is out of scope here; it is covered by `grounding-affiliates-mock.html` and ledger `2026-08-23-item2-affiliate`.
