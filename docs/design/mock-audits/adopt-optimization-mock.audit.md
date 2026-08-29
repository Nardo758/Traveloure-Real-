# Audit brief — Adopt the Optimization (slip-review board + Build-around anchors)

**Mock:** `docs/design/adopt-optimization-mock.html` (open in a browser; theme-aware light/dark)
**Ledger:** `2026-08-22-slip-optimize-review-first`, `2026-08-23-optimizer-three-variants`, `2026-08-23-optimizer-anchors`, `2026-08-23-optimizer-pinned-anchor`, `2026-08-23-optimizer-pin-liveroute`, `2026-08-25-optimizer-pin-on-create`, `2026-08-25-two-modes`, `2026-08-26-variants-are-proposals` (resolves R-B), `2026-08-26-adopt-applies-in-place` (resolves R-C), `2026-08-26-per-stop-adopt-deferred` (R-A, still open)
**Status:** PARTIALLY shipped. Phases 0/1/1b/1c (server anchor scoring + candidates + pinned-anchor generate) are merged. Client completion (V3 column, anchor line, Build-around popup) is DISPATCHED per `docs/design/ADOPT_OPTIMIZATION_SPEC.md` — status at authoring unknown to this brief; verify against the code, not the spec's own claim. Server items (per-stop adopt R-A, Finalize handoff R-C mechanism) are PENDING a decision-maker ruling on R-A only — R-B and R-C are already ruled (see behaviors 8–9). **Do not flag anything in the "Pending" subsection below as missing** — it is scoped out on purpose.
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
10. **Selecting a version applies it to the slip in place** and gives the owner access to it as their working plan — purchased/in-checkout/with-expert stops stay put, only still-in-planning stops are rebuilt (`2026-08-26-adopt-applies-in-place`, resolves R-C). This SUPERSEDES the mock's own footer copy about "saved as its own trip" / a separate copy — see Known divergences.
11. Every optimizer version is a **proposal** (`itinerary_variants` row under `itinerary_comparisons`), not a separate trip (`2026-08-26-variants-are-proposals`, resolves R-B). Nothing purchased by applying — optimization is a separate earlier paid gate.
12. Optimize disabled-reasons and owner-only gating are unchanged; the dialog never calls `/generate` until Confirm — no pre-fetch of generation.

### Dispatched/pending — do not flag as missing
13. **Per-stop `+` adopt ticks** (pulling a single stop from a proposal into the baseline plan) — `2026-08-26-per-stop-adopt-deferred` (R-A), decision-maker ruling still owed. The shipped review UI is whole-plan Apply only; `ProposalColumn.tsx`'s Apply button is documented as "the ONLY action." The mock keeps the `+` glyph for illustration, but its own footer copy no longer promises the tick works.
14. The **adopt tray** (`data-testid="adopt-tray"`, baseline-only dashed box inviting drag-and-drop) is part of the same deferred R-A feature — planned, not built.
15. The **Finalize popup**'s specific handoff mechanism (Booking agent / Travel expert / Concierge "hands them a copy") — the mechanism is ruled (`2026-08-26-adopt-applies-in-place`'s "gives access" framing extends here: it grants `trip_expert_advisors` access, it does not copy the trip) but the popup's own client wiring may still be mid-build per the spec's Phase dispatch — verify current wiring state in code rather than assuming either way.
16. V3 column, the anchor line under each version card (`{Hotel|Neighborhood|Activity} · {name} · {min} min median · {k}/{N} stops ≤ 15 min`), and the popup's full candidate-list UI are the client lane's own deliverables per `ADOPT_OPTIMIZATION_SPEC.md` §2 — confirm what has actually landed in `itinerary-comparison.tsx` / `BuildAroundDialog.tsx` rather than assuming the spec's dispatch is fully executed.
17. `client/src/lib/anchor-format.ts` (the pure `formatAnchorLine` formatter named in the spec) was **not found in the repo at audit time** — if still absent, that specific piece of the client lane has not landed; do not treat its absence alone as evidence the whole lane is unbuilt, but do report it as a concrete gap against the spec.

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

# Client: V3 column + anchor line + testids
grep -n "proposal-column-v3\|proposal-column-baseline\|anchor-format" client/src/pages/itinerary-comparison.tsx
test -f client/src/lib/anchor-format.ts && echo "anchor-format.ts exists" || echo "anchor-format.ts MISSING"

# Client: omitted-not-zero-filled deltas
grep -n "money saved\|driveTime\|null" client/src/lib/slip-proposal-preview.ts

# Per-stop adopt tick should NOT be wired to a real endpoint yet (R-A pending)
grep -rn "adopt-tick\|variants/:vid/items" client/src/components/plancard/ProposalColumn.tsx server/routes.ts server/routes/*.ts
```

Route to open: a trip's Slip (`/plans/:id`) → "Optimize this plan" → Build-around popup → Generate → itinerary-comparison review page. Observe: exactly baseline + up to 3 columns, chips omitted where undetermined, anchor line present only when `anchorType` is non-null.

## Known divergences / notes

- The mock's own footer text about "every version is saved as its own trip" and "saved-as-new" is **superseded** by `2026-08-26-variants-are-proposals` (R-B) and `2026-08-26-adopt-applies-in-place` (R-C) — the ratified behavior is "proposal you can revisit" + "applies in place / gives access," not a separate trip. Audit the code against the ledger rulings, not the mock's literal footer sentence.
- `ADOPT_OPTIMIZATION_FEATURES.md`'s own header states it is superseded by the SPEC and ledger rulings wherever they conflict — treat the FEATURES doc as historical context, the SPEC + ledger as authoritative for scope/behavior, and the mock HTML as authoritative for appearance only.
- Do not raise R-A (per-stop adopt) as a missing feature; it is explicitly awaiting a decision-maker ruling before any lane may build it.
