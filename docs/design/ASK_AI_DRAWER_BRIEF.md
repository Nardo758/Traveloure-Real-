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
>
> **REVISED AGAIN 2026-09-15 (later) against main @ `2507fe63c` (ledger
> `2026-09-15-l16-ask-ai-drawer-brief`).** All three rulings v2 isolated — **D-19, D-20 and D-21** —
> were answered and **BUILT** the same day (migrations 299 and 300). So the lane is now HALF
> LANDED: the store, the discard, the charge point, the apply authorization and the apply itself
> are on `main`. **What is missing is the two ends — the CREATE rail (the proposal writer on the AI
> rail) and the drawer UI** — and this revision specifies both. New sections **§4** (the create
> rail's contract) and **§5** (the drawer) are additive; **§1, §2, §3, §6 and §7** carry dated
> corrections where the code moved under them; **six new decision rows, D-45..D-50**, replace the
> three v2 filed. Nothing in this revision changes an amount, a rate, a band, an idempotency key, a
> claim or an entitlement.

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
(`server/routes/pricing.routes.ts:78`, as `aiTaskCents`) and rendered on `/pricing` and
`how-it-works.tsx`; editable in the admin panel since punchlist **V-6** closed. ~~**It is
display-only: no charge path reads it.**~~ **CORRECTED 2026-09-15 (later): a charge path reads it
now** — `resolveAiTaskChargeCents` (`server/services/proposal-charge.service.ts:95`) resolves it
through the same fail-loud `requireFlatCentsBand`, with no literal and no fallback (§8), and the
band's `owner` entry was amended so V-5's deactivation warning names the charge path. **The pricing
bundle stays the DRAWER's read** — the client takes the number from `GET /api/pricing` and never
carries a literal.
Note the optimizer prices from a *different* home — `getFee` over `optimization_fees`
(`server/services/optimization-fee.service.ts`), complexity-tiered — so "copy the optimizer's
pattern" means its *claim/idempotency shape*, not its *fee resolver*.

### 1.1 · BUILT versus MISSING, as of `2507fe63c` (added by the 2026-09-15 later revision)

**BUILT — the whole middle of the lane.**

| Piece | Where | Ruling |
|---|---|---|
| The store: `plan_proposals`, child of `trips`, CASCADE, index, **no UNIQUE and no `position`** (a LOG, not an ordered list) | migration **299**; declared `shared/schema.ts:338` | D-19 = (b) |
| The vocabulary, stated ONCE: `proposed\|applied\|discarded` (`:35`), `PlanProposalChangeSet` (`:107`), `trip_pass\|paid` (`:146`), the key `ai-apply-<proposalId>` (`:177`) | `shared/plan-proposals.ts` | D-19, D-21 |
| The admission schema is a **PICK**, `.strict()` — every lifecycle and money column unreachable by construction; no `createInsertSchema` denylist exists for a body to parse against | `shared/schema.ts:431` | §19 |
| Writer / reader / atomic-conditional discard | `server/services/plan-proposals.service.ts:68 / :100 / :138` | D-19 |
| `GET …/proposals`, `POST …/discard`, `POST …/pay`, `POST …/apply` — all four on the SAME `authorizeTripLogistics(..., { requireWriteAccess: true })` gate | `server/routes/trips.routes.ts:3457 / :3495 / :3546 / :3632` | D-17, D-19, D-20/D-21 |
| The flat band read, the §15b claim before the Stripe call, the LD 43 (c) wallet intent, the Stripe verify, the one-transaction apply, the best-effort ledger | `server/services/proposal-charge.service.ts:95 / :116 / :174 / :211 / :296 / :439` | D-20 = A, D-21 = A |
| The ONE pure apply predicate — no `db`, no `storage`, no Stripe import; pass FIRST | `server/services/proposal-apply-authorization.ts:123` | LD 41 (a) |
| The charge columns, additive-nullable, no CHECK, no default, **absent from the pick** | migration **300**; `shared/schema.ts` | D-20/D-21, §19a |
| D3 protection in TWO layers — `itineraryItemIsExpertWork` + `itineraryItemIsMoneyCommitted` at read, `itineraryItemRebuildDeletable()` ANDed into the delete; a protected `replaces` is **REFUSED with the reason**, never skipped | `proposal-charge.service.ts:296` | LD 42 D3 |

**MISSING — the two ends.**

**(a) THE CREATE RAIL.** `createPlanProposal` has **no caller outside tests**. Nothing on the
platform turns a traveler's question into a proposal row. The store and its charge point landed
ahead of their one consumer, deliberately and unreachably — and that is **not** the §18c case
(§18c is a reachable endpoint with a state-bearing effect and no consumer; this has no route, no
effect and no client path). **§4 below is its contract.**

**(b) THE DRAWER.** No "Ask AI" affordance exists anywhere in `client/` — grepped. **§5 below is
its specification.**

**(c) Four things the two ends need that nobody has ruled**, each a decision row in §7:
a throttle for free asks (`checkMessageRateLimit`, `server/infrastructure/message-rate-limiter.ts:128`,
**requires a `recipientId`** an AI ask does not have — **D-46**); a model tier and a cost-row
`sourceType`/`userId` for a PAID task (`resolveAiDraftModel` is the FREE draft's knob and its own
header forbids the optimizer reading it — **D-47**); a coverage read a non-owner may use
(`GET /api/trips/:tripId/trip-pass`, `server/routes/trip-pass.routes.ts:47`, is **owner-only and
403s an advisor** — **D-48**); and re-finalize on a finalized plan (`applyPlanProposal` does **not**
call `reFinalizeIfCurrentlyFinal`, `server/services/trip-finalize.service.ts:119`, which the
expert-suggestion accept path DOES — **D-49**).

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

> **ANSWERED 2026-09-15 — option (b), and the store LANDED the same day** (decision-maker ruling;
> ledger `2026-09-15-d19-plan-proposals`; **migration 299**). An AI proposal lives in
> **`plan_proposals`**, a new child table of `trips` — CASCADE, additive, **no DB CHECK and no
> default on `status`**, table and index declared in `shared/schema.ts`, and **no `position` and no
> UNIQUE: it is a LOG, not an ordered list**. The expert rail is untouched exactly as this section
> requires. What landed: the table, `shared/plan-proposals.ts` (the status set and the
> `PlanProposalChangeSet` type for the jsonb), one service
> (`server/services/plan-proposals.service.ts` — create / list / an **atomic-conditional** discard),
> and read+discard routes. What deliberately did NOT land, because D-20/D-21 own it: **the apply and
> the charge**, and therefore any payment/claim column at all. `applied_at` / `applied_item_ids`
> exist, are unwritten, and are **not in the pick-based admission schema**, so the apply cannot be
> wired without going through those rulings.
>
> **AND THE APPLY AND THE CHARGE LANDED TOO, later the same day** (decision-maker rulings, punchlist
> **D-20 = A** and **D-21 = A**; ledger `2026-09-15-d20-d21-proposal-charge`; **migration 300**).
> The price is **FLAT from `fee_bands`**, band `concierge:ai_task`, through the fail-loud resolver —
> no literal and no fallback; `optimization_fees` is untouched. The unit of charge is **ONE
> PROPOSAL APPLIED**, so the §15b claim sits on the proposal row and the Stripe idempotency key is
> derived from the proposal id alone. Four additive-nullable columns (`charge_claimed_at`,
> `stripe_payment_intent_id`, `charged_amount_cents`, `charge_basis`), no CHECK, no default, **none
> in the pick**. A Trip-Pass-covered apply takes no claim, creates no PaymentIntent, records
> `charge_basis='trip_pass'` with `charged_amount_cents` NULL and writes **no ledger row**.
> **So §2's "whichever store wins" list is no longer hypothetical — every clause of it is now
> enforced in code**, and the only thing left on this rail is the WRITER that fills it (§4).

**What does not change whichever store wins:**

1. **Apply is the traveler's click**, authorized by the owner-or-§12-WRITE-advisor predicate
   (D17). Owner or a §12 WRITE-status advisor; a `pending` advisor never applies.
   **CORRECTION recorded by the D-19 lane, and it matters for whichever rail applies:** this line
   originally named `getTripWriteRole` + `canMutateTrip`, and that resolver finds an OWNER only
   through a `trip_collaborators` row — a plan whose owner has none resolves `null` and is refused.
   The D-19 routes therefore use `authorizeTripLogistics(..., { requireWriteAccess: true })`, the
   same shared gate the itinerary REORDER mutation rail uses, which resolves the owner through
   `verifyTripOwnership`. Both narrow the advisor branch to `accepted`/`assigned`; they differ only
   in how they find the owner. Reconciling the two resolvers is its own lane, not this one's.
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
6. ~~**What exists today, honestly:** … **The charge site, the run-authorization predicate for a
   task, and the proposal row the claim would sit on do not exist at all.** L16 builds all three.~~
   **CORRECTED 2026-09-15 (later): all three now EXIST and are on `main`** — the proposal row
   (migration 299), the charge site (`proposal-charge.service.ts` + `POST …/pay` and `POST …/apply`)
   and the pure task predicate (`proposal-apply-authorization.ts:123`). Every numbered clause 1–5
   above is enforced by them today. **What L16 still builds is the CREATE rail (§4) and the drawer
   (§5)**, neither of which touches money.
7. **On screen:** "task · charged only when you apply", the number read from `GET /api/pricing`'s
   `aiTaskCents` — **never a literal in the client** (§8), and no number shown at all while that
   read has not answered. Where a pass covers the plan, the existing "Included in your Trip Pass"
   treatment (`SlipRail.tsx`) applies — **the charge site it suppresses now exists**, so the
   caveat this clause carried is discharged. It renders **only on a SERVER answer**
   (`coversAction`): an unread, failed or forbidden coverage read is *"we have no answer"*, which
   is neither "covered" nor "not covered", and **neither claim is made** (§13; the
   `shouldOfferSavePayment` posture, LD 43 (d)). **Whether a non-owner can obtain that answer at
   all is D-48.**

## 4 · The CREATE rail (added 2026-09-15 — the half of L16 that has no code at all)

### 4.1 · Contract

```
POST /api/trips/:tripId/proposals          (the ONE new rail this brief specifies)

  gate     authorizeTripLogistics(tripId, session, ..., { requireWriteAccess: true })
           — the SAME shared predicate the four landed proposal routes run, and the same
             one the itinerary REORDER mutation rail uses. One predicate, one more caller
             (§18 rule 1; LD 42 D17 — never the read-shaped tier that grants `pending`).
             No new gate is invented, and §2's recorded caveat stands: reconciling
             `authorizeTripLogistics` with `getTripWriteRole`/`canMutateTrip` is its own
             lane, not this one's.

  body     { question: string }            — a .strict() PICK-based allowlist (§19).
           NOTHING ELSE. Not a model, not a tier, not a proposal, not a conversation id,
           not a trip id (it is the path's), not an item id list, not a price.

  reads    the plan LIVE — the trip row, `itinerary_items`, events, stops — at ask time,
           never from a snapshot the client supplied. This is LD 32's own rule for the
           expert workspace ("slip content is NEVER copied into the jsonb — the workspace
           reads the trip LIVE"), applied to the machine reader.

  writes   EXACTLY ONE `plan_proposals` row, through `createPlanProposal` and nothing
           else. Never an `itinerary_items` row. Never a `trip_suggestions` row.

  returns  the row (`status: 'proposed'`), so the drawer renders what was staged.
```

**The output is ONE row, never a direct item write.** That is the whole of LD 45's proposal rule and
it is what keeps the drawer from becoming the fourth AI write path. The writer produces a
`PlanProposalChangeSet` — `additions`, `replaces`, `notes`, `protectedNote` — and nothing it
produces touches the plan until `POST …/apply` is called and paid for.

**IT IS ITS OWN ENDPOINT, AND THAT IS v2'S ARCHITECTURAL RECOMMENDATION, PRESERVED VERBATIM**
(it was filed in v2 §5 as "not a ruling — no schema, no money", and it is restated here because it
is now a clause of the contract): *"the drawer gets its **own task endpoint**, not
`POST /api/conversations/:id/messages`. That route is the informational buddy chat; making it
plan-aware and chargeable would make one endpoint two products with two gates. The `conversations`
row stays the **thread of record**, bound by `trip_id`."* Whether a `conversations` row is minted
at all for an L16 ask is **D-45**; this clause holds either way.

**It cannot become a second free-draft rail.** `scripts/check-ai-draft-eligibility.cjs` fires on a
file that calls `saveGeneratedItinerarySnapshot(` or performs a rebuild delete via
`itineraryItemRebuildDeletable(`. The create rail does **neither** — it writes one jsonb row — so
the guard's predicate does not reach it, and that is correct rather than a gap: LD 41 (b) governs
the *free rebuild of a plan*, and this rail rebuilds nothing. **The drawer's own deference rule
(§6) is what keeps LD 41 (b) honest on an empty plan**, and it is unchanged by this section: on an
empty slip the drawer points at the free draft and never offers a paid task to build a plan from
nothing.

### 4.2 · Expert work is protected at PROPOSE time, not only at APPLY time

The apply already refuses a `replaces` naming protected work (`proposal-charge.service.ts:296`, D3).
That is the backstop and it stays. **The create rail must not produce such a proposal in the first
place**, and the reason is §13 rather than safety: a traveler who reads *"I'd swap your expert's
restaurant for this one"*, pays, and is then refused has been shown a plan the platform was never
going to make.

So the writer:

1. resolves the protected set through the **ONE existing predicate** — `itineraryItemIsExpertWork`
   (`shared/itinerary-item-expert.ts:32`) plus `itineraryItemIsMoneyCommitted`, the same expressions
   `optimizer-baseline.service.ts` and the apply already call. **A second "is this expert work?"
   test written beside them is the derivation-drift class §18 rule 1 names** — and D3 already
   forbids a *third* expression of the class, which `server/__tests__/expert-work-protected.test.ts`
   pins;
2. passes those rows to the model as **CONSTRAINTS** — present, described, not replaceable — which
   is the posture the optimizer baseline already takes;
3. filters any `replaces` entry naming one out of the change set **before the row is written**; and
4. **says so on the row.** `protectedNote` is where the proposal states, in the words shown on
   screen, what it will not touch. §13: an absent `protectedNote` means *nothing was claimed*, which
   is **not** *nothing is protected* — the drawer says the former and never the latter.

**The AI never writes `expert_note`, and no proposal field maps to it.** `PlanProposalChangeSet` has
no such field and the apply's insert sets none. LD 42 **D4** is about authorship, and an AI answer
wearing the expert's treatment is the same lie from the other direction (D23).

### 4.3 · Cost tracking

Every model call the create rail makes writes `ai_cost_tracking` through the **EXISTING**
`trackAnthropicResponse` (`server/services/ai-cost-tracker.ts:64`) — LD 41 (c)'s *"the primary
generate path MUST write `ai_cost_tracking`"*, applied to the rail that will carry the most call
volume on the platform. **The table IS declared in `shared/schema.ts:8543`**, so LD 44 (f)'s stated
prerequisite is satisfied and is not a blocker.

The three parameters are **D-47**. The recommendation there: `sourceType: "ai_task"` (the field's
type is open and the table has no CHECK), `userId` = **the ASKER from the session**, and
`requestId` = **the proposal id** — the link back to the plan with no new column on a table CLAUDE.md
already names as a deploy-push casualty. **A failed ask that still burned tokens writes the row
too**; an untracked spend is the thing the table exists to prevent.

**The model tier is a COST decision and never a product claim** (LD 41 (c)).
`plan_proposals.model_tier` exists and is picked, so the row can record it, and **no surface may
read it** — the service header already says so. That rule binds in both directions: no "lite" badge
and no degraded-quality disclaimer.

### 4.4 · Idempotency and throttle of CREATE

A double-submit must not produce two proposals and must not make two model calls. **The model call
is the expensive half** — the row is cheap and discardable, the tokens are not. There is no column,
index or marker today that would make a create idempotent, and the only user-keyed limiter,
`checkMessageRateLimit`, **requires a `recipientId`** an AI ask does not have; passing a fabricated
one would be an invented identity on an identity key, the class §14 refuses one table over. Both
halves are **D-46**, because they are the same mechanism.

**What must hold whatever is ruled:** a retry may not double-charge (it cannot — asking is free), a
retry may not orphan a row (the create writes one row in one statement), a rejected duplicate is
answered with the EXISTING proposal rather than a 500, and **a model call that fails leaves NO
row** — a half-written proposal would sit in the log as something the AI said (§13).

## 5 · The drawer (added 2026-09-15)

### 5.1 · Where it mounts

**Pre-final: the slip's rail**, `BuildCard`'s neighbour in
`client/src/components/plancard/SlipRail.tsx` — a rail CARD of its own, **not a third branch of
`slipBuildAiAction`**, whose two-way answer (`draft` on an empty slip, `optimize` otherwise) is
unchanged and must not be restated (§18 rule 1).

**Post-final: `TripCardRail.tsx`**, beside Booking agent · Your expert · Suggestion · Back to
planning. This is the same two-surface posture `ExpertSuggestionsPanel` already takes
(`client/src/components/plancard/ExpertSuggestionsPanel.tsx:32` — *"pre-final it renders on the
SLIP … post-final it renders on the Trip Card"*), which makes that component the **layout**
precedent and deliberately **not** the data one: expert suggestions are `trip_suggestions` rows,
proposals are not, and the two panels never share a renderer.

**The post-final mount is BLOCKED on D-49.** `applyPlanProposal` does not call
`reFinalizeIfCurrentlyFinal`, so applying on a finalized plan would rewrite items under a frozen
Trip Card that never advances. Until it is ruled the drawer mounts **pre-final only** — an omitted
control is honest; a control that silently rewrites a frozen snapshot is not (§13).

### 5.2 · Who sees what

| Viewer | Read the log | Ask | Discard | Pay | Apply |
|---|---|---|---|---|---|
| Owner | yes | yes | yes | yes | yes |
| §12 WRITE advisor (`accepted`/`assigned`) | yes — the server admits | **D-48** | **D-48** | **D-48** | **D-48** |
| `pending` advisor | **no** | no | no | no | no |
| Anyone else | no | no | no | no | no |

**CORRECTION to §6's "to a `pending` advisor: read-only" bullet (2026-09-15).** That bullet says a
pending advisor "may read the plan and the thread". They may read the PLAN — but **not the proposal
log**: `GET /api/trips/:tripId/proposals` runs the same `requireWriteAccess: true` gate as the
writes, deliberately, because a proposal carries the AI's reasoning about a plan and the rows it
would replace. Widening that read is a decision, not a tidy-up, and this lane does not take it.

**The advisor tension is real and is about money as well as authorship.** The four landed rails
admit a WRITE-status advisor on all five actions; LD 42 **D16** says the slip's edit controls are
the OWNER's; and the pay rail builds the PaymentIntent from `getOrCreateCustomer(<session user>)`,
so **an advisor who pays pays with their own card** — LD 44 **D19**'s prohibition on an earner
funding a traveler's purchase, arrived at from the other direction. **D-48** rules it. This brief's
recommendation: ask and read for both, **PAY and APPLY controls for the OWNER only**, with the
server narrowing `…/pay` in the same lane and `…/apply` left at the write tier so a Trip-Pass-covered
apply by an accepted advisor still works. **A render rule is never what keeps a write out** (D16's
own wording, the §14 posture) — the route's gate is — so the drawer's visibility rules are additive
to the server's and the server is not relaxed to match them.

### 5.3 · The flow

```
   ask (free, throttled)              read (free)                 apply (charged once)
        │                                 │                              │
        ▼                                 ▼                              ▼
  POST …/proposals  ──> row `proposed` ──> the drawer renders the change set IN FULL
                                             │           │
                          discard (free) ◄───┘           └──> POST …/pay  ──> sheet
                                 │                                │
                                 ▼                                ▼
                            `discarded`                   POST …/apply ──> `applied`
                        (the row STAYS — a log)      (one transaction; items written;
                                                      `applied_item_ids` recorded)
```

**REVIEW-FIRST is not optional and it is not new.** LD 42 **D18** ruled there is no undo and that
the safeguard is that the traveler sees what would change **before** the charge and **before** the
write — the same shape LD 41 (d)/(e) give the optimizer. So the change set is rendered in full —
every addition, every replacement, every note and the `protectedNote` — before any pay control is
reachable.

### 5.4 · Copy rules

Each is a §13 rule, not a preference.

- **A proposal is a proposal.** Nothing says *added*, *updated*, *saved* or *done* on the strength
  of a proposal existing. The state is **staged**, until apply.
- **Charged only on apply.** The ask control says asking is free; the apply control states the
  price, read from `GET /api/pricing`'s `aiTaskCents`. **No literal anywhere in the client** (§8),
  and no number at all while that read has not answered.
- **No undo is offered, ever.** After an apply the drawer reports what the apply created
  (`applied_item_ids`, read as the record it is) and offers no reverse, because no code path can
  perform one (D18).
- **The engine is never named** (LD 41 (c)) — no model name, no tier badge, no "lite", and equally
  no degraded-quality disclaimer.
- **Protected work is stated, not implied.** Present `protectedNote` renders verbatim; absent, the
  drawer says nothing — never "nothing is protected".
- **An empty log is not an empty answer.** A plan with no proposals has never been asked anything;
  the drawer says that and never "the AI had nothing to say" (the service's own §13 note).
- **A discarded proposal stays visible**, marked discarded. Filtering it out would make the log a
  claim rather than a record.
- **An empty change set is a real answer.** A question the plan's own contents answer may produce
  no additions and no replacements — a proposal with nothing to apply, for which **no pay control
  renders**: charging for an apply that would write nothing is a charge for nothing.
- **A price the source did not state is omitted, never `$0`.**
- **A day the proposal did not name is not the AI's answer.** The apply places an unplaced addition
  on day 1 because `itinerary_items.day_number` is NOT NULL; the drawer says that is a placement the
  traveler can move, never that the AI scheduled it.

## 6 · Honesty rules (§13)

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
- **To a `pending` advisor: read-only** ~~they may read the plan and the thread~~ — **CORRECTED
  2026-09-15 (later), see §5.2: they may read the PLAN but NOT the proposal log.** The landed
  `GET /api/trips/:tripId/proposals` runs the same `requireWriteAccess: true` gate as the writes,
  deliberately, because a proposal carries the AI's reasoning and the rows it would replace. Ask and
  apply are refused by the same predicate every other item write uses (D17/§12), and the drawer
  renders nothing for them rather than a control the server will refuse.
- **Attribution.** The proposal is the AI's. It renders in the `ai` treatment (`item-origin.ts`),
  never the expert's (D4/D23), and the applied row carries `origin:'ai'`.
- **A question the plan cannot answer is answered with that fact.**

## 7 · Build sequence — what needs a ruling, what is buildable now

**REWRITTEN 2026-09-15 (later).** The three rows this section filed — **D-19, D-20, D-21** — are all
**ANSWERED and BUILT**; their text is preserved below the new list so the record of what was asked
survives. **Six new rows, D-45..D-50, replace them**, and four of the six block the create rail.

### 7.1 · Needs a ruling before any code (punch-list §1 rows D-45..D-50)

- **D-45 — is the drawer a THREAD, or a stateless ask over the proposal log?**
  `plan_proposals.conversation_id` exists (migration 299, nullable, ON DELETE SET NULL) and
  `conversations.trip_id` exists (L15, migration 290), so a thread is possible. But the conversation
  rail is structurally human↔human — `buildConversationId` concatenates two `users.id` (LD 40) —
  which is the same open question **LD 44** records for the booking copilot.
  *Recommend:* **stateless for L16.** The `question` column plus the proposal log **is** the thread;
  `conversation_id` stays NULL and the drawer says so (§13). Binding to `conversations` is a later
  lane needing the answer LD 44's seventh open question needs. **Whichever wins, the AI's words are
  attributed to the AI** — the line D4 drew for `expert_note`. *(This supersedes §5's earlier
  architectural recommendation only in ORDER, not in substance: the drawer still gets its own task
  endpoint and never `POST /api/conversations/:id/messages`.)*

- **D-46 — what throttles a free ask, and is CREATE idempotent?** Asking is free by ruling (D-21 = A)
  and the expensive half is the model call. `checkMessageRateLimit`
  (`server/infrastructure/message-rate-limiter.ts:128`) is the only user-keyed limiter and it
  **requires a `recipientId`**; a fabricated one would be an invented identity on an identity key.
  *Recommend:* **one more NAMED limit in that SAME fixed-window module** — `checkAiAskRateLimit`,
  keyed on `senderId + tripId`, sharing the existing store, cleanup and loopback bypass — **never a
  second limiter implementation** (§18 rule 1) and **never a fake recipient**. For idempotency, an
  **in-flight marker keyed on (tripId, session user)** that refuses a second ask while one runs and
  answers 409 naming the in-flight proposal — no schema, no column, no UNIQUE index. **Stated limit:
  the store is in-memory per process**, so a multi-instance deployment throttles per instance; that
  is the limit the messaging limiter already states for itself, and closing it is a shared-store
  lane.

- **D-47 — what model tier does a PAID task run on, and what three values does its
  `ai_cost_tracking` row carry?** `resolveAiDraftModel` (`server/services/ai-draft-model.ts:41`) is
  the FREE draft's cost knob and its own header forbids the optimizer reading it. The
  `sourceType`/`userId` half is the question **LD 44** left open for the copilot, asked here first.
  *Recommend:* a sibling `ai-task-model.ts` with its own env knob (`AI_TASK_MODEL`) defaulting to
  the optimizer's Sonnet-class tier — the traveler pays for this one, so the free lane's knob must
  not reach it (LD 41 (c)). Cost row: `sourceType: "ai_task"`, `userId` = **the ASKER from the
  session** (spend attributed to whoever caused it, never to the plan's owner, which would
  misattribute an advisor's asks), `requestId` = **the proposal id**.

- **D-48 — may a §12 WRITE advisor ASK, PAY and APPLY, and whose card is charged?** See §5.2. The
  rails admit them; D16 says the slip's edit controls are the owner's; the PaymentIntent is built
  from the **session** user's customer. And the only coverage read
  (`GET /api/trips/:tripId/trip-pass`, `server/routes/trip-pass.routes.ts:47`) is **owner-only**, so
  an advisor-viewed drawer cannot honestly say whether the plan is covered.
  *Recommend:* ask and read for both; **PAY for the OWNER only** (narrow the route in the same
  lane — LD 44 **D19** from the other direction); **APPLY left at the write tier**, since a covered
  apply moves no money. For coverage, **extend the EXISTING `GET …/proposals` response with a
  server-resolved `aiTask: { coveredByTripPass, priceCents }`** using the same `coversAction` call
  and the same band resolver behind the gate that route already runs — **no second entitlement rail
  and no second fee read** (§18 rule 1).

- **D-49 — does applying on a FINALIZED plan advance the Trip Card's version?** `applyPlanProposal`
  writes items and does **not** call `reFinalizeIfCurrentlyFinal`
  (`server/services/trip-finalize.service.ts:119`), which the expert-suggestion accept path DOES —
  precisely so an accepted change is not invisible behind a frozen snapshot (its four callers
  verified). LD 45 (3) puts the drawer post-final, so this is reachable the day it mounts there.
  *Recommend:* **yes — one more caller of the existing helper**, best-effort and AFTER the apply
  commits (§15b). **Until ruled, no post-final mount** (§5.1).

- **D-50 — what does the create rail send the model, and may a proposal name a live catalog
  listing?** `PlanProposalAddition.providerServiceId` exists and the apply writes it onto the item.
  LD 41 (c) says the FREE draft has no live catalog pricing; it says nothing about a PAID task, and
  `loadOptimizerCatalog` (`server/services/optimizer-baseline.service.ts:262`) is the existing
  reader.
  *Recommend:* **yes for a paid task, through `loadOptimizerCatalog` and no second catalog read**
  (§18 rule 1). The plan is sent as the trip row's own fields, the ordered items **with the
  protected set marked as CONSTRAINTS**, the plan's events and stops, **and nothing else** — no
  other traveler's data, no other plan, no `users` row beyond the session's own (§14's read clause).
  `estimatedCost` is filled **only** from a catalog row's real price or a source that stated one.
  *Sub-question in the same row:* a staleness window for a catalog price carried into a proposal
  applied days later — **config, never a literal**, the same answer LD 44's brief leaves open.

### 7.2 · Lanes, in order

1. **The CREATE rail** — `POST /api/trips/:tripId/proposals` plus the plan reader and the proposal
   writer (§4). Server-only, unreachable from any UI until lane 3. **Needs D-45, D-46, D-47, D-50.**
2. **The coverage/price read** — the `aiTask` block on the existing proposals GET (**D-48**). One
   route touched, no new one.
3. **The drawer, pre-final on the slip** (§5). Reuses the four landed rails and the pricing bundle.
   **Needs D-48** for the visibility table.
4. **The drawer post-final on the Trip Card.** **Blocked on D-49.**
5. **The conversation binding**, only if **D-45** rules a thread.

**Guards a builder runs and must not weaken:** `check-money-endpoints` (+ `--self-test`) — the
create rail reads no amount, price, userId or rate from a body and must stay that way;
`phase2-fee-gate.sh` — no fee literal in the rail or the drawer; `check-ai-draft-eligibility`
(+ `--self-test`) — the create rail must not acquire a `saveGeneratedItinerarySnapshot` or a rebuild
delete, which would make it a second free-draft rail; `check-decision-guards`; and the landed
`plan-proposals` / `plan-proposal-charge` / `proposal-apply-authorization` suites, green and
untouched. **No migration** unless D-46 is ruled toward a durable idempotency key.

### 7.3 · The three rows this section filed, and their answers (preserved)

- **D-19 — where does an AI proposal live? — ANSWERED (option (b)), store landed 2026-09-15**
  (ledger `2026-09-15-d19-plan-proposals`, migration 299; see the callout in §2). Original framing:
  `trip_suggestions` cannot hold one (§2). Option (a):
  widen it — nullable `expert_id` plus an explicit author/origin column the approve path *derives*
  instead of hardcoding `'expert'`. Option (b): a new `plan_proposals` child table of `trips`, on the
  `dmo_extracted_places`/`service_route_points` pattern (CASCADE, additive-nullable, **no DB
  CHECK**), leaving the expert rail untouched. Either is schema, so neither is a lane's to take.
- **D-20 — one flat price, or tiered? — ANSWERED = A (flat, from the band)**, ledger
  `2026-09-15-d20-d21-proposal-charge`. `concierge:ai_task` is `flat_cents`; the optimizer prices by
  complexity tier from a different table, and `optimization_fees` is untouched.
- **D-21 — is `ai_task` consumed per ASK or per APPLY, and what is one "task"? — ANSWERED = A:
  per distinct PROPOSAL APPLIED**, idempotent on the proposal id, same ledger row. Asking, reading
  and discarding are free.

## 8 · Negative space — what this brief deliberately does not decide

The three rulings in §5. The booking-agent card (**L17**, LD 44 phase 0). Any change to the free
draft or to Optimize — LD 41 settled both, and this lane touches neither. Any charge site for
`expert_revision` (LD 41 (f)'s other half, owned by the memberships lane). Any pre-apply snapshot or
undo (D18 refuses one; this brief does not reopen it). Any new AI write path: the drawer proposes,
the traveler applies. Whether `optimization_fees` and `fee_bands` should be one fee home — a real
question, older than this lane, and not L16's to answer.

**EXTENDED 2026-09-15 (later).** Also not decided here, and not to be taken as decided: the six rows
in §7.1 (they are questions, and the recommendations beside them are recommendations); **any change
to the landed charge point** — the price, the §15b claim, the idempotency key, the §19a single
writer, the ledger call and the covered-apply posture are all untouched by every lane above; **the
stated liveness limit on a stuck claim** (nothing releases one, so a claimed row whose PaymentIntent
exists and is never confirmed stays un-applied and un-discardable — a TTL reclaim is a later lane,
never a compensating rollback, §15b); **the resolver reconciliation** between
`authorizeTripLogistics` and `getTripWriteRole`/`canMutateTrip` that the D-19 lane recorded; and
**anything that would let an AI author an expert-attributed row** — `trip_suggestions` is untouched
by every lane above, and nothing here reads it, writes it, or mints a sentinel author on it.

## 9 · What "done" looks like

A traveler asks a question on their own plan; the answer arrives as a proposal naming what it would
replace and what it protects; discarding costs nothing and **leaves the row in the log as a record
of what was offered and refused** (corrected 2026-09-15 — D-19 ruled the row STAYS); applying charges exactly
once under a double-click, or not at all under a Trip Pass with the provenance line recorded, and
lands the item stamped `origin:'ai'` through a path a `pending` advisor cannot reach. Expert items
and booked rows are still there afterwards, and nothing on screen claims an undo that no code path
can perform.
