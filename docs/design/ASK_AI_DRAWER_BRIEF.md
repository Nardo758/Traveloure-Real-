# The "Ask AI about this plan" drawer — design brief

> Lane **L16** of the Console & AI Concierge program. Executes **CLAUDE.md Locked Decision 45 (3)**
> (ledger `2026-09-07-ask-ai-drawer-paid-task`). Brief of record for the console:
> `docs/design/CONSOLE_AND_AI_CONCIERGE_BRIEF.md` §2 and its `SlipDrawer` artboard.
>
> **Compiled 2026-09-08. Revised 2026-09-15 against main @ `319de1fd3` (ledger
> `2026-09-15-ask-ai-drawer-brief-v2`).** The first version was written before its blocker
> (migration 290) landed and before LD 41 lane 1, LD 42 D3/D17/D18 and the slip-conformance lanes
> reshaped the surfaces it sits on. Three of its load-bearing claims were **wrong against the
> code**; §1 and §2 say which, and §5 isolates what still needs a ruling. Every factual claim below
> cites a path.

## 1 · Facts on the ground (verified against `main`)

**The thread.** `conversations.trip_id` exists — additive nullable, FK `ON DELETE SET NULL`, index
declared, `.omit()`ed from the denylist insert schema and re-admitted by the pick-based
`.strict()` `conversationTripLinkSchema` (`shared/models/chat.ts`). The pairing is server-verified
against the session user by `resolveConversationTripLink`
(`server/services/conversation-trip-link.service.ts`), which answers one message for "no such trip"
and "not yours" alike. `POST /api/conversations` admits it
(`server/replit_integrations/chat/routes.ts`). **L16's blocker is gone.**

**But the thread reads nothing.** `POST /api/conversations/:id/messages` (same file) streams a
fixed "travel buddy" system prompt with **no plan context injected at all** — it never loads the
trip, the items, the events or the entitlement, even when `trip_id` is set — and writes its cost as
`sourceType: "ai_chat"` with **no `userId`**. LD 45 (3)'s "reads the plan live" is **storage only
today**; the reader is L16's to build.

**Where it mounts.** Pre-final: the slip's rail, `BuildCard` in
`client/src/components/plancard/SlipRail.tsx`, the card that already holds Browse services, the ONE
AI action, the expert control and the Trip Pass card. Post-final: `TripCardRail.tsx`, whose four
cards are Booking agent · Your expert · Suggestion · Back to planning. **L9 landed the booking agent
as a rail CARD, not a tab** — the first version of this brief called it a "second tab", which is
vocabulary from the shell L9 deleted.

**The ONE AI action rule.** `slipBuildAiAction(itemCount)` (`client/src/lib/slip-rail.ts`) returns
`draft` on an empty slip and `optimize` otherwise (LD 41 (b)). The free draft is
`POST /api/ai/generate-itinerary`, gated server-side by `decideAiDraftEligibility`
(`server/services/ai-draft-eligibility.ts` + `.pure.ts`), guarded by
`scripts/check-ai-draft-eligibility.cjs`. **The drawer must not restate that rule** — it reads it.

**The rails to reuse, never fork.**
- `saveGeneratedItinerarySnapshot` (`server/services/content-query.service.ts`) — the AI write path,
  whose rebuild delete already ANDs `itineraryItemRebuildDeletable()`.
- `trackAnthropicResponse` / `trackAICost` (`server/services/ai-cost-tracker.ts`). **`ai_cost_tracking`
  is now DECLARED in `shared/schema.ts`** — LD 44 (f) recorded it as an undeclared deploy-push
  casualty and a prerequisite of multiplying call volume through it; that prerequisite is satisfied.
