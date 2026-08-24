# Trip Segments (Option B) — consequence map

**Status:** audit, read-only. No code changed.
**As-of SHA:** branch `claude/sync-local-repo-2j7ghv`, working tree at time of audit (2026-08-08).
**Governing ruling:** `docs/briefs/TRIP_SEGMENTATION_DESIGN.md` §6a — decision-maker ratified
**Option B**: one trip, ordered `trip_segments` rows; `trips.destination` demoted to a display
label. This document is the "every consumer enumerated before the migration is cut" obligation
that ruling names.

---

## Executive summary

`trips` has exactly **one** `destination varchar(255) NOT NULL` column
(`shared/schema.ts:93`), and the codebase was built for a whole trip to have one city. Grepping
`\.destination\b` across `server/`, `client/`, `shared/` returns **535 matches** — the overwhelming
majority are either (a) display-only string interpolation on the client (headers, photo lookups,
share text), or (b) reads keyed on `tripId` that happen to also select `destination` for display.
**Very few call sites do anything structurally single-city** — the ones that do are the load-bearing
five below.

The good news the audit confirms: `itinerary_items`, `trip_expert_advisors`,
`optimizer-baseline.service.ts`, `cart-projection.service.ts`, `routing.routes.ts`,
`checkout-claim.service.ts`, and `payments.routes.ts` all key **only on `tripId`**. None of them
read or branch on `trips.destination`. That is the structural reason Option B is additive and
Phase 1 (a trip with zero `trip_segments` rows) needs **zero** changes to any of those files — the
brief's "byte-identical for a single-destination trip" claim holds by inspection, not by hope.

The five places that actually assume one city, in descending order of how much they'd break:

1. **AI itinerary-generation prompt** (`server/itinerary-optimizer.ts:733,1087`) — `destination`
   is a single string interpolated directly into the LLM prompt (`DESTINATION: ${destination}`).
   A multi-segment trip needs either N prompt runs (one per segment) or a rewritten prompt that
   accepts an ordered segment list. **Large.**
2. **Transport-leg mode scoring** (`server/services/trip-transport-legs.service.ts:105,185,207`)
   — `trip.destination` picks the `TRANSPORT_PROFILES` city profile for *every* leg on the trip,
   regardless of which day/segment the leg is in. Under B a leg in an Osaka segment must be scored
   against Osaka's profile, not the trip's single `destination`. **Medium.**
3. **Geocoding fallback** (`server/services/trip-plan.service.ts:298-316,598`) — an item missing
   coordinates is geocoded against `[locationName, locationAddress, trip.destination]`. A
   segment-2 item with only a bare venue name would silently geocode against segment-1's city.
   **Medium.**
4. **Ready-made trip listings** — `ready_made_trips.source_trip_id` is `UNIQUE`
   (`shared/schema.ts:7497,7528`), one listing per source trip, and `market` is a single
   launch-gated string (`server/routes/ready-made.routes.ts:148`, `isLaunchMarket`,
   `shared/launch-markets.ts`). A multi-segment source trip has no single answer to "what market is
   this." **Business-rule decision needed, not a schema problem — Small if segmented trips are
   simply excluded from ship-to-store in phase 1.**
5. **Trip Card hero + destination-scoped surfaces on the client** — `HeroSection.tsx:49,72-74,102`
   (photo/city/country parsed from one string), `trip-details.tsx:238,273` (services and expert
   search scoped to `trip.destination`). These are real UX gaps for a segmented trip but are
   **purely additive** — a single-destination trip renders identically; a segmented trip just
   doesn't get a good hero/search yet. **Large, but deferred to materialization phase.**

Everything else — routing, checkout, reconciliation, the money path, `trip_expert_advisors`,
`itinerary_items.dayNumber`, the Slip's day grouping — is keyed on `tripId` alone and needs **no
change** to keep working. Flat `dayNumber` (1..N across the whole trip) also **survives Option B
unchanged**: a segment is a date-range label over a contiguous day range, not a re-numbering
scheme (see §4 below).

---

## Pipeline consequence table

### 1. Trip birth — `POST /api/cart/resolve-trip`

`server/routes.ts:5670-5684` (also reproduced in the design brief §2).

