# Step 9 brief — Logistics: routing engine, LegRows, re-checks, options (rev 1)

**For a new Claude Code session ("Logistics session"). Reference: surface spec v1.3.7 §14 (R-ar…R-aw), §5, §10 step 9, §15. Base: main head at the time you branch (≥ `5f90596`, R358).** Three PRs (9a, 9b, 9c), each with a ledger row numbered at merge, each preceded by a read-only Phase 0 with `file:line` and a hard stop for the architect's go. Migrations held for the founder's ruling with SQL in the PR body, applied twice; next free number is 357.

## What this step is

The plan needs real travel between stops during planning, not only after optimization. Today: airport legs exist (step 3), `transport_legs` exists (R-bp), the Maps billing gate exists (R299: per-caller switches, caps, recorded costs, `shared/maps-billing.ts`), and `TRAVEL_TIME_SERVICE_ENABLED` is read somewhere (Finalize wrote no legs when it was off in a local run). What's missing is the engine as a contract, the cache, legs on every consecutive pair on paid/expert-held plans, the optimizer consuming legs instead of estimating, re-checks, and per-leg options.

## Standing rules (unchanged)

- **R-e:** free drafts get no routed legs. Thin connectors, airport legs and straight-line "est." findings only. Routed legs appear on optimized, Trip Pass and expert-held plans and their Trip Cards.
- **R-as:** no scraped transport data. Sources: the routing API, official feeds, affiliate APIs, our listings — each a registry source with licence class, `public_ok`, attribution, checked date.
- **R-at:** cache-first, changed legs only, debounced; every Maps call goes through the R299 gate by name; failed calls cost 0.
- **R-h:** minutes in-plan only; never on public surfaces.
- No fee literals; fares shown only when the source gives one, in the source's currency.
- Code comments cite the ledger slug. Conflict-marker guard, migration rule, mutation-auth counts regenerated when routes move.
- Claude Code never has a production database URL; production reads are Replit's.

## Pre-ruled decisions (apply; don't re-ask)

| # | Ruling |
|---|---|
| L1 | `RoutingAdapter` interface: `route(origin, destination, mode, departAt) → { durationMin, distanceM, line?, fare?: {amount, currency}, provenance: {source, checkedAt} }`. Google Routes is the first implementation. Per-market adapters later, same interface. |
| L2 | Cache key `(originPlaceId, destinationPlaceId, mode, hourBucket)`; hour bucket = local hour of departure; TTL 30 days; shared across plans. Cache table is a new migration (357), nullable columns + PK only. |
| L3 | Compute triggers: (a) every leg of each version at Optimize; (b) on any change to an optimized / Trip Pass / expert-held plan — debounced 2 s after the last change, changed legs only (an edit touches at most two legs). Never on free drafts. Never on page load. |
| L4 | Mode default per leg: walk when straight-line ≤ 1.2 km; else transit where the market has transit coverage; else drive. 9c exposes up to three mode options per leg; 9a stores the default only. |
| L5 | Cap behaviour: when a caller's daily cap is hit, existing legs stay as last computed, the plan shows one line "Travel times paused today — resumes tomorrow", and edits are never blocked. Health already reports the switches; add the day's spend per caller to `/internal/jobs/health` only if it isn't there. |
| L6 | Fare display: only when the source returns one; "· ¥220" in the source currency; never converted, never estimated. |
| L7 | Provider pickup (R-au): 9c consumes **confirmed** listing fields only (pickup offered, zones, meeting point, stations/hotels served, drop-off) and renders "via host pickup · as described by the host". The extraction pass and provider confirmation UI are a separate engineer/Content lane and not in this step; if the fields don't exist yet, 9c reads nothing and shows nothing. |
| L8 | Re-checks (R-aw): T-3 via the existing `facts-recheck` job (it already re-runs stop lookups; add legs); day-of once per trip day for the Trip Card via the same job's cadence. A changed leg (duration moves > 10 min or mode unavailable) is a banner finding on the card, never a silent rewrite of the plan. |
| L9 | Optimizer (R-av): consumes legs from `transport_legs`/cache; `city_crossing` and `walking_saved_km` drop "est." when every leg in the finding has a routed duration; otherwise keep "est." on that finding. |
| L10 | Pricing: drive and transit at Routes Essentials ($5/1,000 as recorded in R299); matrix elements at Pro. Caps stay as set unless the founder changes them on the admin screen; this lane doesn't move cap values. A settled 5-day plan ≈ 20 legs; Phase 0 reports the expected calls per Optimize run and per edit so the founder can check the cap. |
| L11 | Lane boundary: `SlipView.tsx` / `SlipRail.tsx` are Track A's files; 9a mounts `LegRow` through the existing `DayBlock`/`ItemRow` contracts and `useSlipViewModel` without reordering either file's calculation block (≈29 tests read them as text). If a change there is unavoidable, stop and report. |