- The protected set, **two forms of one class**: row-level `itineraryItemIsExpertWork`
  (`shared/itinerary-item-expert.ts`), WHERE-clause `itineraryItemNotExpertWork()` inside
  `itineraryItemRebuildDeletable()` (`server/services/itinerary-rebuild-guard.ts`). The optimizer
  baseline reads the row-level form (`server/services/optimizer-baseline.service.ts`). D3 forbids a
  **third** expression; `server/__tests__/expert-work-protected.test.ts` pins the two agreeing.

**Entitlement.** `coversAction(tripId, "ai_task")` returns **`true` unconditionally** for an active
pass (`server/services/trip-entitlement.service.ts`). **The first version of this brief said "Trip
Pass does NOT cover this today" — that is wrong about the predicate and right about the code:** the
predicate already answers, and there is **no charge site to suppress** (LD 41 (f)). Nothing calls
`coversAction(…, "ai_task")` or `consumeRevision` anywhere in `server/` or `client/`.

**The pay-gate shape to copy.** `resolveOptimizerRunAuthorization`
(`server/services/optimizer-run-authorization.ts`) — dependency-free, injected reads, discriminated
result, bases ordered **trip pass → free re-run → the payment already recorded → a freshly verified
PaymentIntent**, and `claimRequired` telling the caller it still owes a §15 atomic conditional. The
charge point is `POST /api/optimization-payments` (`server/routes/optimization.routes.ts`).

**The authorization for apply.** LD 42 **D17 has landed** (ledger `2026-09-06-optimizer-run-predicate`):
every run gate resolves `getTripWriteRole` and admits via `canMutateTrip` (`server/utils/trip-role.ts`),
whose advisor branch is `isTripAdvisorWithWriteAccess` (`accepted`/`assigned`, never `pending` —
`server/utils/trip-advisor.ts`), pinned by `server/__tests__/optimizer-run-predicate.test.ts`.
**Apply uses that predicate, never `authorizeTripLogistics`.**

**The price.** `CONCIERGE_AI_TASK_BAND = "concierge:ai_task"`, `flat_cents`, `required: true`, owner
declared as `pricing.routes`, fallback `failLoud` (`server/services/fee-band-requirements.ts`);
seeded at 299 by `server/migrations/258_plans_reconcile.sql`; read by `GET /api/pricing`
(`server/routes/pricing.routes.ts`) and rendered on `/pricing` and `how-it-works.tsx`; editable in
the admin panel since punchlist **V-6** closed. **It is display-only: no charge path reads it.**
Note the optimizer prices from a *different* home — `getFee` over `optimization_fees`
(`server/services/optimization-fee.service.ts`), complexity-tiered — so "copy the optimizer's
pattern" means its *claim/idempotency shape*, not its *fee resolver*.

## 2 · The write posture, exactly

**Every answer is a PROPOSAL staged beside the plan. Nothing the drawer produces touches
`itinerary_items` until the traveler applies.**

**THE FIRST VERSION NAMED A STORE THAT CANNOT HOLD ONE, and this is the lane's blocking question.**
It said the answer lands on "the EXISTING suggestions rail — a suggestion row with `origin='ai'`,
applied through the existing approve path". Against `main`:

- `trip_suggestions.expert_id` is **`NOT NULL`, FK → `users.id`** (`shared/schema.ts`). There is no
  author an AI proposal can honestly carry.
- `POST /api/trips/:id/suggestions` refuses anyone who is not `isExpertAssignedToTrip`
  (`server/routes/booking-actions.ts`).
- The approve path **hardcodes `origin: 'expert'`** on the item it creates (same file), which is
  exactly the false attribution LD 42 **D4** drew for `expert_note` and **D23** draws for the origin
  chip (`client/src/lib/item-origin.ts` maps `expert` → "from your expert").

So the rail is expert-shaped in its column, its gate and its output. Widening it is a **schema
question for the decision-maker** — filed as **D-19** (§5), with the two options stated there.
**Nothing in this lane may reach an AI proposal into `trip_suggestions` by sentinel author or by
stamping `origin:'expert'`.**

