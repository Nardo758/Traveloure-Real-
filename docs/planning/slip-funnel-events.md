# Slip funnel events — vertical slice, Part 4 (Instrumentation)

> **Target: ten real Kyoto travelers using the Trips slice in November 2026.**

**Status: RATIFIED AS DESIGN (decision-maker, Sep 27, 2026), with three conditions that bind the build:**
1. Events store **ids and enums only** — never tokens, secrets or free text.
2. Every event carries the **actor id** (LD 44 (f)'s posture: the acting user, server-derived, never client-supplied).
3. The §7 defaults are accepted **except** any that adds a table, takes a client-supplied amount, or takes a
   client-supplied actor — those come back to the decision-maker. Checked on ratification: none of the nine adds a
   table or takes a client amount/actor. **Q6 (retention) is RULED (decision-maker, Sep 28, 2026 — ledger
   `2026-09-28-analytics-retention`):** see §7 item 6; it applies to `funnel_events` and `optimizer_runs` alike.
The three defects in §1 (share token in T7 properties, T6 "revenue" on an unpaid request, the undeclared
`funnel_events` indexes) are fixed in their own lanes (ledger `2026-09-27-funnel-share-token-purged`,
`2026-09-27-funnel-revenue-on-paid`, `2026-09-27-migration-indexes-declared`). The free-draft event, the adopt-stop
diary row and the `upsell_impressions` actor/outcome/double-log gaps are this Part's build scope. No code, no migration,
no dashboard in this document.
**Brief:** handoff pack 2026-09-27, section C, Part 4 (`docs/planning/briefs/vertical-slice.md`, on main).
**Code base:** `main` @ `c99acfa8b`. Every `path:line` is on that commit.
**Sources:** `docs/planning/trip-slip-product-map.md` (§E option sets, §F versions, §G rollout);
`docs/planning/recommendation-convergence-brief.md` (§F phase 0: impression logging); CLAUDE.md §13, §14, §15b, §19,
LD 39, LD 40, LD 41, LD 42 D3/D18, LD 45; the deploy-push durability rule; §20.
**Pending inputs:** Part 1 (`golden-path-trips-kyoto.md`, PR #1139, written in parallel with this doc) and Part 2 (M:
anchors and plan-fit; N: optimizer run records, not written yet). Where an event depends on them, this doc says **NOT BUILT** and names the row it
expects them to create.

---

## 1. What exists today (the logs this design reuses or refuses)

| Log | Shape | Writer | Fit for slip events |
|---|---|---|---|
| **`funnel_events`** (`shared/schema.ts:10653`, migration 089) | `session_id`, `user_id`, `trip_id` (varchar, **no FK** — rows survive deletion), `event_type` varchar(64), `stage` varchar(4) NOT NULL (`T0`–`T7`), `properties` jsonb | `trackFunnelEvent` (`server/utils/funnelTracker.ts`) — catches its own errors and never throws | **The home.** Append-only, trip-scoped, carries properties, never fails its caller. |
| **`upsell_impressions`** (`shared/schema.ts:9580`) | trip, guest session, surface, offering, category, three scores, rank, `clicked/added/booked` + timestamps | `logImpressions` (`server/services/upsell-engine.service.ts:409`) at rank time; `insertImpression` / `markImpressionClicked` (`server/services/upsell-query.service.ts:585-610`) from the client | **The impression log** the brief means, for engine suggestions. Needs the brief's phase-0 fixes (below). |
| `content_impressions` (`shared/schema.ts:7440`) | card type/id, city, position, session; one row per card per session | `POST /api/tracking/impression` (`server/routes/content.routes.ts:9458`) | **Does not fit.** Unauthenticated, no `trip_id`, no properties, per-session dedupe, and its one reader (`server/services/discover-impressions.service.ts`) groups every `content_type` with no filter, so slip rows would appear as Discover cards. |
| `item_transition_log` (`shared/schema.ts:8119`) | the slip's diary; `event_type` varchar(30), actor, from/to status; no properties | `logItemTransition` (`server/services/item-transition-log.service.ts`) | **Read, never write analytics into it.** The slip's displayed version ("v14") is the row COUNT (`getTripTransitionCount`), so an analytics row would move a number the traveler reads. |
| `fee_ledger`, `service_bookings`, `refunds`, `trip_finals`, `itinerary_comparisons`, `ai_cost_tracking` | money, booking and plan records | their own single writers | Facts already recorded; events **derive** from them. |

**Surprises found (recorded, not fixed here):**
- **`funnel_events` has no durable indexes.** Migration 089 creates five; `shared/schema.ts` declares none, so the
  deploy push drops them and the stamped migration never recreates them (the deploy-push rule's own trap).
- **`trip_created` is only emitted from mint site 1** (`server/routes.ts:1522`); the other nine mint sites emit nothing.
- **The slip's free-draft rail emits no funnel event.** `itinerary_generated` (T3) fires only on
  `POST /api/trips/:id/generate-itinerary` (`server/routes.ts:1860`). The slip uses `POST /api/ai/generate-itinerary`
  (`client/src/components/plancard/SlipRail.tsx:443` → `server/routes/content.routes.ts:4782`), which writes
  `ai_cost_tracking` (no `trip_id` column, and only when tokens > 0) and `ai_interactions`, but no event.
- **T6 `revenue` is not revenue.** It fires at `POST /api/expert-booking-requests` (`server/routes.ts:2121`), an
  unpaid request, with `amount = Number(service.price ?? 0)` — a zero-filled amount named as revenue (§13).
- **A live share token is stored in analytics.** T7 `viral_share` puts `refToken: shareToken`
  (`server/routes/booking-actions.ts:604`) into `properties`; that token is a 90-day read grant on the plan.
- **Signup `source` is taken raw from `req.body`** (`server/replit_integrations/auth/emailAuth.ts:126`), unbounded, no allowlist.
- **`upsell_impressions`:** `logImpressions` never writes `user_id`; the client `POST /impression` writes a second row
  for the same render (double-logging, brief §A); `clicked_at`, `added`, `booked` are never written; the three
  booleans are `NOT NULL DEFAULT false`, so every existing `added = false` means "not tracked", not "not added".
- **adopt-stop leaves no trace** (`server/routes/plancard.routes.ts:291-395`): no diary row, and the inserted item
  (`origin 'ai'`, `suggestedBy 'AI Optimizer'`) is indistinguishable from an apply-to-trip item.
- **`service_bookings` has no `cancelled_by`.** `cancelled_at` and `cancellation_reason` exist; who cancelled does not.

---

## 2. Principles

1. **Derive before writing.** An event whose fact is already a durable row (a payment, a booking, a final version,
   a chosen option) is a READ over that row. A second record of the same fact is the drift §18 rule 1 names.
   Events are written only when the fact is a view, is overwritten later, or lives on a row that can be deleted.
2. **Server-emitted by default.** An action is emitted at the server site that decides it, after it commits.
   Client emission is only for **views** (plan-fit shown, gap shown), which the server cannot observe.
3. **One writer.** Every slip event is written through ONE function, `recordSlipEvent`
   (proposed `server/services/slip-events.service.ts`), a typed wrapper over `trackFunnelEvent`. It builds
   `properties` from a per-event allowlist; unknown keys are dropped. Suggestion impressions keep their existing
   writers in `upsell-engine.service.ts` / `upsell-query.service.ts`.
4. **Never fails the action (§15b).** The write happens after the action commits, outside its transaction, is not
   awaited on the response path, and catches its own errors. A lost event is a gap in analytics, never a failed
   booking or draft.
5. **Actor from the session (§14).** `user_id` is always `getUserId(req)` (or the service's actor argument), never a
   body field. The client rail cannot name another user or another plan it cannot read.
6. **Client bodies are pick-based allowlists (§19).** The one client rail parses a `.strict()` discriminated union
   of the client-emittable events only.
7. **§13.** A property that is unknown is **omitted**, never `0`, `""` or a guessed value. No backfill: an event
   has no history before its writer shipped, and every count says from which date it is counted.
8. **Privacy.** No guest PII, no card data, no prompt or model text, no free text the traveler typed (titles
   included), no share tokens, no session cookie ids. IDs only. `funnel_events` is admin-read only; nothing here
   reaches a public payload (LD 40).
9. **Value sets are stated once**, in proposed `shared/slip-funnel-events.ts`: event names, and every enumerated
   property below (`occasionSource`, `optionSource`, `adoptMode`, `fitBasis`, `draftBasis`, `cancelActor`,
   `viewerRole`, `surface`). No DB CHECK (publish-trap posture).
10. **Stage.** `funnel_events.stage` is NOT NULL. `plan_created` keeps the existing `trip_created` row at `T2`;
    every new slip event is stamped `SLIP` (fits varchar(4)), because none of them is one of ADR-004's T0–T7 steps
    and forcing one on them would be a false label. Admin stage counts (`server/routes.ts:12347`) will show a
    `SLIP` group.

**Common properties on every written slip event:** `tripId` (column), `userId` (column), `viewerRole`
(`owner | delegate | advisor`, from the same predicate that authorized the action), `market` (`trips.market_slug` at
emit time, omitted when NULL), `viewId` (client events only: a random per-page id the client mints, never a session
or cookie value).

---

## 3. The thirteen events

### 3.1 Plan created (occasion source)
- **Fires:** `POST /api/trips` after `storage.createTrip` (`server/routes.ts:1509-1527`, mint site 1). Every slice
  finish (`myself`, `local`, and `ai` since `2026-09-24-rc1-finish-mints`) mints through `mintTripSlip`
  (`client/src/lib/trip-slip.ts:170`) to this rail.
- **Lands:** the EXISTING `trip_created` / `T2` row in `funnel_events`, with properties added. No new event name.
- **Properties:** `door` (string enum, nullable — see below); `occasionSource`
  (`door_prefilled | asked | none`, nullable); `datesConfirmed` (bool, from the mint's own `datesChosenByTraveler`);
  `market` (from the row).
- **The gap:** the server does not know the door. `PlanningSource` (`client/src/contexts/PlanningContext.tsx:75`)
  carries no door id, and `buildTripMintBody` (`client/src/lib/trip-slip.ts:136`) sends only title, destination and
  dates. The occasion itself is written AFTER the mint, by `commitPlan` →
  `PATCH /api/trips/:tripId/occasion` (`server/routes/trips.routes.ts:3394`), and `trips.experience_type_id` (LD 42 D1)
  is not declared yet. So the occasion VALUE is **derived** later from the row (`experience_type`, `moment_key`, and
  `experience_type_id` once D1 lands); only its SOURCE needs a write.
- **Proposed:** `PlanningSource` gains a `door` key from a closed list (`hero`, `start_events`, `marketplace`,
  `moment`, `nav_occasion`, `experience_cta`, `city_grid`, `trip_strip_edit`, `concierge`, `pricing_ladder`,
  and — amended 2026-09-28, ledger `2026-09-28-landing-doors` — `billboard`, `event_strip`, `events_page`), and
  the mint body gains an optional `entry: { door, occasionSource }`, admitted by a `.strict()` pick used ONLY by the
  event writer and never stored on `trips`. `occasionSource` comes from `resolvePlanSteps`: step 1 skipped by a
  resolved occasion ⇒ `door_prefilled`; step 1 answered ⇒ `asked`; neither ⇒ `none`. A client that sends nothing
  records nothing (omitted, not `none`).
- **Amendment 2026-09-28 (ledger `2026-09-28-landing-doors`; decision-maker dispatch).** Three doors join the list,
  because they are the entry points the landing marketing test measures and a door off the list records nothing:
  `billboard` (a landing billboard tile's "Start this plan"), `event_strip` (the landing "Coming up in our cities"
  strip's "Plan around it") and `events_page` (the `/events` "Coming up" block's "Plan around it"). The list stays
  closed and stated once in `shared/slip-funnel-events.ts`; a door still off it sends nothing.
- **Amendment 2026-09-30 (ledger `2026-09-30-blog-event-guide`; decision-maker dispatch "blog generator lane").**
  One door joins the list: `blog_post` (an event post's "Start this plan", with the event as the plan's fixed
  anchor, M7). The anchor is the same one `event_strip`/`events_page` send, built by the same
  `planAroundSource`, from the post's LIVE event row.
- **Amendment 2026-09-29 (ledger `2026-09-29-expert-door`; decision-maker dispatch "expert door").** The dispatch
  asked for a door value `modal_expert`. A door names where the traveler ENTERED the modal; "Get a local expert" is a
  way to build chosen at its END, so it is recorded as a separate property rather than a door (a plan that entered by
  the hero and finished with the expert keeps both facts): `entry.finish` ∈ `myself | ai | local_expert`, the three
  finishes that mint (Save and the occasion finish send none), same `.strict()` pick, same "client-supplied, omitted
  when absent" rules. Stated once as `PLAN_FINISHES` in `shared/slip-funnel-events.ts`.
- **Idempotency:** one mint, one row; no dedupe needed. **Emitter:** server (door fact is client-supplied, labelled as such).

### 3.1b The expert door (ledger `2026-09-29-expert-door`) — WRITTEN
After "Get a local expert" the slip asks "How much help do you want?" and opens a picker. Four rows, all `funnel_events`,
stage `SLIP`:
- `expert_help_level_chosen` — `{ level, tier, market }`; via the client rail (§5). `level` ∈ `check | plan | handle |
  question`; `tier` is its offering tier (`advisory | planning | coordination`, or `ask_me_anything`); `market` is the
  plan's own, server-derived.
- `expert_picker_shown` — `{ level, tier, market, count }`; via the client rail; `count` is RECOMPUTED server-side from
  the picker, never taken from the client.
- `expert_interest` — `{ level, tier, market }`; via the client rail, when no expert in the market offers the level
  and the traveler takes the empty state's action.
- `expert_request_sent` — `{ serviceId, offeringTypeKey, level, tier }`; written by the SERVER on
  `POST /api/expert-booking-requests` when the request names a plan. Deliberately not `expert_requested`, which is the
  existing PAID event (written by the payment path, no plan id); this row is the request itself.

### 3.2 Anchor set opened — NOT BUILT
- **Fires:** the insert of a `plan_option_sets` row (product map §E2, rail `POST /api/trips/:tripId/option-sets`;
  build = §G step 3). Which set is the ANCHOR is Part 2 M's to define (Trips → hotel).
- **Lands:** **derived, no write.** The row is the fact: `trip_id`, `category_key`, `created_by`, `created_at`,
  `user_experience_id`, `day_number`.
- **Needs from M:** an explicit anchor marker on the set (e.g. `anchor_role`: `primary | secondary`, NULL = not an
  anchor). Without it, "anchor" would be inferred from `category_key = 'accommodation'`, which is wrong for any
  other group and for a plan comparing two hotels for a second stop.
- **Stated limit:** sets CASCADE with the trip; a deleted plan's sets vanish (see §7 Q4).

### 3.3 Option added (source) — NOT BUILT
- **Fires:** `POST …/option-sets/:setId/options` (§E2), after the insert commits.
- **Lands:** **written** — `funnel_events`, `event_type = 'slip_option_added'`, stage `SLIP`. The `plan_options` row
  records the same add, but §E2's `DELETE …/options/:optionId` removes it, so a derived count loses every option
  the traveler added and then removed.
- **Properties:** `setId`, `optionId`, `optionSource` (§E2 `source_kind`: `incumbent | listing | affiliate |
  saved_place | custom`; Part 2 may add `engine`), `addedByRole` (`traveler | delegate | expert`), `categoryKey`
  (nullable), `position` (1–3), `hasPrice` (bool — whether `price_snapshot` was stated; never the amount),
  `sourceImpressionId` (nullable; the `upsell_impressions.id` when the engine offered it).
- **Emitter:** server. One row per successful insert; a 409 at the cap writes nothing.
- **Alternative (§7 Q3):** give `plan_options` a `removed_at` instead of a hard delete, and derive this event.

### 3.4 Plan-fit shown — WRITTEN (A4, ledger `2026-09-29-a4-plan-fit-compare`)
- **Fires:** the compare view renders an option's plan-fit (Part 2 M: day-weighted travel burden plus neighbourhood
  coverage). A view, so the client emits it when the fit line is ≥50% in the viewport for ≥1 s (the
  `content_impressions` visibility rule).
- **Lands:** **written** — `funnel_events`, `slip_plan_fit_shown`, via the one client rail (§5).
- **Properties:** `setId`, `optionId`, `fitBasis` (`matrix | est_straight_line`), `fitVersion` (the M module's
  version string), `rank` (1–3 among the set's options, by fit), `coverageOmitted` (bool), `surface`
  (`compare_view | anchor_question`), `viewport` (`narrow | wide`, from a CSS breakpoint, not a user agent).
  **The fit VALUE is not taken from the client.** The server recomputes it at write time through M's one derivation
  and stores `burdenMinutes` (nullable) and `coverage` (nullable) only when that derivation answers.
- **Dedupe:** at READ time — count distinct `(tripId, optionId, viewId)`. No unique index (see §5).

### 3.5 Option chosen — NOT BUILT
- **Fires:** `POST …/option-sets/:setId/choose` (§E3 step 1, the atomic `status='open' → 'chosen'` claim), and the
  apply-to-trip / adopt-stop choices of §F2 (3).
- **Lands:** **derived, no write.** `plan_option_sets.status`, `chosen_option_id`, `chosen_at`, `chosen_by`. The
  claim is exactly-once, so the row is exactly one event.
- **Derived properties:** `setId`, `chosenOptionId` → its `source_kind` and position; `wasIncumbent`;
  `choseTopFit` needs the last `slip_plan_fit_shown` for that set before `chosen_at` (join, not stored); `via`
  (`choose | version_whole | version_stop`) needs one extra field — M/N should record it on the set
  (`chosen_via`); until then it is omitted.

### 3.6 Free draft run
- **Fires:** `POST /api/ai/generate-itinerary` (`server/routes/content.routes.ts:4782`) after
  `saveGeneratedItinerarySnapshot` commits (`:4989`), and on its refusal branch (`:4909-4912`,
  `resolveAiDraftEligibility` ⇒ 409, LD 41 (b)).
- **Lands:** **written** — `funnel_events`, `slip_free_draft_run`. Nothing existing carries the trip:
  `ai_cost_tracking` has no `trip_id` and skips zero-token calls; `itinerary_items.origin='ai'` rows are deleted by a
  later apply-to-trip.
- **Properties:** `outcome` (`drafted | refused_not_empty | provider_failed`), `itemsWritten` (int, only on
  `drafted`), `draftBasis` (`chosen_anchor | open_anchor_set | none_asked` — Part 2 M; omitted until M ships),
  `heldSlots` (int, open sets the draft built around, R126; omitted until §E ships), `modelTier` (the
  env-configured tier name; a cost fact, never shown to travelers — LD 41 (c)).
- **Emitter:** server. The refusal writes one row per refused request; the model call is never made on that branch,
  so no cost is implied.
- **Amended by A5 (ledger `2026-09-29-a5-draft-open-set`):** `draftBasis` and `heldSlots` are written. `draftBasis`
  is `open_anchor_set` or `none_asked` and only for a lodging-anchored Trip (omitted otherwise; `chosen_anchor`
  cannot occur on the free path, since a chosen stay is an item). `heldSlots` counts the open sets the draft read,
  0 included. A fourth outcome, `anchor_asked`, is one row per request the draft ASKED where the traveler is staying
  instead of drafting (no model call). `none_asked` is recorded on the draft that follows the traveler's own
  "Draft without a hotel".

### 3.7 Gap shown / gap filled — NOT BUILT
- **Gap shown fires:** the completeness module (product map B4, §G step 2) renders a REQ category the plan lacks.
  A view ⇒ client-emitted via §5.
  **Lands:** `funnel_events`, `slip_gap_shown`. **Properties:** `categoryKey`, `requirement` (`req | rec`),
  `dayNumber` (nullable), `surface` (`slip_list | slip_map | finalize`).
  Dedupe at read: distinct `(tripId, categoryKey, viewId)`.
- **Gap filled:** **derived, no write.** A gap is filled when the plan gains an `itinerary_items` row, or a chosen
  option, whose category resolves (through B4's one mapping module) to the gap's `categoryKey`, after the first
  `slip_gap_shown` for it. Attribution comes from the fill's own provenance (`optionSource`, or
  `upsell_impressions.added` with `category_key`), not from a second event. A dismissal is a
  `plan_gap_dismissals` row ("Not needed", §G step 2) — a third, derived outcome, never counted as filled.

### 3.8 Suggestion shown / suggestion added — PARTIAL
- **Shown fires:** the engine returns ranked candidates (`logImpressions`, `upsell-engine.service.ts:409`). The slip
  renders no suggestions today (`client/src/pages/slip-view.tsx` mounts no `UpsellSlot`; the nearest is the
  PlanCard's `plancard_pretrip` "what's missing" slot, `client/src/components/plancard/PlanCard.tsx:1273`).
- **Lands:** **the existing impression log, `upsell_impressions`** — the brief's "reuse the impression log".
  One row per candidate per render; `surface` gains `slip` (code-only `Surface` union,
  `upsell-engine.service.ts:33`). Scores and rank are already columns.
- **Added:** an existing column, never written today. When an add arrives carrying a `sourceImpressionId` (the
  option add of 3.3, or the ordinary item add), the server runs ONE atomic conditional:
  `UPDATE upsell_impressions SET added = true, added_at = now() WHERE id = ? AND trip_id = ? AND added = false`.
  The id is taken only if that row exists and names the same trip and offering (the
  `resolveClickAttribution` posture, `discover-impressions.service.ts`); a stale or foreign id links nothing.
- **Prerequisites (brief §F phase 0):** one row per server call (drop the client `POST /impression` second write for
  engine-served slots); write `user_id` from the session; a **cutover date** before which `added = false` means
  "not tracked" (§13 — the column defaults to false).
- **Expert suggestions** (`trip_suggestions`, LD 52 (B)) are a different source: shown = the row exists, added = its
  approved status. Derived, no write.

### 3.9 Run purchased
- **Fires:** the optimizer run is authorized (`resolveOptimizerRunAuthorization`,
  `server/services/optimizer-run-authorization.ts`) at the create and regenerate points, which call
  `recordOptimizerRunTollFor` (`server/routes.ts:634`).
- **Lands:** **derived, no write.** `fee_ledger` rows with `source_type = 'optimizer_run'`
  (`server/services/fee-ledger.service.ts:513`): a paid run is ONE `ai_concierge_fee` row keyed on the PaymentIntent;
  a Trip Pass or free re-run is that row plus a `fee_waiver` naming `covered_by`
  (`2026-09-25-planning-tolls`, `2026-09-25-tolls-fee-ledger`). `metadata` carries `comparisonId`, `tripId`, `tier`,
  `basis`, `actor`.
- **Derived properties:** `basis` (`paid | trip_pass | free_rerun`), `comparisonId`, `tier`, `amount` (from the row).
- **Stated limits:** a regenerate reusing the comparison's recorded payment writes nothing (not a new charge), so
  "runs" ≠ "purchases"; the known per-user free re-run quirk (LD 41 (a), "recorded, not fixed") applies. When
  Part 2 N lands, its run record is the home for run → version → outcome, and this stays the money read.

### 3.10 Version adopted (whole / part)
- **Fires:** `POST /api/itinerary-comparisons/:id/apply-to-trip` (`server/routes/plancard.routes.ts:53`) after its
  transaction; `POST …/adopt-stop` (`:291`) when `adopted: true`; the future `adopt-stops` batch (§F2 (3), R-A,
  NOT BUILT).
- **Lands:** **written** — `funnel_events`, `slip_version_adopted`. Today the whole-adopt leaves a
  `variant_applied` diary row with no comparison or variant id, and `itinerary_comparisons.selected_variant_id` /
  `optimized_at` are overwritten by the next apply; the part-adopt leaves nothing.
- **Properties:** `comparisonId`, `variantId`, `adoptMode` (`whole | stop | stops`), `itemsAdded` (int),
  `itemsReplaced` (int, whole only — the deleted `in_planning` rows), `protectedKept` (int — D3 rows the apply spared),
  `setsDecided` (int, §F2 (3); omitted until §E ships). `adopted: false / already-in-plan` writes nothing.
- **Retirement:** when Part 2 N's outcome fields exist, they become the one record and this event is deleted
  (§18c), not kept beside it.

### 3.11 Finalized
- **Fires:** `finalizeTrip` (`server/services/trip-finalize.service.ts:134`) and `reFinalizeIfCurrentlyFinal` (`:119`).
- **Lands:** **derived, no write.** `trip_finals` (`shared/schema.ts:9405`: `version`, `finalized_by`,
  `created_at`) plus the `plan_finalized` / `plan_reopened` diary rows (written on the NULL→now flip only).
- **Derived properties:** `version`, `isRefinal` (`version > 1`), `actor`, time since `trip_created`. An unchanged
  re-final writes no version, so it is correctly not an event.

### 3.12 Booking created
- **Fires:** `POST /api/checkout` (`server/routes/payments.routes.ts:1084`) claims the row; `promotePaidCheckout`
  (`server/services/checkout-claim.service.ts:1047`) promotes it.
- **Lands:** **derived, no write.** `service_bookings` (`trip_id`, `created_at`, `status`, `total_amount`,
  `platform_fee`) and the `checkout_payment_confirmed` / `checkout_deposit_paid` diary rows (actor `webhook |
  traveler | reconciliation`). "Created" for the funnel means **paid** (the diary row), not claimed: a
  `payment_pending` claim that the TTL sweep voids (`checkout_claim_expired`) is an abandoned checkout, a separate
  derived step. Traveler service fee: `fee_ledger` `traveler_service_fee` (or its waiver).
- Part 5 notes production `service_bookings` holds zero rows; this read starts empty and says so.

### 3.13 Booking cancelled
- **Fires:** `POST /api/bookings/:id/cancel` (`server/routes.ts:8138`); also the provider/admin rails and the
  all-undelivered parent cancel (LD 50).
- **Lands:** status and money are **derived** (`service_bookings.status = 'cancelled'`, `cancelled_at`,
  `cancellation_reason`; `refunds` rows; `fee_ledger` reversals; the item revert diary row). **Who cancelled is
  written**, because no column holds it: `funnel_events`, `slip_booking_cancelled`.
- **Properties (written):** `bookingId`, `cancelActor` (`traveler | provider | admin | system_all_undelivered`),
  `refundPercent` (from the quote the rail already computed; omitted when it computed none). Amounts stay on
  `refunds`, never copied.
- **Emitter:** server, one per rail, after the atomic flip wins; a 409 writes nothing.

---

## 4. Summary

| # | Event | Fires at | Built? | Lands in | Derived / written | Emitter |
|---|---|---|---|---|---|---|
| 1 | plan created | `POST /api/trips` (`routes.ts:1509`) | yes (no door) | `funnel_events` `trip_created` T2 | written (exists; add props) | server (door client-supplied) |
| 2 | anchor set opened | option-set create | NOT BUILT | `plan_option_sets` | derived | — |
| 3 | option added | option add | NOT BUILT | `funnel_events` `slip_option_added` | written | server |
| 4 | plan-fit shown | compare view render | WRITTEN (A4) | `funnel_events` `slip_plan_fit_shown` | written | client (value server-recomputed) |
| 5 | option chosen | choose claim | NOT BUILT | `plan_option_sets` | derived | — |
| 6 | free draft run | `content.routes.ts:4782` | yes | `funnel_events` `slip_free_draft_run` | written | server |
| 7a | gap shown | completeness render | NOT BUILT | `funnel_events` `slip_gap_shown` | written | client |
| 7b | gap filled | item / option lands | NOT BUILT | items + sets + `plan_gap_dismissals` | derived | — |
| 8a | suggestion shown | engine rank | partial | `upsell_impressions` | written (exists) | server |
| 8b | suggestion added | add with impression id | column unwritten | `upsell_impressions.added` | written (existing column) | server |
| 9 | run purchased | run authorization | yes | `fee_ledger` `optimizer_run` | derived | — |
| 10 | version adopted | apply-to-trip / adopt-stop | yes (no trace) | `funnel_events` `slip_version_adopted` | written | server |
| 11 | finalized | `finalizeTrip` | yes | `trip_finals` + diary | derived | — |
| 12 | booking created | checkout promotion | yes | `service_bookings` + diary | derived | — |
| 13 | booking cancelled | cancel rails | yes (no actor) | `service_bookings`/`refunds` + `funnel_events` `slip_booking_cancelled` | derived + actor written | server |

---

## 5. Proposed schema delta — sketch, needs ratification

**Zero new tables. Zero new columns.** One index-only migration on `funnel_events`, and its declaration:

```
funnel_events  (existing table, migration 089)
  DECLARE in shared/schema.ts the five indexes 089 creates (user_idx, type_idx, stage_idx,
    created_idx, stage_time_idx) — undeclared today, so the deploy push drops them.
  ADD  idx_funnel_events_trip_created ON (trip_id, created_at) WHERE trip_id IS NOT NULL
  NO UNIQUE index (dedupe is at read time); NO CHECK; NO DEFAULT change.
```

- Every statement is `CREATE INDEX IF NOT EXISTS` on an existing table with no UNIQUE, so a publish prompt offering
  it is approvable under §20's born-object carve-out (`2026-09-25-publish-prompt-new-objects`), and declining is
  safe.
- **The client rail** (no schema): `POST /api/trips/:tripId/slip-events`, `isAuthenticated`, READ access through
  `authorizeTripLogistics(tripId, userId, route)` (`server/utils/trip-logistics-auth.ts:36`) plus the EA delegate
  arm; every refusal is one 404 (LD 40). Body: `.strict()` discriminated union of exactly
  `slip_plan_fit_shown | slip_gap_shown`, each a `.pick()` of its §3 properties plus `viewId`. Answers 202 before
  writing; a write failure is logged, never returned. A per-(user, trip) rate cap (config, not a literal) bounds
  table growth.
- **Mint body** (no schema): optional `entry: { door, occasionSource }`, `.strict()` pick, event-only (3.1).
- **Owed by other parts, named here:** M's anchor marker on `plan_option_sets` (3.2) and `chosen_via` (3.5);
  N's run record (3.9, 3.10). Not proposed by this part.

---

## 6. What this answers for the ten-traveler slice (no dashboards)

Each is one SQL read over the rows above, run by hand for ten plans:

1. **Entry:** which door each plan came from, and whether the occasion was pre-filled, asked or never set.
2. **Anchor uptake:** did each traveler open a hotel set; how many hotels (1, 2, 3); from which sources
   (listing / saved place / affiliate / custom / engine).
3. **Does plan-fit decide?** For each chosen hotel: was it the top-fit option when last shown; was the fit
   `matrix` or `est.`; did travelers see fit on a narrow screen.
4. **Draft:** how many plans ran the free draft; around a chosen anchor, an open set, or neither; how many were
   refused because the plan was not empty.
5. **Completeness:** gaps shown per plan; filled, dismissed or left open; filled from a suggestion or elsewhere.
6. **Suggestions:** per slip render, how many shown and how many added (after the cutover date only).
7. **Paid run:** how many plans bought a run, on which basis (paid / Trip Pass / free re-run); what fraction then
   adopted a version, whole or in part, and how many items survived.
8. **Commit:** finalized plans and versions; bookings paid per plan; cancellations and who cancelled.
9. **Time between steps:** mint → anchor set → choose → draft → run → adopt → finalize → first booking, per plan.
10. **Drop-off:** the last event each plan reached.

Every count states its start date (the writer's ship date, §13), and plans deleted during the study are counted
as in §7 Q4.

---

## 7. Open questions (each with a proposed default)

1. **Stage for new events.** `SLIP` vs mapping into T3/T6. *Default:* `SLIP`; the T-stages describe a different
   funnel and a mapped label would be false.
2. **Where the door comes from.** A door enum on `PlanningSource` plus an event-only `entry` on the mint body.
   *Default:* yes; any door not in the list sends nothing and the property is omitted.
3. **Option removal.** Write `slip_option_added`, or amend §E2 so `plan_options` soft-deletes (`removed_at`) and
   derive. *Default:* amend §E2 (one truth); write the event only if that amendment is refused.
4. **Deleted plans.** `trips` delete CASCADEs sets, options, finals and diary rows; `funnel_events` rows survive.
   *Default:* add one `slip_plan_deleted` event at the delete rail so a survivor row is never read as drop-off.
5. **Advisor and delegate views.** Count views by an expert or EA? *Default:* record them with `viewerRole` and
   report traveler views only; a `pending` advisor's views are recorded (it may read).
6. **Retention — RULED (decision-maker, Sep 28, 2026; ledger `2026-09-28-analytics-retention`; one rule for
   `funnel_events` and `optimizer_runs`, Part 2 §N).** Rows are **never deleted for retention**, and there is **no
   time-based purge** on either table (the 24-month default is withdrawn). On **account deletion**: `user_id` is
   nulled on both tables; any snapshot field that carries traveler-typed text is redacted; structured fields (plan
   state ids, options, weights, metrics, outcomes) are kept. Condition 2 (actor id on every event) binds while the
   account exists; the nulling is the account deletion's own effect.
7. **Existing defects found (§1).** The share token in T7 properties, the T6 "revenue" on an unpaid request, and
   the unbounded signup `source`. *Default:* file each as its own lane; not fixed by the slice. The share token
   should be removed first, because it is a live read grant sitting in an analytics table.
8. **Suggestion cutover.** Which date starts `upsell_impressions.added` counting? *Default:* the deploy date of the
   phase-0 fix, stored in config and quoted on every count.
9. **Plan-fit value on the client event.** Take it from the client, or recompute on the server? *Default:*
   recompute on the server; never store a number the client sent.