## 9a — engine + LegRows on paid and expert-held plans

**Phase 0 (read-only, file:line):** what exists today for `TRAVEL_TIME_SERVICE_ENABLED`, `transport_legs`, airport legs, the Maps billing callers, any existing travel-time computation (where Finalize writes legs); whether a cache table exists; where `LegRow` is rendered now and what props it takes; which tests pin leg text; what Optimize currently computes between stops; expected Maps calls per Optimize run and per edit under L3; the exact set of plans that count as "optimized / Trip Pass / expert-held" in code. Hard stop.

**Build:** `RoutingAdapter` + Google implementation behind the R299 gate; cache table (migration 357, held); `transport_legs` compute for every consecutive pair and anchor ↔ first/last stop under L3; `LegRow` on those plans with the full line ("24 min · Keihan line · ¥220 · Google · checked 4 Oct") and provenance; buffer check on `AnchorRow`s uses the routed airport leg once it exists (fixed buffer before); paid `OptimizerLead` delta reads routed legs ("2 legs don't fit"); Trip Card renders the same legs. Free drafts unchanged.

**Gates:** fixture tests — cache hit skips the call; changed-legs-only on an edit (exactly two legs recomputed); cap hit → paused line, no call, edits allowed; free draft → zero routing calls; failed call → 0 cost, thin connector. tsc at baseline, guard batch clean, mutation-auth regenerated if routes change. e2e on the Kyoto fixture: Optimize → legs appear with provenance; one edit → two legs change. Migration SQL in the PR body, applied twice.

## 9b — optimizer consumption + re-checks

**Phase 0:** where the optimizer estimates travel today (`city_crossing`, `walking_saved_km`, buffer findings); what `facts-recheck` re-runs and how findings reach the T-3 banner and the card; which tests pin "est.". Hard stop.

**Build:** L9 and L8. Findings carry `routed: true|false`; the banner finding for a changed leg reads "Travel to <stop> now 31 min (was 18) · re-checked <date>". Day-of re-check writes a `leave by` time on the card's today rows.

**Gates:** fixture — finding drops "est." only when every leg is routed; a changed leg produces one banner finding and no plan rewrite; two job runs produce one finding. Kyoto golden path green.

## 9c — per-leg options and booking, provider pickup, tools

**Phase 0:** what `ItemSheet` shows for a leg today; the "Getting there"/"Getting around"/"Getting home" tools in the manifest; which listing fields exist for pickup; the concierge booking path for transfers. Hard stop.

**Build:** `LegRow` tap → up to three mode options (L4) with duration/fare/provenance; "Book this for me" on a leg goes through the existing concierge booking path with the existing bands (no new fee); confirmed host pickup renders per L7; "Getting around" / "Getting home" tools read the plan's legs.

**Gates:** fixture — three options max, default first; a leg with a confirmed pickup renders the host line and no Book; booking a transfer creates a provider booking under the existing band. No prices in item rows (R-h).

## Out of scope
Per-market adapters (NAVITIME/Jorudan), GTFS ingestion, the provider-field extraction pass and confirmation UI, upsell (step 10), cap value changes, anything on free drafts beyond today.

## Reporting
After each Phase 0: the report file beside the step-8 ones (`docs/planning/briefs/step-9x-phase0.md`), decisions needed with a recommendation each. After each PR: number, head, migration SQL (9a), tests touched, Maps calls per run/edit measured in the e2e, and anything the engine exposes about supply (a city pair with no transit, a stop with no place ID).