**What does not change whichever store wins:**

1. **Apply is the traveler's click**, authorized by `getTripWriteRole` + `canMutateTrip`
   (D17). Owner or a §12 WRITE-status advisor; a `pending` advisor never applies.
2. **The applied item is stamped `origin: 'ai'`** — server-side at create, as ruling 12 requires;
   `origin` is client-settable nowhere.
3. **Expert rows are never emitted, deleted or rewritten** (D3). The proposal builder reads the
   baseline through `optimizer-baseline.service.ts`, so expert work arrives as a *constraint*; the
   apply's delete carries `itineraryItemRebuildDeletable()`, which already spares it. **No fourth
   expression of the class.**
4. **There is no undo (D18).** Apply replaces rows in one transaction and nothing holds the previous
   set, so the drawer shows **no Undo control and promises no restore**. The safeguard is the
   review-first shape: the proposal is read in full, names what it would replace and what it
   protects, and is discardable at zero cost before any charge.

## 3 · The money posture, exactly

1. **Charged ONLY on apply, never on ask.** A question and a discarded proposal cost the traveler
   nothing. (They cost the platform a model call, which is why §4's cost line is not optional.)
2. **The actor is the session** (§14). Nothing about price, identity or rate arrives in the body.
3. **The amount is server-derived from `fee_bands`, band `concierge:ai_task`** (§8 — no literal
   anywhere). When the charge point lands, that band's `owner` entry in
   `RESOLVER_FEE_BAND_REQUIREMENTS` must be amended from `pricing.routes` to name the charge path
   too, or the deactivation warning V-5 shows an operator will describe the wrong consequence.
4. **A Trip Pass on the plan suppresses the charge**, via `coversAction(tripId, "ai_task")` — the
   server's own read, never a client assertion — recorded with the ratified provenance line
   `[trip-pass] … (covered_by:trip_pass)` and a `runBasis` on the response, exactly as
   `2026-08-29-trip-pass-provenance` and LD 41 (a) require. **No `fee_ledger` row and no `$0`
   PaymentIntent** (`fee_ledger` CHECKs `amount <> 0`).
5. **Idempotency is §15b: CLAIM → AUTHORIZE → PROMOTE.** The apply takes an **atomic conditional**
   claim on the proposal row *before* the Stripe call, then charges with an idempotency key derived
   from the proposal's identity, then promotes. A check-then-write is the bug, not the guard. A
   pass-covered apply takes **no claim and spends no PaymentIntent** (unlimited coverage, no counter
   to race — the `optimizer-run-authorization.ts` posture).
6. **What exists today, honestly:** the band, the entitlement predicate, the claim pattern and the
   verification pattern all exist and are proven elsewhere. **The charge site, the run-authorization
   predicate for a task, and the proposal row the claim would sit on do not exist at all.** L16
   builds all three.
7. **On screen:** "$N task · charged only when you apply", N from the band. Where a pass covers the
   plan, the existing "Included in your Trip Pass" treatment (`SlipRail.tsx`) applies **only once a
   charge site exists to be suppressed** — until then the drawer says nothing about coverage rather
   than claiming a waiver of a fee nobody charges (§13).

## 4 · Honesty rules (§13)

- **Never invented:** availability, price, opening hours, policy. A missing figure is `null` **with
  the reason said out loud**, never zero-filled and never a plausible-looking guess.
- **Never "booked".** The drawer plans; it purchases nothing. LD 44 (e) keeps `purchased_by_*` and
  `confirmed` as different facts, and the drawer may claim neither.
- **Never an engine name.** LD 41 (c): a cheaper model tier is a **cost decision**, env-configurable,
  and **no surface may describe the output by which engine produced it**. This brief names tiers only
  in that sense.
- **On an empty plan the drawer defers.** `slipBuildAiAction` already answers `draft` there; the
  drawer says the free draft is what an empty plan wants and links to it (LD 41 (b)) — it never
  offers a paid task to build a plan from nothing, and never becomes a second free rail.
- **To a `pending` advisor: read-only.** They may read the plan and the thread; ask and apply are
  refused by the same predicate every other item write uses (D17/§12), and the drawer says so rather
  than rendering a control the server will refuse.
- **Attribution.** The proposal is the AI's. It renders in the `ai` treatment (`item-origin.ts`),
  never the expert's (D4/D23), and the applied row carries `origin:'ai'`.
- **A question the plan cannot answer is answered with that fact.**

## 5 · Build sequence — what needs a ruling, what is buildable now

**Needs a ruling before any code (each filed as a punch-list §1 decision row):**

- **D-19 — where does an AI proposal live?** `trip_suggestions` cannot hold one (§2). Option (a):
  widen it — nullable `expert_id` plus an explicit author/origin column the approve path *derives*
  instead of hardcoding `'expert'`. Option (b): a new `plan_proposals` child table of `trips`, on the
  `dmo_extracted_places`/`service_route_points` pattern (CASCADE, ordered, additive-nullable, **no DB
  CHECK**), leaving the expert rail untouched. Either is schema, so neither is a lane's to take.
- **D-20 — one flat price, or tiered?** `concierge:ai_task` is `flat_cents`; the optimizer prices by
  complexity tier and event type from a different table. Recommendation: flat, from the band.
- **D-21 — is `ai_task` consumed per ASK or per APPLY, and what is one "task"?** LD 45 (3) says
  charged on apply; it does not say whether re-applying a second proposal from the same question
  charges again. Recommendation: **per distinct proposal applied**, idempotent on the proposal id.

**Buildable now on ratified ground, in order, once D-19 lands:**

1. **The plan reader.** A server-side context builder over the trip, its items (through the existing
   baseline read) and its events — and the conversation bound to the plan by `trip_id`. Writes
   `ai_cost_tracking` through `trackAnthropicResponse`, carrying a `userId` (the existing chat rail
   does not, which is its own small honesty gap).
2. **The proposal writer** into D-19's store, reading the protected set, emitting nothing over
   expert work.
3. **The task authorization predicate**, on the `resolveOptimizerRunAuthorization` shape:
   dependency-free, injected reads, discriminated result, pass-first ordering.
4. **The charge point and the apply**, §15b claim-first, apply through `canMutateTrip`, item stamped
   `origin:'ai'`.
5. **The drawer**, mounted once in `BuildCard` and once in `TripCardRail`, one thread per plan.

**Architectural recommendation, not a ruling (no schema, no money):** the drawer gets its **own task
endpoint**, not `POST /api/conversations/:id/messages`. That route is the informational buddy chat;
making it plan-aware and chargeable would make one endpoint two products with two gates.
The `conversations` row stays the **thread of record**, bound by `trip_id`.

## 6 · Negative space — what this brief deliberately does not decide

The three rulings in §5. The booking-agent card (**L17**, LD 44 phase 0). Any change to the free
draft or to Optimize — LD 41 settled both, and this lane touches neither. Any charge site for
`expert_revision` (LD 41 (f)'s other half, owned by the memberships lane). Any pre-apply snapshot or
undo (D18 refuses one; this brief does not reopen it). Any new AI write path: the drawer proposes,
the traveler applies. Whether `optimization_fees` and `fee_bands` should be one fee home — a real
question, older than this lane, and not L16's to answer.

## 7 · What "done" looks like

A traveler asks a question on their own plan; the answer arrives as a proposal naming what it would
replace and what it protects; discarding costs nothing and leaves no row; applying charges exactly
once under a double-click, or not at all under a Trip Pass with the provenance line recorded, and
lands the item stamped `origin:'ai'` through a path a `pending` advisor cannot reach. Expert items
and booked rows are still there afterwards, and nothing on screen claims an undo that no code path
can perform.
