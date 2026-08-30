# Optimizer sourcing — build spec (C2 wave)

**Ruled by decision-maker, Aug 8 2026.** Parent design: `docs/briefs/TRIP_SEGMENTATION_DESIGN.md`
(one paid optimization; segmentation is an output). Consequence map:
`docs/findings/TRIP_SEGMENTS_B_CONSEQUENCE_MAP.md` (multi-city = `trip_segments`, option B).

## The sourcing rule (new, governs the optimizer)

When the optimizer places a service or transport item, resolution order is:

1. **PLATFORM FIRST** — an approved `provider_services` listing matching the need, ranked by fit
   to the **traveler profile** (styles, transport preference, pace, budget band).
2. **EXTERNAL FILL** — only when no platform listing matches: Tavily/Google content fills the
   slot so the plan is never incomplete.
3. **EVERY external fill is LEDGERED by data type** — city + category + count — and surfaced in
   the Admin Panel, so supply recruitment is driven by real optimizer demand. A gap the ledger
   never saw is a gap the platform never fills.

Boundaries that hold: profile affects **what** is recommended, never the price (§8/§18 —
`fee_bands` only). External fills follow §16 (no raw outbound booking CTAs; affiliate URLs stay
server-side). Nothing here books or charges — Apply stays `in_planning` (§5b one-fee ruling).

## What already exists (reuse, do not rebuild)

| capability | where | state |
|---|---|---|
| Platform-service matching at Apply | `plancard.routes.ts:36-227` (`providerServiceId`) | LIVE — profile-blind |
| Trip-level style prefs → prompt/variants | `itinerary-optimizer.ts:252-258, 1576-1614` | LIVE — trip-scoped only |
| Grok trending → prompt | `fetchCityIntelligence` → `cityIntelligenceSection` | LIVE |
| Content-gap analyzer + Tavily ingestion + admin panel | gap analyzer service, admin analyze-gaps/gaps/ingest-gaps routes, `/admin/data` panel | LIVE — batch/manual, not optimizer-runtime |
| Durable per-user preference home | `users.preferences` jsonb (migration 150, namespaced) | LIVE — `settings` key only |

## Work packages (Sonnet-built; strict file ownership so they run in parallel)

### WP-A · Traveler profile + profile-aware platform selection
**Owns:** new `server/services/traveler-profile.service.ts`; edits to
`trip-transport-legs.service.ts` and the optimizer's prompt-section builders; `payment/`-free.
- `travelerProfile` namespace on `users.preferences` (NO migration): explicit fields
  (transportPreference, pace, budgetBand, dietary, mobility) + derived signals (past transport
  picks from purchased legs, dislike-feedback themes). Merge rule: explicit beats derived.
- Zod **`.pick()`-based** schema for the PATCH surface (§19); route mirrors
  `/api/me/preferences`'s allow-list + shallow-merge posture, scoped to its own namespace.
- Feed profile into (a) a new prompt section (like the style sections) and (b) transport-leg
  scoring — profile modulates leg *choice* (mode/comfort), never leg *price*.
- Platform-provider ranking: where Apply matches catalog services, rank candidates by profile
  fit before picking. Read-side only; approval gates (`approved`) unchanged.

### WP-B · Gap-fill ledger + Admin surface
**Owns:** gap-ledger service + admin routes/UI; extends the EXISTING content-gap infrastructure —
same tables where they fit, one new table only if the existing shape cannot carry
optimizer-runtime rows (then: declared in `shared/schema.ts`, indexes declared, NO CHECK,
`.pick()` insert schema).
- Record one typed row per external fill at optimize/Apply time: city, category/dataType,
  itemKind (service|transport|content), source (tavily|google|grok), tripId, createdAt.
  Append-only (§17 posture): detection, never silent repair; dedupe by (city, category, day-ish
  window) with counts, so persistent gaps read as demand volume, not spam.
- Admin: extend the `/admin/data` gap panel — "Optimizer gap fills" view grouped by
  city × category with counts + trend, so the decision-maker sees exactly what supply to add.
  Admin routes under the blanket `requireAdmin` (§2).
- Wire the existing Tavily fill path to pass through the ledger; Google (Places/CSE) only if a
  client already exists in the repo — do NOT add a new external dependency silently; if absent,
  ledger the gap with source `unfilled` and leave a TODO surface in the report.

### WP-C · Segmentation engine (dark)
**Owns:** new `server/services/trip-segmentation.service.ts` + its test file. Does NOT edit
`itinerary-optimizer.ts` (WP-A territory) — the engine is called beside it.
- Input: the city histogram resolve-trip already computes (`routes.ts:5670-5684`), dates,
  per-item scheduledDates, party size. Output: the §5 proposal DTO
  (`single|multi_city|split`, rationale, confidence, segments incl. `unplaced`, alternatives).
  NO `road_trip` (§6b — gated on geo coverage).
- Contract rules (§5): propose-never-commit; every item placed or explicitly unplaced; override
  wins; no fabricated geography; server-derived strategy.
- **Safety property, test-pinned:** a one-dominant-city histogram MUST yield `single` whose
  materialization input is byte-identical to today's resolve-trip behavior.

## Verification (every WP)
tsc count not above 190; `check-money-endpoints`, `phase2-fee-gate`, `check-omit-schema-ratchet`
(count must NOT rise — new schemas are `.pick()`), `check-unmounted-routers` all green; behavioral
proof per WP (node:test, disposable-DB guard posture, run + paste summary in the report).
