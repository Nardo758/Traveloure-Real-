# Audit brief — Adopt the Optimization (slip-review board + Build-around anchors)

**Mock:** `docs/design/adopt-optimization-mock.html` (open in a browser; theme-aware light/dark)
**Ledger:** `2026-08-22-slip-optimize-review-first`, `2026-08-23-optimizer-three-variants`, `2026-08-23-optimizer-anchors`, `2026-08-23-optimizer-pinned-anchor`, `2026-08-23-optimizer-pin-liveroute`, `2026-08-25-optimizer-pin-on-create`, `2026-08-25-two-modes`, `2026-08-26-variants-are-proposals` (resolves R-B), `2026-08-26-adopt-applies-in-place` (resolves R-C), `2026-08-26-per-stop-adopt-deferred` (historical live-scope deferral; mock choice model clarified 2026-08-30)
**Status:** PARTIALLY shipped. Phases 0/1/1b/1c (server anchor scoring + candidates + pinned-anchor generate) are merged. The mock was clarified post-brief by `00807491` + `548f98e4` ("Clarify whole and partial optimization adoption mock", the version of record on `main`); it now ratifies three owner choices: keep the current plan, adopt an entire proposal, or adopt one/many selected stops. `ADOPT_OPTIMIZATION_SPEC.md`/`FEATURES.md` were reconciled in the same commit and agree with this brief's shipped/pending split (re-verified below — nothing has crossed lanes since). The live partial-adoption rail is still not built and is outside this mock/docs-only pass. Verify shipped behavior against the code, not the mock.
**Live surfaces:**
- `server/services/anchor-scoring.ts`, `shared/geo.ts` (pure scorer)
- `server/services/anchor-candidates.ts`, `server/services/anchor-candidates-map.ts` (candidate loading + `parsePinnedAnchorInput`)
- `server/itinerary-optimizer.ts` (`generateOptimizedItineraries`, per-variant anchor persistence)
- `server/routes.ts` (LIVE `POST /api/itinerary-comparisons/:id/generate` handler at the monolith — the router copy in `trips.routes.ts` was deleted per the pin-liveroute fix; do not expect it there)
- `client/src/pages/itinerary-comparison.tsx`, `client/src/components/plancard/SlipView.tsx`, `client/src/components/plancard/BuildAroundDialog.tsx`, `client/src/components/plancard/ProposalColumn.tsx`
- `client/src/lib/slip-proposal-preview.ts` (money/drive-time deltas, 21 tests)
- `shared/schema.ts` (`itinerary_variants.anchor_type/_name/_lat/_lng/_median_meters`, migration 257 — additive-nullable, no CHECK)

## Behaviors the mock ratifies

### Shipped — audit now
1. "Optimize this plan" (`.tbtn.optimize` in the slip action row) is **owner-only** and greyed out with a reason when there's nothing to optimize; tapping it **charges the fee and lands on the review page as a proposal** — it never auto-applies (`2026-08-22-slip-optimize-review-first`).
2. Every version is built around a **real, scored anchor** (hotel / neighborhood / activity). An anchor with zero located stops is `medianMeters=null` (unscorable, sunk in ranking) — never a fabricated perfect score. An unlocated stop is excluded from scoring, never counted at distance 0 (§13, `2026-08-23-optimizer-anchors`).
3. The traveler can **pin an anchor** from the Build-around popup: Auto (AI picks 3 anchors) or pin your own type → candidate list → Generate. The read rail is `GET /api/trips/:id/anchor-candidates` (pre-comparison) or `GET /api/itinerary-comparisons/:id/anchor-candidates` (post-comparison); the write is an **allowlisted** `pinnedAnchor` on `/generate` (`{type,id,name,lat,lng}` only — §19 posture, no money/identity field).
4. A hotel/neighborhood pin's coordinates are **server-resolved from the catalog id**, never trusted from the client even though they're display-only (§14 posture applied defensively). An activity pin resolves to the trip's own stop's real coordinates. A custom placement is accepted as the traveler's own coordinates (§22 posture, same as the meeting-pin pattern).
5. An unresolvable pin degrades to **Auto anchors**, never a fabricated pin (§13).
6. **Exactly three** AI variants plus the baseline column — never a placeholder for a missing variant; fewer variants render fewer columns, never a fake fourth.
7. Money-saved and drive-time chips are **omitted, not zero-filled**, when there's no real baseline or a stop isn't located (e.g. "Riverside Focus" shows no travel chip in the mock, on purpose).
8. Drive-time is **time only** — distance is never a headline claim (§21 L3), consistent across this mock and CLAUDE.md ruling 21.
9. Trending/seasonal context lines (`data-testid="preview-trending-now"`, `preview-seasonal`) each **disappear when there's nothing real to show** — never a placeholder sentence.
10. The mock presents three deliberate outcomes: **Keep this plan**, **Adopt entire plan**, or select one/many stops with **`+`** and confirm **Adopt N selected stops**. Whole-plan adoption rebuilds only still-in-planning content; partial adoption changes only the selected set. Purchased/in-checkout/with-expert stops stay put.
11. Every optimizer version is a **proposal** (`itinerary_variants` row under `itinerary_comparisons`), not a separate trip (`2026-08-26-variants-are-proposals`, resolves R-B). Nothing purchased by applying — optimization is a separate earlier paid gate.
12. Optimize disabled-reasons and owner-only gating are unchanged; the dialog never calls `/generate` until Confirm — no pre-fetch of generation.

