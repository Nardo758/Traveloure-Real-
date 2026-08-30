# Audit brief — Grounding Affiliates (Item 2 Phase 2)

**Mock:** `docs/design/grounding-affiliates-mock.html` (open in a browser; theme-aware light/dark)
**Ledger:** `2026-08-23-item2-affiliate` (+ `2026-08-23-item2-affiliate-server`, `2026-08-23-item2-affiliate-reconcile` for the two follow-on lanes)
**Status:** merged Aug 22–23 set — code shipped against this mock; ruling text > merged code > mock pixels on any disagreement.
**Live surfaces:**
- `client/src/components/plancard/affiliate-booking.ts` (exists)
- `server/services/affiliate-grounding.service.ts` (exists)
- `itinerary_items.affiliateProductId` declared in `shared/schema.ts:4075` (FK → `affiliateProducts.id`, `onDelete: "set null"`) and omitted from `insertItineraryItemSchema` (`shared/schema.ts:4459`) — confirms §19 allowlist posture

## Behaviors the mock ratifies

1. The resolution waterfall is **Catalog → Affiliate → DMO → honest suggestion** (Q1, chosen option A) — affiliate sits between the platform catalog and DMO, not before catalog and not after DMO.
2. Rungs are mutually exclusive; the first confident match (0.82 threshold, same fail-closed name+geo gate as Phase 1) wins and stops the pass.
3. Match source is **both** the persisted `affiliate_products` registry (checked first, deterministic) **and** live feeds (Q2) — a live-feed match is materialized into `affiliate_products` (upsert by `external_id`) BEFORE it is linked, so the item's link and its `bookingToken` always point at a real persisted row (no forked "live-only" link).
4. Live-feed calls are best-effort and fail-closed: a slow/failed feed degrades to registry-only for that item and never blocks or delays the build.
5. Eligibility honors the row's `bookingType` classifier (Q3, chosen option A): `affiliate_bookable` → agent-rail CTA ("Book via your Traveloure agent"); `in_platform_bookable` → add-to-cart; unclassified → stays unlinked (§13).
6. Affiliate grounding lights up per-market automatically as inventory exists (Q4, chosen option A) — no global enable flag; a market with zero active affiliate rows grounds nothing on this rung and falls through to DMO/honest-suggestion.
7. The affiliate CTA reuses the EXISTING booking-agent rail: `POST /api/affiliate-booking-requests` with an opaque `bookingToken` — the affiliate URL is stripped server-side and never reaches the browser (§16). No new outbound rail; no `window.open(affiliateUrl)` anywhere.
8. `itinerary_items.affiliate_product_id` is nullable, FK `ON DELETE SET NULL`, and is omitted from the insert schema (§19 allowlist posture — not client-settable).
9. Coordinates on an affiliate-grounded item are copied from the linked product's real coordinates only when the item itself has none.
10. Four traveler-facing card states shown side by side: Platform (add to cart), Affiliate/agent (agent CTA + §16 note), DMO/info (view on map, no booking), Suggestion (no booking link, stays as written) — all four must coexist correctly on one plan.
11. An unmatched item shows "No booking link" / "Stays as written. No guessed pin." — never invents a link or coordinates for it.

## Visual grammar

- Four-color rung/card system: `--platform` (own catalog, green-family), `--affiliate` (amber/orange), `--info` (blue, DMO), `--none` (neutral grey, dashed border/box-shadow-off for the "no match" state) — a consistent semantic palette that should match the same rung colors used in `grounded-plan-card-mock.html` and `grounded-ai-slips-mock.html` (catalog=green, affiliate=amber, DMO=blue/violet, honest=grey — check exact hex parity is not required, but the ordinal color role must match).
- `.rung::before` left edge stripe carries the rung's semantic color — a repeatable "colored left-bar" card treatment for waterfall/pipeline UI.
- IBM Plex Mono for kickers, rung index numbers, CTA pill labels, and all inline code/testid-like tokens (`bookingToken`, `affiliate_product_id`); Fraunces for headings only.
- The "reuse vs new" build-surface table (`.reuse`/`.new` colored text) is a spec-authoring convention documenting what ships vs what is new — not part of shipped UI; do not audit it against code directly, but it enumerates the concrete pieces the other checks below verify.

## How to audit

1. Confirm rung order + affiliate rung insertion point:
   `grep -n "affiliate\|catalog\|dmo" server/services/affiliate-grounding.service.ts` and cross-check against `server/services/slip-grounding.service.ts` for the call order (catalog rung, then affiliate rung, then DMO rung).
2. Confirm the registry-first / live-feed-reconcile shape:
   `grep -n "ingestAllNetworks\|external_id\|upsert" server/services/affiliate-grounding.service.ts` — expect evidence of upsert-by-external_id before any link is made.
3. Confirm fail-closed / non-blocking live-feed behavior:
   `grep -n "Promise.race\|catch\|try" server/services/affiliate-grounding.service.ts` — expect a bounded-wait or fail-closed pattern, not an unguarded await on the live feed.
4. Confirm `bookingType` gates eligibility:
   `grep -n "bookingType\|affiliate_bookable\|in_platform_bookable" server/services/affiliate-grounding.service.ts client/src/components/plancard/affiliate-booking.ts`
5. Confirm no raw outbound anywhere in the affiliate path:
   `grep -rn "window.open" client/src/components/plancard/affiliate-booking.ts server/services/affiliate-grounding.service.ts` — expect **no matches**.
6. Confirm the booking rail target:
   `grep -n "affiliate-booking-requests" client/src/components/plancard/affiliate-booking.ts`
7. Confirm §19 allowlist on the new column (already spot-checked above):
   `grep -n "affiliateProductId" shared/schema.ts` — confirm both the FK declaration and its `.omit()` in `insertItineraryItemSchema`.
8. In the running app: generate an AI itinerary for a market with active affiliate inventory and one with none — confirm the affiliate rung only fires in the stocked market (Q4 per-market activation, no global flag/env var gating it).
9. Confirm unclassified affiliate rows never link: seed or inspect an `affiliate_products` row with a null/unknown `bookingType` and confirm it is never selected as a match target.

## Known divergences / notes

None recorded. This mock is marked "✓ ratified Aug 23" and all four of its own recommended decisions (Q1–Q4) match the ledger's ratified text verbatim in substance.