| | |
|---|---|
| **Current assumption** | Builds a city histogram (`cityCounts`) across cart items + `externalItems`, then takes `Object.entries(cityCounts).sort(...)[0]` — the modal city — as the ONE `destination` written to the new trip row (`routes.ts:5747-5757`). Every cart item is then attached to that one trip regardless of its own city (`cartProjection.attachTripToCartItems`, step 7). |
| **What changes under B** | The histogram computation is **already the segmentation input** (brief §2's core finding) — it is computed then discarded. Under B, this becomes the raw material for the optimizer's segmentation output (`strategy`/`segments` DTO, brief §5), not something resolve-trip itself decides. Per §5b ruling, segmentation moves **into the optimize step**, so `resolve-trip` itself does **not** need to change in phase 1: it keeps writing one trip with the modal-city `destination`, and that string becomes the *display label* once the trip acquires segments. |
| **Effort** | S (no code change required for phase 1; the histogram is reused as-is when segmentation is built). |
| **Needed before single-city keeps working?** | No. |

### 2. Expert delivery

| Surface | File:line | Assumption | Under B |
|---|---|---|---|
| `trip_expert_advisors` | `shared/schema.ts:151-167` | Keyed on `(tripId, localExpertId)` only — no `destination`/city column. `uniqueTripExpert` index is trip-scoped, not segment-scoped. | **No change.** One expert-advisor relationship per trip regardless of segment count. A future "different expert per segment" feature would need a new column, but nothing here assumes one destination — it assumes one trip, which B preserves. |
| `TRIP_ADVISOR_WRITE_ACCESS_STATUSES` / `isTripAdvisor` / `isTripAdvisorWithWriteAccess` | `server/utils/trip-advisor.ts:44-118` | Pure `(tripId, userId, status)` predicate. No destination read. | **No change.** |
| Expert constraints read | `server/routes/experts.routes.ts:283-289` | Returns `trip.destination` as **display data only**, alongside `title`/dates/`eventType`, in the JSON payload to the expert Workstation. | **Cosmetic.** Once `destination` is a display label, this keeps working verbatim; a segmented-trip-aware Workstation would additionally want the segment list here, but nothing breaks. |
| Lead routing / expert-by-city matching | `server/services/lead-routing.service.ts:33,56,88-98` (`LeadContext.destination: string`, `scoreExperts`) | Scores experts 40pts on `ctx.destination` matching an expert's `local_expert_forms.destinations` array (`cities_covered`, line 69). `ctx.destination` is a **single string**, `toLowerCase().trim()`. | **Real gap.** Caller `server/routes/booking-actions.ts:213-235` requires `destination` (client-supplied, from `req.body.destination` or `optimizationContext?.destination` — **not** read from `trips.destination` server-side) as a single string. A segmented trip's "book with an expert" request has no single city to route on until the UI/route decides which segment the request is for. **Medium** — the routing engine itself needs no schema change (it already takes an arbitrary string), but the caller needs to pass a segment-scoped destination once segmented trips exist. |
| `resolveExperts` (content-matching, Discover feed) | `server/services/content-matching.service.ts:513-527` | `destination = city \|\| neighborhood \|\| ""` — derived from content metadata, not `trips.destination`. | **No change** — this path never reads a trip at all. |
| Cart-snapshot handoff (`?tripId=`) | Not independently re-verified beyond confirming the pattern is `tripId`-keyed throughout `booking-actions.ts` / `plancard.routes.ts`. | Keyed on `tripId`. | **No change.** |

### 3. AI optimization

| Surface | File:line | Assumption | Under B |
|---|---|---|---|
| LLM prompt generator | `server/itinerary-optimizer.ts:733,796,1087` | `generateOptimizedItineraries(destination: string, ...)`; the prompt literally contains `DESTINATION: ${destination}` (line 1087) and calls `fetchCityIntelligence(destination, ...)` (line 796) for ONE city's weather/season/event data. | **Large.** This is the single biggest optimizer change. Either (a) run this function once per segment with each segment's own destination/date-range/item-subset, or (b) rewrite the prompt to accept an ordered segment list and produce day ranges per segment. Ruling B does not itself require this be built now — it only requires it be *known* before segmented trips are optimized. |
| `itineraryComparisons.destination` | `shared/schema.ts:1184` | A **second, denormalized** single-string destination column, separate from `trips.destination`, set at comparison-creation time and read back at line 1647-1667 (`comparison.destination`) to scope a provider-services `ilike` location search for auto-fill. | **Medium.** Same shape as `trips.destination` — becomes a display/primary-segment label under B, or the comparison needs its own multi-segment awareness. Not touched by phase 1 (comparisons are created per optimize run, which per §5b stays trip-scoped, one fee). |
| `resolveTargetFromDb` (optimization fee) | `server/routes/optimization.routes.ts:133-183` (per design brief) | Keyed on `tripId`/`userExperienceId` + `eventType`. No destination read. | **No change** — confirmed by the design brief and re-verified here; fee resolution never touches `destination`. |
| `loadTripOptimizerInputs` | `server/services/optimizer-baseline.service.ts:155-210` | Reads `itineraryItems` by `tripId`, orders by `(dayNumber, sortOrder, createdAt)`. No destination read anywhere in the function. | **No change.** This is the function the design brief calls out as already trip-scoped and day-ordered; confirmed. |
| `calculateTransportLegs` (variant-scoped) | `server/itinerary-optimizer.ts:980,1535` → `server/services/trip-transport-legs.service.ts:105,185,207` | Both call sites pass `trip.destination` as a single city string into the transport-mode/profile scorer for **every leg on the trip**. | **Medium** (see executive summary #2). A leg inside a later segment gets scored against the wrong city's transport norms (e.g. subway-heavy Tokyo profile applied to a car-dependent segment). Needs per-leg segment resolution (map `dayNumber` → segment → segment's destination). |

### 4. Items & days — `itinerary_items.dayNumber`

| | |
|---|---|
| **Column** | `shared/schema.ts:3403` — `dayNumber: integer("day_number").notNull()`, flat `1..N` across the whole trip, no segment FK. |
| **Consumers checked** | `ProposalColumn.tsx:33-56` (Slip/PlanCard day grouping — groups purely by `dayNum`, sorts ascending, no destination awareness); `optimizer-baseline.service.ts:167` (`orderBy(asc(dayNumber), ...)`); `trip-transport-legs.service.ts:129-136` (`byDay` map keyed on `dayNumber` alone); `plancard.routes.ts` apply-to-trip insert (`dayNumber: item.dayNumber`, no segment stamp). |
| **Does a day number need segment scope under B?** | **No — flat numbering survives.** A `trip_segments` row is a *date-range label* (`startDate`/`endDate`), not a renumbering scheme. Day 1..4 = segment A (Kyoto), day 5..8 = segment B (Osaka) is fully representable by joining `dayNumber` → a *computed* date (`trip.startDate + dayNumber - 1`) → whichever segment's `[startDate, endDate]` contains that date. No schema change to `itinerary_items` is required. The one thing every day-grouping consumer above would need to ADD (not change) under B is a segment-label lookup for rendering purposes (§6 below) — the join is additive, the existing `dayNumber` ordering keeps working byte-for-byte. |
| **Effort** | S for schema (nothing to change); M for the display-layer join once segmented trips render (deferred, §6). |
| **Needed before single-city keeps working?** | No. |

### 5. Routing → cart projection → checkout

| Surface | File:line | Assumption | Under B |
|---|---|---|---|
| Routing state machine | `server/routes/routing.routes.ts:93-220` | Transitions (`in_planning → ready_for_checkout` etc.) operate on a single `itineraryItems` row by `id`, gated by `tripId` ownership. No destination read anywhere in the file (grep confirmed zero matches). | **No change**, confirmed. |
| Cart projection | `server/services/cart-projection.service.ts:1-50+` | `syncItemProjection` keys strictly on `itinerary_item_id`; the module header explicitly states it "writes CART ROWS ONLY" and "never writes routing_status." No destination read (grep confirmed zero matches). | **No change**, confirmed. |
| Checkout | `server/routes/payments.routes.ts:554` (`POST /api/checkout`) | Claim/authorize/promote spine (§15b/§15c) is keyed on `service_bookings` rows and PaymentIntent ids. No destination read (grep confirmed zero matches in `payments.routes.ts` for `destination`, and zero in `checkout-claim.service.ts`). | **No change**, confirmed — exactly as the task brief predicted ("Likely none — they key on tripId — but verify and say so"). |

### 6. The Slip and Trip Card

| Surface | File:line | Renders `destination`? | What a segmented trip needs |
|---|---|---|---|
| `SlipView.tsx` | `client/src/components/plancard/SlipView.tsx:60,132,157,545` | `trip?.destination` used only as a title/share-text fallback (`trip.title \|\| trip.destination \|\| "Trip plan"`); tracking number rendering (line 130-133) is per-trip, unaffected. Day grouping is not done in this file (it consumes an already-grouped `days` array from `trip-plan.service.ts`). | **No structural change** — title fallback keeps working with `destination` as a display label. A segmented trip eventually wants a segment/leg indicator near the tracking number, but nothing breaks without it. |
| `trip-plan.service.ts` (the read model both Slip and Trip Card consume) | `server/services/trip-plan.service.ts:780-850` (`days` array built from `dayNumber`), `:949` (`destination: trip.destination`) | Groups activities into `days` by `dayNumber` only (matches §4 finding — no segment awareness needed for grouping itself). Emits `trip.destination` once, verbatim, into the `plancard.trip` payload. | **Additive:** the payload would gain a `segments` array (ordered, each with its own `destination`/date range) alongside the existing `destination` label; existing consumers that only read `destination` are unaffected (additive-field rule already used elsewhere in this file per its own comments, e.g. `preservedRoutedItems`). |
| `HeroSection.tsx` (Trip Card hero) | `client/src/components/plancard/HeroSection.tsx:49,72-74,102,165` | Splits `trip.destination` on `","` to get `city`/`country`, fetches ONE hero photo keyed on that string, renders it as `alt`. | **Large, deferred.** A segmented trip needs either a multi-city hero treatment (carousel, primary-segment photo, or a "3 cities" label) — genuinely new UI, not a byte-identical extension. Single-destination trips render unchanged. |
| `PlanCardHeader.tsx` | `client/src/components/plancard/PlanCardHeader.tsx:19,35,44,62,91` | Same single-`destination` prop shape as HeroSection, used by the summary card. | Same as above — deferred, additive. |
| `trip-details.tsx` (legacy/adjacent full-page view) | `client/src/pages/trip-details.tsx:238-239` (services search `?location=trip.destination`), `:273-274` (expert picker `?destination=trip.destination`), `:757` (regenerate payload), `:1265,1290` (share/invite text) | Every one of these is a single-string destination query param or display string. | **Medium, deferred** — services/expert search would need a segment picker to search per-city; today it silently scopes to the trip's one label, which for a single-destination trip is correct and for a segmented trip is "shows results for the primary label only" (a degraded-but-not-broken behavior, acceptable for phase 1/2). |
| Leg headers / per-leg day grouping needed? | — | — | **Yes, eventually** — once `trip_segments` rows exist, the Trip Card needs a segment-header UI grouping the existing flat day range into per-segment blocks (per §4, this is a display-layer join over `dayNumber` → date → segment, not a data-model change). Not required for phase 1. |

### 7. Adjacent tables keyed on trips

| Table | File:line | Keying | Consequence under B |
|---|---|---|---|
| `ready_made_trips` | `shared/schema.ts:7494-7530` | `sourceTripId` **UNIQUE** (`idx_rmt_source_trip`, line 7528) — exactly one listing per source trip, unconditional (no WHERE clause per the deploy-push rule comment at line 7524-7526). `market varchar(100)` — "launch: Kyoto only" (line 7498 comment), gated by `isLaunchMarket` (`server/routes/ready-made.routes.ts:149`, `shared/launch-markets.ts`). | **Flag: ambiguous, needs a decision.** A segmented source trip has no single `market` to derive (`ready-made.routes.ts:148`: `market = parsed.data.market ?? trip.destination ?? ""` — falls back to the trip's now-demoted display label). The UNIQUE constraint itself is fine (still one listing per trip, segments or not) — the open question is whether ship-to-store should simply **reject** a trip that has `trip_segments` rows in phase 1 (Small: one guard clause), or whether a multi-city ready-made listing is a real product later (Large, separate design). Recommend: gate it out explicitly rather than let it silently launch a mislabeled single-city listing. |
| Guest-invites tripId | `shared/guest-invites-schema.ts` | Grep for `destination` in this file returns only comment text ("destination weddings") and an unrelated SERP-flow comment (`origin city → destination city`, referring to flight search, not trip destination). No structural coupling found. | **No change.** |
| `coordination_states` | `shared/schema.ts:2019-2039` | Has its **own** `destination varchar(255)` (nullable), independent of `trips.destination`, populated during pre-trip concierge intake (`tripId` nullable too — this table can exist before a trip does). | **No change needed for phase 1** — this is intake data, not itinerary data; it precedes segmentation and is not read by any of the pipeline stages audited above. |
| `user_experiences.tripId` | `shared/schema.ts:1461-1479` | Has its own `location varchar(255)` (nullable), independent column, set during the experience wizard. `tripId` FK is `ON DELETE SET NULL`. | **No change** — cosmetic/independent field, same shape as `coordination_states`. |
| Reconciliation surfaces | `server/jobs/stripeReconciliation.ts`, `server/services/checkout-claim.service.ts` | Grep for `destination` returns **zero matches** in both files. | **No change**, confirmed — the money-reconciliation layer is entirely `tripId`/PaymentIntent-keyed, exactly as CLAUDE.md §14-§19 would predict for a money surface. |

---

## Schema sketch — `trip_segments`

Additive-only, per CLAUDE.md's deploy-push and publish-time-CHECK traps and §19's allowlist rule.
A trip with **zero** `trip_segments` rows is single-destination, byte-identical to today's
behavior — no backfill, no default row insert.

```ts
// shared/schema.ts — new table, declared alongside `trips`

export const tripSegments = pgTable("trip_segments", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: varchar("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  // Display/city label for this leg — same shape/length as the demoted `trips.destination`,
  // deliberately NOT NOT-NULL-constrained differently than that column was.
  destination: varchar("destination", { length: 255 }).notNull(),
  // Ordering is APP-ENFORCED (no DB CHECK — publish-time-push trap, same posture as
  // `routingStatus`/`origin`). `segmentOrder` is the source of truth for leg sequence;
  // `startDate`/`endDate` are informational/derivable but stored for direct querying
  // (the day-range → segment join in §4 needs them without recomputing from dayNumber).
  segmentOrder: integer("segment_order").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Declared here per the deploy-push rule (index must live in schema.ts, not only the
  // migration, or a Replit publish silently drops it — CLAUDE.md "publish-time CHECK failure" /
  // index-drop trap).
  tripSegmentsTripIdx: index("idx_trip_segments_trip_id").on(table.tripId),
  // Enforces one row per (trip, order) WITHOUT a DB CHECK on vocabulary — this is a uniqueness
  // constraint, not a value-set CHECK, so it does not trip the publish-time-CHECK-over-legacy-
  // rows trap (there are no legacy rows; the table is new).
  tripSegmentsOrderUnique: uniqueIndex("idx_trip_segments_trip_order").on(table.tripId, table.segmentOrder),
});

// §19 allowlist posture (ruling 46, #PS18 precedent): this is the FIRST .pick()-based insert
// schema in the codebase — deliberate, per the ruling's own instruction. Only the fields a
// client may legitimately set are named; tripId is set server-side from the authorized route
// param, never trusted from the body (§14 posture applied to trip structure, not money).
export const insertTripSegmentSchema = createInsertSchema(tripSegments).pick({
  destination: true,
  segmentOrder: true,
  startDate: true,
  endDate: true,
});
```

**No DB CHECK** on `segmentOrder` contiguity/uniqueness-of-sequence-start, or on `destination`
vocabulary — both are app-enforced, matching the `routingStatus`/`origin`/`transportProvided`
precedent already established in `itinerary_items`. **No FK from `itinerary_items` to
`trip_segments`** — deliberately, per §4's finding: membership is derived by joining
`trip.startDate + dayNumber - 1` against `[segment.startDate, segment.endDate]`, not stored
redundantly. This keeps `itinerary_items` untouched (no migration on the largest table in the
system) and keeps a segment-less trip's items exactly as they are today.

**Migration:** would register as `182_trip_segments.sql` in `server/migrations/migration-files.ts`
(next open slot after `181_itinerary_items_origin.sql`), `CREATE TABLE IF NOT EXISTS` with the two
indexes, idempotent, no CHECK, no backfill, no default-row insert — a trip that never gets a
segment row never has one, and every consumer audited above already treats "no segments" as "one
destination" by construction (they just don't know the concept exists yet).

---

## Build order

**Ships now / no consequence-map dependency (Phase 1, per the design brief §7):** the segmentation
*engine* (`single`/`multi_city`/`split` proposal DTO) can be built and even run today, because
nothing downstream reads its output yet. It is pure computation over the cart's existing city
histogram (`server/routes.ts:5670-5684`).

**Needed BEFORE any trip can actually carry >1 segment (i.e., before `trip_segments` gets its
first non-test row):**
1. The `trip_segments` table + insert schema above (S — table has no dependents yet).
2. The AI-optimization prompt rewrite (`itinerary-optimizer.ts:733,1087`) — **Large**, and the
   hardest dependency: without it, "optimize" cannot honestly plan a multi-city trip even if the
   segments exist.
3. Transport-leg mode scoring per-segment (`trip-transport-legs.service.ts:105`) — **Medium**.
4. Geocoding fallback per-segment (`trip-plan.service.ts:298-316`) — **Medium**.
5. Ready-made ship-to-store guard against segmented source trips — **Small**, and cheap insurance
   against a silently mislabeled listing.

**Can wait until multi-city materialization actually ships (Phase 3 in the design brief):**
- Trip Card hero / `HeroSection.tsx` / `PlanCardHeader.tsx` multi-city treatment (Large, pure UI).
- `trip-details.tsx` per-segment services/expert search (Medium, pure UI/API param).
- Lead-routing caller passing a segment-scoped destination instead of the trip's one label
  (Medium, `booking-actions.ts:213-235`).
- Segment-header UI on the Slip/Trip Card day list (Medium, additive display join over §4's
  derived mapping).

**Needs no changes, ever, for a single-destination trip, confirmed by direct inspection:**
`routing.routes.ts`, `cart-projection.service.ts`, `payments.routes.ts` / `checkout-claim.service.ts`,
`optimizer-baseline.service.ts`, `trip_expert_advisors` + `trip-advisor.ts`, the reconciliation job,
`itinerary_items.dayNumber` itself (only its *rendering* gains a segment join, not its storage or
ordering).

---

## What Optimize delivers today vs what remains a separate purchase

**The pipeline, traced end to end with file:line evidence:**

1. **Comparison created / variants generated.** `server/itinerary-optimizer.ts:733`
   `generateOptimizedItineraries(destination, startDate, endDate, ...)` calls the LLM
   (`DESTINATION: ${destination}` at line 1087) and, per variant, calls
   `calculateTransportLegs(variantId, activities, destination, userTransportPrefs)`
   (lines 980, 1535) — this **does** produce transport legs, written to the variant-scoped
   `transport_legs` rows (`variantId` set, per `trip-transport-legs.service.ts`'s header comment
   describing the "variant-scoped pipeline… untouched" by the trip-scoped engine). Each proposed
   activity in a variant may carry a `providerServiceId` when the LLM/matching step found a real
   platform catalog row (`itineraryVariantItems.providerServiceId`,
   `shared/schema.ts:1238`) — so **yes, Optimize does place platform services**, as line-item
   proposals inside a variant, when a matching `provider_services` row exists.

2. **Selection.** `selectVariant(comparisonId, variantId)`
   (`server/itinerary-optimizer.ts:1797-1824`) only flips `itineraryVariants.status` and stamps
   `itineraryComparisons.selectedVariantId` — **no itinerary_items are written here.**

3. **Apply — the actual materialization onto the trip.**
   `POST /api/itinerary-comparisons/:id/apply-to-trip`
   (`server/routes/plancard.routes.ts:36-227`), inside one DB transaction:
   - Deletes existing `in_planning` items on the trip (routing-status-aware — `with_expert`,
     `ready_for_checkout`, and `purchased` rows are **never touched**, lines 108-113).
   - Dedupes the variant's proposed items against everything that survived the delete
     (lines 122-141).
   - Batch-inserts the surviving variant items as real `itinerary_items` rows
     (lines 143-159), explicitly carrying `providerServiceId: item.providerServiceId ?? null`
     (line 145) — confirming again that a platform-catalog match rides straight onto the trip —
     and stamping `suggestedBy: "AI Optimizer"`, `origin: "ai"` (lines 152-153). **The insert
     does not set `routingStatus` at all**, so every new row takes the column default,
     `"in_planning"` (`shared/schema.ts:3511`, migration 159's default — confirmed by the ROUTING
     comment on that column and by there being no `routingStatus` key in the insert object).
   - Writes one `variant_applied` diary row (`item_transition_log`, lines 172-178) — this is
     exactly the row `SlipView.tsx:592` (`hasOptimized = transitions.some(t => t.eventType ===
     "variant_applied")`) checks for.
   - Discards losing/unshared variants (lines 187-215); the winning variant and its
     `transport_legs` rows are kept.

   **Nothing in this transaction touches `service_bookings`, Stripe, or `cart_items`.** No money
   moves and no purchase record is created by Apply.

4. **The purchase boundary — a separate, traveler-initiated step.**
   `in_planning → ready_for_checkout` is a distinct state transition, gated
   **TRIP OWNER ONLY** (`server/routes/routing.routes.ts:38`, transition table lines 93-105,
   93-220). Only once an item is moved to `ready_for_checkout` does
   `cart-projection.service.ts`'s `syncItemProjection` write a `cart_items` row for it (module
   header, lines 1-50: "writes CART ROWS ONLY," "never writes `routing_status`" — it is purely
   reactive to the transition, never the trigger). Only then can
   `POST /api/checkout` (`server/routes/payments.routes.ts:554`) run the claim → authorize →
   promote spine (CLAUDE.md §15b/§15c) that actually charges Stripe and flips the item to
   `purchased` with a real `bookingId` (`itinerary_items.bookingId`, `shared/schema.ts:3428-3432`).

**Precise answer to "does clicking Optimize deliver a finished, ready-to-ship product including
transports and services from the platform?"**

**Partially, and the boundary is exact.** Optimize (through Apply) **does** produce a concrete,
day-by-day plan with real platform-service line items where a match exists and real
(engine-proposed, `'proposed'`-status) transport legs between them — this is a materialized plan,
not a vague suggestion. It is **not** a finished, ready-to-ship, already-booked product:
- Every item Apply writes lands in `routingStatus = "in_planning"` — the same status ordinary
  manual trip-building produces — with **no booking, no confirmation, no charge**.
- Transport legs are born `'proposed'`, not `'confirmed'` — per `trip-transport-legs.service.ts`'s
  own stated invariant, "a machine-guessed mode never renders on an expert-branded plan" until an
  expert (or the trip owner, for owner-built trips) explicitly promotes it.
- Purchase is a **separate, later, traveler-gated action**: route the item to
  `ready_for_checkout` (owner-only), then `POST /api/checkout` pays for it. Optimize can run
  (and Apply can materialize a plan) with **zero** money moving.

**Pre- vs post-purchase on the Trip Card:** `SlipView.tsx` renders every item's `routingStatus` as
a colored pill (`with_expert` / `ready_for_checkout` / `in_planning`, lines 245-261) for anything
not yet purchased; a purchased item (`isPurchasedRow`, line 109: `!!a.booking ||
a.routingStatus === "purchased"`) instead gets an anchor glyph — but **only once `hasOptimized`
is also true** (lines 294-295, 305: `purchased && hasOptimized`). So the Slip visually
distinguishes three states at once: never-optimized, optimized-but-not-purchased (plain
routing-status pill), and optimized-and-purchased (anchor glyph) — confirming the codebase itself
treats "optimized" and "purchased" as two independent, separately-gated facts, exactly matching
the pipeline trace above.