### Mock-target behavior not yet shipped — do not confuse appearance with implementation
13. **Per-stop `+` adopt ticks** are interactive in the mock and may select one item or a batch across proposals. The live review UI remains whole-plan Apply only until a partial-adoption contract is implemented.
14. The **adopt tray** (`data-testid="adopt-tray"`) displays selected stop chips, a count, and a disabled-until-needed **Adopt N selected stops** action. This is the target UX, not evidence of a live endpoint.
15. The **Finalize popup**'s specific handoff mechanism (Booking agent / Travel expert / Concierge "hands them a copy") — the mechanism is ruled (`2026-08-26-adopt-applies-in-place`'s "gives access" framing extends here: it grants `trip_expert_advisors` access, it does not copy the trip) but the popup's own client wiring may still be mid-build per the spec's Phase dispatch — verify current wiring state in code rather than assuming either way.
16. V3 column and the anchor line are **confirmed shipped** at audit time: `itinerary-comparison.tsx` imports and calls `formatAnchorLine`, and `ProposalColumn.tsx` renders it under `data-testid="proposal-anchor-${variantId}"` (dynamic per-variant id, not the mock's literal `proposal-anchor-v1..v3`). The card action button, however, is still the pre-existing **`Select this plan` → `applyVariantMutation`**, not the mock's `Adopt entire plan` / `adopt-whole` — cosmetic copy/testid rename only, confirm it hasn't silently grown partial-adopt semantics.
17. `client/src/lib/anchor-format.ts` **does not exist as a standalone file** — but the formatter it would have held, `formatAnchorLine`, **is shipped**, implemented directly in `client/src/lib/slip-proposal-preview.ts` (exported, imported by `itinerary-comparison.tsx`). This is a file-organization divergence from the spec's naming, not a missing feature — do not report it as a gap; report the file split instead if asked.

## Visual grammar

Instrument mode per `2026-08-25-two-modes`: `--earn-*` tokens are NOT literally the mock's own CSS variables (this mock predates that ruling with its own Bricolage Grotesque / Public Sans / IBM Plex Mono palette), but the ruling requires the SHIPPED client surface to use earn tokens, Fraunces for the page title only, Inter body, Geist Mono for prices/times/medians/slip IDs, hairline borders, no photos, coral reserved for the paid Generate action. Audit the live `itinerary-comparison.tsx` against the ruling's token requirements, not this mock's own literal CSS (`--accent-fg` etc. here is a stand-in for what became `--earn-*` in the ruling).

## How to audit

```bash
# Server: anchor persistence, additive-nullable, no CHECK
grep -n "anchor_type\|anchor_name\|anchor_median_meters" shared/schema.ts

# Server: pinnedAnchor allowlist parsing (§19 posture) on the LIVE handler
grep -n "parsePinnedAnchorInput\|pinnedAnchor" server/routes.ts server/services/anchor-candidates-map.ts

# Confirm the router's shadowed duplicate POST /generate is gone (pin-liveroute fix)
grep -n "itinerary-comparisons/:id/generate" server/routes/trips.routes.ts server/routes.ts

# Client: V3 column + anchor line — testids are dynamic (proposal-column-${variantId}), not
# the mock's literal v1/v2/v3; look in ProposalColumn.tsx, not itinerary-comparison.tsx, for them
grep -n "proposal-column-\|proposal-anchor-\|button-apply-variant-" client/src/components/plancard/ProposalColumn.tsx

# formatAnchorLine landed inside slip-proposal-preview.ts; anchor-format.ts as a standalone file
# was never created — that MISSING result is expected, not a gap (see behavior 17)
test -f client/src/lib/anchor-format.ts && echo "anchor-format.ts exists" || echo "anchor-format.ts MISSING (expected)"
grep -n "export function formatAnchorLine" client/src/lib/slip-proposal-preview.ts

# Client: omitted-not-zero-filled deltas
grep -n "money saved\|driveTime\|null" client/src/lib/slip-proposal-preview.ts

# Partial-adoption mock controls exist; verify separately that no live endpoint is being claimed
grep -rn "adopt-tick\|variants/:vid/items" client/src/components/plancard/ProposalColumn.tsx server/routes.ts server/routes/*.ts
```

Route to open: a trip's Slip (`/plans/:id`) → "Optimize this plan" → Build-around popup → Generate → itinerary-comparison review page. Observe: exactly baseline + up to 3 columns, chips omitted where undetermined, anchor line present only when `anchorType` is non-null.

## Known divergences / notes

- Versions remain **proposals, not separate trips** under `2026-08-26-variants-are-proposals` (R-B). The mock footer now matches that ruling and no longer promises saved-as-new copies.
- `ADOPT_OPTIMIZATION_FEATURES.md`'s own header states it is superseded by the SPEC and ledger rulings wherever they conflict — treat the FEATURES doc as historical context, the SPEC + ledger as authoritative for scope/behavior, and the mock HTML as authoritative for appearance only.
- Do not report the mock's partial-adoption controls as shipped. The intended behavior is now clear, but this pass deliberately changes no live client, API, or persistence path.
