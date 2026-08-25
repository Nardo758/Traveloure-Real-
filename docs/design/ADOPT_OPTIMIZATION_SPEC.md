# Adopt the Optimization — SPEC

**Status:** ratified design (mock signed off 2026-08-23); Phases 0 · 1 · 1b · 1c shipped; this spec scopes the remainder · **Visual of record:** `docs/design/adopt-optimization-mock.html` · `audited@9d3f8ab`

This is the transcription contract for the mock. The HTML wins on appearance; this file wins on scope and behavior. Nothing here invents data the server doesn't already return.

---

## 0. Rulings this spec sits under (existing — do not relitigate)

| Slug | What it fixes |
|---|---|
| `2026-08-22-slip-optimize-review-first` | "Optimize this plan" lands on the review page as a **proposal**; never auto-applies. Confirm-to-apply is the existing per-column `applyVariantMutation`. |
| `2026-08-22-slip-review-copy` | Slip-aware exits and honest empty/error states on the review page. |
| `2026-08-23-optimizer-three-variants` | **Exactly three** AI variants + the plan as baseline. `#563` shipped V1+V2 — V3 column is owed. |
| `2026-08-23-optimizer-anchors` | Every version is built around a real, scored anchor (hotel / neighborhood / activity). Anchor fields persisted on `itinerary_variants` (migration 257), NULL when unscored — never fabricated. |
| `2026-08-23-optimizer-pinned-anchor` | Traveler can pin the anchor from the Optimize popup. Read rail `GET …/anchor-candidates`; write via `pinnedAnchor` on `/generate`. |
| `2026-08-23-optimizer-pin-liveroute` | The pin write lives on the **monolith** `app.post` in `server/routes.ts` (the router copy is shadowed). Same shadow exists for `GET /api/itinerary-comparisons/:id` (`routes.ts:8753` wins over `trips.routes.ts:645`). |
| Slip model erratum (`SLIP_EXPERIENCE_DISPATCH.md` §0) | **The slip is stationary.** The only legitimate copies are optimizer variant proposals (ephemeral) and the TripPlan render model. Nothing "sends," "moves," or "delivers" a trip by copying. |
| `2026-08-25-marketplace-earn-grammar` | `--earn-*` tokens, Fraunces headings, Geist Mono labels/numbers, coral = the one primary CTA per panel. |

New rulings this spec proposes (§4) go to the ledger only after Leon rules.

---

## 1. Rails (built — cite, don't rebuild)

| Rail | Where | Shape |
|---|---|---|
| Candidates read | `GET /api/trips/:id/anchor-candidates` — pre-create popup rail, because SlipView opens before a comparison exists; `GET /api/itinerary-comparisons/:id/anchor-candidates` — post-create comparison rail (both owner-gated) | `RankedAnchors { hotel: AnchorScore[]; neighborhood: AnchorScore[]; activity: AnchorScore[] }` — `anchor-candidates.ts:31` |
| `AnchorScore` | `server/services/anchor-scoring.ts:48` | `anchorId, type, name, lat, lng, locatedStops, totalStops, medianMeters \| null, within15MinCount, walkMinutesEstimate \| null` |
| Generate (paid) | `POST /api/itinerary-comparisons/:id/generate` — **`server/routes.ts:8777`** (live handler) | body: `{ optimizationPaymentId, feedback?, baselineItems?, pinnedAnchor? }` |
| `pinnedAnchor` input | `anchor-candidates-map.ts:44 parsePinnedAnchorInput` | `{ type: 'hotel'\|'neighborhood'\|'activity', id?: string, name?: string, lat?: number, lng?: number }` — `id` resolves a ranked candidate (activity `id` = one of the trip's own stop ids); `name+lat+lng` with no `id` = custom location |
| Comparison read | `GET /api/itinerary-comparisons/:id` — `server/routes.ts:8753` | variants are full `itinerary_variants` rows via `db.select()` (`storage.ts:7318`), so `anchorType / anchorName / anchorLat / anchorLng / anchorMedianMeters` are already on the wire (`shared/schema.ts:1652-1656`) |
| Apply whole variant | `POST …/apply-to-trip` (`plancard.routes.ts:45`), `POST …/apply-to-cart` (`trips.routes.ts:744`) | unchanged |
| Deltas | `client/src/lib/slip-proposal-preview.ts` (21 tests) | money saved / drive-time — omitted when baseline absent |

**Not built (no rail):** per-stop pull, variants-as-trips, finalize handoff. See §3.

---

## 2. Client scope — Replit lane `adopt-optimization-client`

Write targets: `client/src/pages/itinerary-comparison.tsx`, `client/src/components/plancard/SlipView.tsx`, new `client/src/components/plancard/BuildAroundDialog.tsx`, `client/src/lib/anchor-format.ts` (pure, tested). **No `server/` edits.**

### 2.1 V3 column (mock: "Three ways to sharpen your plan")
- Render every AI variant returned, in order, up to three. Two returned → three columns (baseline + 2), no placeholder. Zero → existing `banner-no-proposals-review`.
- Column chrome per variant: delta chips (existing lib), `Recommended` on the top-ranked only, name + one-line rationale from the variant, day groups, `Select this plan` (existing `applyVariantMutation`).
- Baseline column keeps `Keep this plan` as the landing column and the verbatim footer "Nothing is purchased by applying."

### 2.2 Anchor line on each version card
Under the version name, mono:
```
{Hotel|Neighborhood|Activity} · {anchorName} · {min} min median · {k}/{N} stops ≤ 15 min
```
- `min` = `walkMinutesEstimate` rounded; label carries "est." in a title attribute (scorer says display must label it an estimate).
- Omit the entire line when `anchorType` is null.
- Omit `· {k}/{N} stops ≤ 15 min` when `within15MinCount`/`totalStops` are not on the row (the variant row carries `anchorMedianMeters` only; the 15-min count comes from the candidates rail and is only shown when the popup's chosen candidate is known in-session — never re-scored client-side).
- Neighborhood variant: `· stay anywhere in-area` replaces the stops fragment (mock copy).
- Activity variant: `· the day pivots on it`.
- Pure formatter `formatAnchorLine(variant, candidate?)` in `anchor-format.ts`, unit-tested for all null cases.

### 2.3 "Build around a location" popup (mock frame "Optimize this plan")
Opens from the slip's `Optimize this plan` (replaces the direct navigate; the button's owner-only + disabled-reason pattern unchanged).

Layout (earn grammar, dialog 560px):
1. Title `Build around a location`, one-line lede.
2. **Auto — recommended** (default, checked): "The AI scores hotels, neighborhoods & activities against your stops and picks the 3 strongest anchors."
3. `or pin your own anchor` — three type tiles (Hotel / Neighborhood / Activity) with the icon tile treatment. Selecting one fetches `anchor-candidates` (once, cached for the dialog) and opens that kind's list inline.
4. Candidate row: name · rating if present · area · `{min} min median` mono · `best fit` pill on rank 1. Radio select.
5. `Not listed? Build around a custom location` → free-text name (required) — submits `{ type, name }` only; no client geocoding. The server resolves or degrades (§13).
6. Footer line, mono, muted: "Optimization is a paid step — you confirm here before anything runs or is charged."
7. `Cancel` · `Generate 3 versions around {X}` (coral; label is `Generate 3 versions` under Auto). Confirm runs the existing paid flow exactly as today, with `pinnedAnchor` populated or absent.

Honesty:
- A type with zero candidates renders "No {type}s scored near your stops yet" and Auto stays available. Never a fabricated row.
- `medianMeters === null` candidates render with `— min` and sort last (server already sinks them).
- The dialog never calls `/generate` until Confirm. No pre-fetch of generation.

### 2.4 Trending strip
Unchanged (`2026-08-22-first-run-prefs` provenance line stays).

### 2.5 Proof (root preview, real dev data)
- Comparison with 3 variants → 4 columns; with 2 → 3; with 0 → banner.
- Variant with anchor → line; legacy variant with null anchor → no line; neighborhood/activity variants → their fragment.
- Popup: Auto → three different anchor kinds on the review; pin Hotel Kanra → all three versions show that hotel; custom location → server-resolved or degraded to "no anchor label," never an invented pin.
- `Optimize this plan` disabled reasons unchanged; no `/generate` call without Confirm (network log).
- Testid counts reported per file; tsc 0 new; `TripStrip` and `layout.tsx` untouched.

---

## 3. Server scope — Claude Code lane, **after rulings in §4**

| Mock element | Needs | Ruling first |
|---|---|---|
| `+` ticks: pull one stop from a version into your plan, one confirm; desktop drag onto the baseline card | New endpoint (e.g. `POST …/variants/:vid/items/:iid/adopt`) writing one item into the baseline trip; idempotent; owner-gated; no charge | R-A |
| "Every version is saved as its own trip" | Either promote a variant to a trip **on adopt only** (ephemeral until then), or keep variants ephemeral and change the copy | R-B |
| Finalize popup: "Book it myself / Booking agent / Travel expert / Concierge — hands them a copy" | Handoff mechanism; the existing concierge rail grants **access** (`trip_expert_advisors`), it does not copy | R-C |

None of these are in the Replit lane.

---

## 4. Open rulings for Leon

- **R-A · per-stop adopt.** Adopting a single stop writes it into the baseline trip (the slip) with `routing_status: in_planning`, day/time from the variant, `provider_service_id` carried when the variant item is grounded; the variant is untouched. One confirm per batch of ticks. — *Recommend: yes; it's a partial apply, same rail family as `apply-to-trip`.*
- **R-B · versions as trips.** The mock says every version is saved as its own trip. The slip model says variants are the one permitted ephemeral copy. — *Recommend: variants stay ephemeral; "Select this plan" applies to the slip; drop the "saved as its own trip" copy from the mock. If you want "keep this version for later," that's a bookmark on the variant, not a trip.*
- **R-C · finalize handoff.** "Hands them a copy" contradicts the stationary slip. — *Recommend: reword to "gives them access to your plan"; mechanism = the existing advisor-access grant; Booking agent = Booking Concierge rail (Model B), Travel expert = expert engagement, Concierge = full done-for-you. Nothing charged until a booking is confirmed (mock copy already says so).*

---

## 5. Lane 0 for this spec
Copy this file to `docs/design/ADOPT_OPTIMIZATION_SPEC.md`; update the `SESSION_MOCKS_INDEX.md` row from "Phases 2–5 in progress" to "1c shipped · client completion (V3, anchor line, popup) dispatched · server items pending R-A/B/C"; no ledger rows until §4 is ruled.

## 6. FOLLOWUPS
- Route-shadow pair `GET /api/itinerary-comparisons/:id` (monolith vs router) — same class as `pin-liveroute`; consolidate.
- `<3` variant floor and ≥40% distinctness server-side (Task #1621).
- `within15MinCount` not persisted on the variant row — persist if the anchor line should show it after reload.