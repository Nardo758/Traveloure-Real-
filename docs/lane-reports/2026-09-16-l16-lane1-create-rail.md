# Lane report — L16 lane 1, the CREATE rail (pre-model)

**Ledger row:** `2026-09-16-l16-rulings-d45-d50`
**Branch:** `task-l16-lane1-create-rail`
**Base:** `origin/main` @ `2507fe63c`, plus the brief-v3 branch `task-l16-ask-ai-drawer-brief` @ `217bfb5f`
(PR #954) merged in at lane start.
**Schema:** none. No migration, no column, no CHECK, no index, no backfill.

> **THIS LANE IS DELIBERATELY UNFINISHED.** It builds everything in the create rail that is **not**
> the model call, and **STOPS** before the prompt builder and the model call by instruction. §4
> below is the exact design of that call, written out for the decision-maker to read **before** a
> line of it is written.

---

## Phase 0 — every fact lane 1 depends on, verified against the tree

Read-only pass, run before any code was written. Every line below was opened; the file:line is where
it is. **No fact contradicted a ruling's premise**, so the lane proceeded.

### 0.1 · The store and its admission schema

| Fact | Where | Verified |
|---|---|---|
| `plan_proposals` table, `id varchar PK` with `$defaultFn(() => crypto.randomUUID())` | `shared/schema.ts:336-390` | yes — the id has a **client-side default**, so an explicitly supplied id is a legal insert value (D-46 (i) needs this) |
| The ONE admission schema is **pick-based and `.strict()`** | `shared/schema.ts:431-451` | yes — picks exactly `tripId`, `conversationId`, `question`, `proposal`, `status`, `modelTier`. **`id` is NOT picked** ("the database's to say", `:409`) |
| No `createInsertSchema(planProposals).omit(...)` and no `insertPlanProposalSchema` exists | `shared/schema.ts` (pinned by `plan-proposals.db.test.ts` P5) | yes |
| The change-set type `PlanProposalChangeSet` — `additions` / `replaces` / `notes` / `protectedNote`; `PlanProposalAddition` carries `title` (required), `description`, `dayNumber`, `startTime`, `endTime`, `location`, `estimatedCost`, `providerServiceId`, `reason` | `shared/plan-proposals.ts:70-120` | yes |
| The status set, the charge bases, and the apply idempotency key are stated ONCE | `shared/plan-proposals.ts:35, :146, :177` | yes |

**CONSEQUENCE FOR D-46 (i), and it is the one place this lane touched an existing signature.**
`createPlanProposal` (`server/services/plan-proposals.service.ts:68-87`) takes
`Omit<PlanProposalCreate,"status"> & {status?}` and inserts **without** an `id`, letting the column
default fire. D-46 (i) requires the SERVER to mint the id **before** the model call and hand it in
**explicitly**. The lane added an **optional `id` as a separate typed parameter on the function**,
**not** as a new key on `planProposalCreateSchema`. That is deliberate: the pick is the §19
allowlist, `plan-proposals.db.test.ts` P5 pins that no route parses it off a body, and widening the
pick would make `id` settable the day somebody does parse it. A function parameter that only
server code can reach is not a mass-assignment surface.

### 0.2 · The rate-limit module

`server/infrastructure/message-rate-limiter.ts`, read in full.

| Fact | Where |
|---|---|
| ONE in-memory `Map<string, Entry>` store, `{count, resetTime}` | `:52-57` |
| ONE `setInterval` cleanup, 60 s, `unref()`ed so it never holds the event loop open | `:59-66` |
| ONE `hit(key, windowMs)` fixed-window counter | `:68-78` |
| The loopback-only CI bypass — `RATE_LIMIT_LOOPBACK_SKIP=1` **AND** a loopback peer, never env alone | `:85-100` |
| `checkMessageRateLimit` **requires `recipientId`** and returns `{allowed:true}` when either id is falsy | `:128-137` |
| `__resetMessageRateLimiter()` exists for suites | `:178-180` |

**The brief's premise holds:** an AI ask has no recipient, and `checkMessageRateLimit` would
short-circuit to `allowed:true` if handed an empty one — so it cannot be reused as-is, and a
fabricated recipient is what D-46 (ii) forbids. The lane therefore added a **second named export in
the SAME module**, sharing `store`, `hit`, `bypassActive`, `isLoopbackPeer`, the cleanup timer and
the reset helper. **No second limiter implementation exists** (§18 rule 1).

**D-46 (iii)'s premise verified:** `.replit:13` is `deploymentTarget = "autoscale"`, and the
module's own header (`:28-30`) already states the per-process limit for messaging. Both limits
therefore multiply by instance count; accepted for L16, filed with the trigger verbatim.

### 0.3 · Cost tracking

`server/services/ai-cost-tracker.ts`.

- `trackAnthropicResponse(response, { sourceType, userId?, requestId? })` — `:64-79`. Fire-and-forget
  (it calls `trackAICost(...).catch(...)`), and **returns early when `response.usage` is absent**
  (`:68`).
- `trackAICost` swallows its own insert error (`:51-54`) — a cost-log failure never breaks a request.
- `AICostTrackingParams.sourceType` is `… | string` (`:21`) — an open field. `"ai_task"` needs no
  schema change and the table has no CHECK.
- `ai_cost_tracking` **is** declared in `shared/schema.ts` (LD 44 (f)'s stated prerequisite is met).

**One consequence for §4 below:** because `trackAnthropicResponse` needs a `response.usage`, a call
that **throws before returning a response** has no usage to report. D-46 (i)'s "a failed ask that
burned tokens still writes an attributable cost row" is therefore only satisfiable where the SDK
surfaces usage on the error path; where it does not, the honest record is **no row**, said out loud,
rather than a fabricated token count (§13). That is written into §4's failure paths.

### 0.4 · The catalog

`loadOptimizerCatalog(destination: string | null | undefined)` —
`server/services/optimizer-baseline.service.ts:262-284`.

- Filters `status='active'` **and** `approvalStatus='approved'` (the F2 public read gate).
- Market scope: `ilike(location, '%<city>%') OR ilike(location, '%<destination>%')`, where `city` is
  `destination.split(",")[0].trim()`. A null/blank destination gets the **unscoped** set by design
  (`:263-265`), never an invented city.
- `.limit(100)`.
- **Zero matches ⇒ no catalog rows at all**, which its own header (`:255-259`) rules is honest
  emptiness and never another city's inventory (§13).

D-50's "through `loadOptimizerCatalog` ONLY" is therefore satisfiable with **no second query**: the
market filter D-50 (b) asks for at CREATE is exactly this function's own scope, so validation is
"is this id in the set this function returned for THIS trip's destination", not a new WHERE clause.

### 0.5 · `reFinalizeIfCurrentlyFinal` and its callers

`server/services/trip-finalize.service.ts:119-128`. Signature
`(tripId: string, actorId: string) => Promise<number | null>`. It reads `trips.finalized_at`, returns
`null` when the trip is not currently finalized, otherwise calls the idempotent `finalizeTrip` and
returns the new version or `null` when the fingerprint was unchanged.

**The four production callers, all the same shape** — `try { await … } catch { console.error("… (non-fatal)") }`:

| Caller | Where |
|---|---|
| suggestion approve | `server/routes/booking-actions.ts:1229-1233` |
| apply-to-trip | `server/routes/plancard.routes.ts:251-255` |
| adopt-stop | `server/routes/plancard.routes.ts:375-379` |
| affiliate confirm | `server/routes/content.routes.ts:8109-8113` |

D-49 says **match that shape**, and **log at ERROR with the proposal id and the trip id**. All four
already use `console.error`; what none of them carries is the identifiers, which is what makes this
one reconcilable.

### 0.6 · `applyPlanProposal`'s transaction boundary

`server/services/proposal-charge.service.ts:296-424`. One `db.transaction(async (tx) => …)`:
read the row → refuse unless `proposed` → resolve `replaces` → **D3 refusal with the reason** for
expert work or money-committed rows (`:325-337`, the two existing row-level predicates, one call
each) → delete ANDed with `itineraryItemRebuildDeletable()` (`:347-359`) → insert additions stamped
`origin:'ai'` server-side (`:371-397`) → **the atomic conditional flip to `applied` is the LAST
statement** (`:401-420`). A refusal rolls the whole thing back.

**So "AFTER the apply commits" (D-49) means after the `db.transaction` call returns** — outside the
transaction, never inside it, or a refinalize failure would roll back a committed, charged apply.

`applyPlanProposal` takes no actor today, so the lane added an `actorId` parameter; the route already
holds `userId` from the session (§14).

### 0.7 · The gate on the four landed routes

All four run the SAME call — `authorizeTripLogistics(tripId, userId, "<route label>", { requireWriteAccess: true })`:

| Route | Where |
|---|---|
| `GET /api/trips/:tripId/proposals` | `server/routes/trips.routes.ts:3457-3466` |
| `POST …/proposals/:id/discard` | `:3495-3502` |
| `POST …/proposals/:id/pay` | `:3546-3553` |
| `POST …/proposals/:id/apply` | `:3632-3639` |

`authorizeTripLogistics` — `server/utils/trip-logistics-auth.ts:35-71`: owner (`verifyTripOwnership`)
‖ advisor (`isTripAdvisorWithWriteAccess` under the narrowing, `isTripAdvisor` without) ‖ trip author
‖ audit-logged admin.

**AND THE D-48 NARROWING IS A ONE-LINE PREDICATE SWAP, so this lane did it.** The owner tier already
exists as a named shared predicate in the SAME module — `authorizeTripOwnerTier`
(`server/utils/trip-logistics-auth.ts:101-125`), which is *"the same principal set MINUS the
assigned-expert branch"*. The brief's condition (*"if it is a one-line predicate swap on the two
routes, do it and say so"*) is met exactly, and it is recorded here and in the ledger row. **No new
predicate was written** (§18 rule 1). Checked before swapping: the proposal routes are **not** in
`MOVED_RAILS` in `server/__tests__/one-trip-write-resolver.db.test.ts:108-160` (which pins
`requireWriteAccess: true` on the eight item-mutation rails it names), and the two existing charge
suites drive pay/apply as the **owner**, so nothing green was relying on the advisor branch of those
two routes.

### 0.8 · The protected-set predicates

- Row-level: `itineraryItemIsExpertWork(item)` — `shared/itinerary-item-expert.ts:32-35`
  (non-empty `expertNote` **or** `origin === 'expert'`).
- Money: `itineraryItemIsMoneyCommitted(row)` — `shared/itinerary-item-money.ts:52-59`
  (`routingStatus === 'purchased'` **or** a non-null `bookingId`).
- WHERE-clause form: `itineraryItemNotExpertWork()` inside `itineraryItemRebuildDeletable()`
  (`server/services/itinerary-rebuild-guard.ts`), pinned to agree with the row-level form by
  `server/__tests__/expert-work-protected.test.ts`.

**D3 forbids a THIRD expression.** The lane's change-set sanitiser therefore takes the protected id
set as an **argument** and asks no question of its own about what "expert work" is.

### 0.9 · Baseline guard state before any lane code

`check-decision-guards` OK · `check-money-endpoints` exit 0 · `phase2-fee-gate.sh` PASSED ·
`check-ai-draft-eligibility` OK (479 files, 3 exemptions — one of which is
`proposal-charge.service.ts`, exempt because it is already pay-gated) ·
`check-test-files-wired` → `test-orphan-ratchet: OK` (233 recorded orphans).

---

## 1 · What this lane BUILT

Everything in the create rail that is not the model call. Every piece is unit- or DB-proven and
wired into the EXISTING `plan-proposals` CI job (same rail, same store, same Postgres — a second
database for the other end of one table would be a job nobody reads).

| # | What | Where | Ruling |
|---|---|---|---|
| 1 | `POST /api/trips/:tripId/proposals` — same shared write-tier gate the four landed routes run; body is a `.strict()` allowlist of **exactly `{ question }`** | `server/routes/trips.routes.ts` | D-48 (ask stays at the §12 WRITE tier), §19 |
| 2 | The ask body's allowlist, with every deliberately-absent field named and reasoned | `shared/ai-ask-request.ts` (new) | §19, §14 |
| 3 | The **two named limits** — `senderId + tripId` **and** a sender-alone DAILY ceiling — as a second named export in the **ONE existing** fixed-window module, sharing its store, `hit()`, cleanup timer, loopback bypass and reset helper | `server/infrastructure/message-rate-limiter.ts` | D-46 (ii), §18 rule 1 |
| 4 | The **pre-minted id** and the **in-flight marker**, whose **409 names the in-flight proposal id**; TTL'd so a dead process cannot wedge a plan | `server/services/ai-ask-inflight.ts` (new) | D-46 (i)/(iii) |
| 5 | `createPlanProposal` takes the id **explicitly** — as a function parameter, deliberately **NOT** a new key on the §19 pick | `server/services/plan-proposals.service.ts` | D-46 (i), §19 |
| 6 | The `AI_TASK_MODEL` knob, defaulting to the OPTIMIZER's tier; read by this rail only | `server/config/ai-task-model.ts` (new) | D-47, LD 41 (c) |
| 7 | The **staleness window** — config, env-driven, with a pure predicate; a non-positive value falls back rather than expiring everything silently | `server/config/proposal-staleness.config.ts` (new) | D-50 (c), §8 |
| 8 | The apply-time **refusal with the reason** for a stale proposal **and** for a listing that is gone — ONE implementation, `assertProposalCatalogStillValid`, called from the apply transaction **and from the PAY route before the claim** | `server/services/proposal-charge.service.ts` | D-50 (b)/(c), §18 rule 1 |
| 9 | The **`aiTask: { coveredByTripPass, priceCents }`** block on the existing GET, from the SAME `coversAction` and the SAME band resolver, behind the gate that route already ran | `server/routes/trips.routes.ts` | D-48 read half, §18 rule 1, §8 |
| 10 | The **pure change-set sanitiser** — `.strict()` parse, server-side price overwrite, create-time id validation, protected-`replaces` filter — dependency-free, ready to receive the model's output | `shared/plan-proposal-changeset.ts` (new) | D-50 (a)/(b)/(d), LD 42 D3 |
| 11 | The **D-49 re-finalize call**, AFTER the transaction commits, best-effort, logging at **ERROR with the proposal id and the trip id** | `server/services/proposal-charge.service.ts` | D-49 |
| 12 | **The D-48 narrowing** — `…/pay` and `…/apply` swapped to the EXISTING `authorizeTripOwnerTier` (see §0.7: it is the one-line predicate swap the brief conditioned this on) | `server/routes/trips.routes.ts` | D-48 |

**Two things worth calling out because they are decisions, not mechanics.**

**(i) THE PAY ROUTE REFUSES A STALE OR UNAVAILABLE PROPOSAL TOO, and that is one implementation,
not a second policy.** D-50 (c) rules the APPLY refused. Refusing only there would let a traveler
pay for an apply that was already certain to be refused — money taken for nothing. So the same
`assertProposalCatalogStillValid` runs on the pay rail **before the §15b claim and before any Stripe
call**, so no claim is left behind either. A second copy of that decision is the drift class §18
rule 1 names, and here it would be a money bug: two rails disagreeing about whether an apply is
possible, with a charge taken between them.

**(ii) AN INVALID LISTING IS DROPPED AT CREATE AND REFUSED AT APPLY, and the asymmetry is the point.**
At create nobody has read the proposal yet, so dropping one addition is invisible and honest (D-50 b
says so in as many words). At apply the traveler HAS read it, so silently dropping it would change
what they agreed to after they agreed to it — the same §13 reasoning D-50 (c) uses to forbid a silent
reprice. Both refusals carry their reason and the drawer offers a re-ask.

**Proofs, both wired into the existing `plan-proposals` job in `build.yml`:**

- `server/__tests__/ai-ask-create-rail.test.ts` — **S1–S11, 11/11**, no database. The sanitiser
  (D-50 a/b/d), the protected-set filter as an ARGUMENT (LD 42 D3, with a static pin that the
  module re-derives no expert-work test), §13's empty states, the model knob (D-47 — the default is
  DERIVED from `server/itinerary-optimizer.ts`'s own constant, never restated), the staleness window
  (D-50 c), the in-flight marker (D-46 i), the §19 ask body, and a static pass over the rail for a
  second limiter, a second catalog reader, a fee literal or a reader of the free draft's knob.
- `server/__tests__/ai-ask-create-rail.db.test.ts` — **A1–A7, 7/7**, real router on a real Postgres.
  The §12 WRITE gate on ASK, §19 at the route, the honest 503 with **no row written**, the marker
  released on every path, **D-48's owner-only PAY and APPLY with an accepted advisor refused by
  both while keeping ask/read/discard**, the `aiTask` block's shape and §13 omissions, and D-49's
  post-commit LOUD re-finalize.

**Left green and untouched:** `plan-proposals.db.test.ts` 7/7, `plan-proposal-charge.db.test.ts`
7/7, `proposal-apply-authorization.test.ts` 9/9, `expert-work-protected.test.ts` 20/20,
`one-trip-write-resolver.db.test.ts` 10/10, `optimizer-run-predicate.test.ts` 14/14.

## 2 · What this lane did NOT build, and why

- **The prompt builder and the model call.** Stopped by instruction; designed in §4 below.
- **The drawer.** Lane 3.
- **The D-45 optional prior-questions context.** Offered by the ruling as optional and
  non-blocking; it is an input to the model call, so it is **filed** in `docs/PUNCHLIST.md` §4
  rather than taken.
- **Any schema.** Every one of D-45..D-50 was ruled without schema.
- **The drawer's client half of the `aiTask` block.** The server resolves it; nothing renders it
  yet, because nothing renders the drawer.

### 2.1 · Validation on this branch

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **129** errors = `TSC_BASELINE` |
| `npm run build` | OK |
| `check-decision-guards.cjs` | OK, 0 deferred |
| `check-money-endpoints.cjs` `--self-test` + scan | OK / exit 0 |
| `phase2-fee-gate.sh` | PASSED |
| `check-ai-draft-eligibility.cjs` `--self-test` + scan | OK / OK (the create rail is not in its predicate, and must not become so) |
| `check-test-files-wired.cjs` `--self-test` + scan | 12/12 fixtures; `test-orphan-ratchet: OK`, 282/515 reachable, **233 orphans unchanged** (both new suites are reachable) |
| `check-duplicate-migration-prefixes.cjs` | OK |
| migration chain-integrity | 2/2 |
| migrations from EMPTY on local Postgres | 301 applied, 0 skipped — **no migration added by this lane** |
| `grep -c replit.local package-lock.json` | 0 |
| new suites | S1–S11 11/11 · A1–A7 7/7 |
| bordering suites, untouched | 7/7 · 7/7 · 9/9 · 20/20 · 10/10 · 14/14 |

## 3 · The cost-per-applied-proposal query (D-47)

The decision-maker asked for the token cost per **APPLIED** proposal to be visible from day one.
`ai_cost_tracking.request_id` carries the pre-minted proposal id, so the join needs no new column:

```sql
-- Token spend per APPLIED AI-task proposal, and the ratio that matters:
-- what the platform spent on asks versus what it collected on applies.
SELECT
  p.id                              AS proposal_id,
  p.trip_id,
  p.applied_at,
  p.charge_basis,                   -- 'paid' | 'trip_pass'
  p.charged_amount_cents,           -- NULL on a Trip-Pass-covered apply (§13: never 0)
  count(c.id)                       AS model_calls,
  sum(c.tokens_in)                  AS tokens_in,
  sum(c.tokens_out)                 AS tokens_out,
  sum(c.cost)                       AS model_cost_usd
FROM plan_proposals p
JOIN ai_cost_tracking c
  ON c.request_id = p.id
 AND c.source_type = 'ai_task'
WHERE p.status = 'applied'
GROUP BY p.id, p.trip_id, p.applied_at, p.charge_basis, p.charged_amount_cents
ORDER BY p.applied_at DESC;
```

And the whole-funnel form, which is the number the ratio actually needs — **asks that were never
applied cost tokens too**, and D-46 (i) is the reason they are attributable at all:

```sql
-- Every ai_task model call, joined to the proposal it was minted for (LEFT: a failed ask
-- writes a cost row with NO plan_proposals row — D-46 (i), intended, not a defect).
SELECT
  coalesce(p.status, 'no_proposal_row') AS outcome,
  count(*)                              AS model_calls,
  sum(c.cost)                           AS model_cost_usd,
  sum(coalesce(p.charged_amount_cents, 0)) / 100.0 AS collected_usd
FROM ai_cost_tracking c
LEFT JOIN plan_proposals p ON p.id = c.request_id
WHERE c.source_type = 'ai_task'
GROUP BY 1
ORDER BY 2 DESC;
```

> **Read it honestly (§13):** `collected_usd` is `0` for the `trip_pass` basis because a covered
> apply records `charged_amount_cents` NULL — that is "no charge was made", **not** "we charged
> nothing"; a pass was already paid for elsewhere and this query is not the place to attribute it.

---

## 4 · THE MODEL CALL — the exact design, NOT BUILT

**This section is the hand-off.** Nothing below exists in code on this branch. It is written so the
decision-maker can read the shape of the call before it is written.

### 4.1 · Input scope (D-50, and the exclusion list is the load-bearing half)

The model is sent, and is sent **nothing else**:

| Sent | Source | Note |
|---|---|---|
| The trip row's own fields | `trips` — `destination`, `start_date`, `end_date`, `adults`, `kids`, `timezone`, `experience_type_id`'s resolved slug | LD 30: a NULL timezone is sent as *unknown*, never UTC |
| The ordered items | `itinerary_items` for this trip, in the plan's own order | each row carries its **id** so a `replaces` can name one |
| **The protected set, MARKED AS CONSTRAINTS** | the ONE existing pair — `itineraryItemIsExpertWork` + `itineraryItemIsMoneyCommitted` | described as present and **not replaceable**; the optimizer baseline's own posture |
| The plan's events | `user_experiences` on this trip | LD 29/35 — `start_time` is wall-clock, sent verbatim |
| The plan's stops | `trip_destinations` | LD 34 — an unlocated stop is sent as unlocated, never guessed |
| The catalog | `loadOptimizerCatalog(trip.destination)` **only** | id, title, category, location, price — nothing else |

**EXPLICITLY EXCLUDED, and each for a named reason:**

- **Anything from `fee_bands`, `optimization_fees`, commission bands, revenue shares or splits**
  (D-50 e). The model never sees what the platform charges or what it pays out.
- **Any other traveler's data, any other plan, any other trip's items.** §14's read clause: the
  owner is the session and the plan is the path's.
- **Any `users` row beyond the session's own**, and no email, no phone, no payment identity.
- **`trips.expert_notes`** — the Workstation's PRIVATE build notes (LD 21: never a traveler surface,
  and therefore never a model input).
- **Guest emails and dietary notes** (`event_invites`) — the PII class LD 42 D9 / LD 37 keep behind
  the owner tier.
- **`plan_proposals.model_tier`** and any engine identity — LD 41 (c), in both directions.
- **Stripe identities, `booking_details`, `travelerCharge`** — §19d's money-bearing jsonb.

### 4.2 · Output schema the `.strict()` parser accepts

Exactly `PlanProposalChangeSet` (`shared/plan-proposals.ts:107-120`) and nothing wider:

```
{
  additions?: [{ title, description?, dayNumber?, startTime?, endTime?,
                 location?, estimatedCost?, providerServiceId?, reason? }],
  replaces?:  [{ itemId, reason? }],
  notes?:     [string],
  protectedNote?: string
}
```

**What the SERVER does to it before a row is written** — this is the sanitiser lane 1 already built,
and it is what makes D-50 (d)'s "catalog text is untrusted model input" true rather than aspirational:

1. Parse `.strict()`. An unknown key is a **refusal**, not a silent strip.
2. **Every `estimatedCost` is DISCARDED and re-derived** from the catalog row's own price when
   `providerServiceId` names one, and **omitted** otherwise (§13 — never `$0`). **No number the
   model produced is persisted** (D-50 a).
3. Every `providerServiceId` is checked against the set `loadOptimizerCatalog` returned for THIS
   trip. An id that is not in it **drops that addition** (D-50 b) — it does not fail the ask.
4. Every `replaces.itemId` is checked against this trip's items, and any naming the protected set
   is **filtered out before the row is written** (brief §4.2). The apply's own D3 refusal stays as
   the backstop.
5. `title` is required; an addition without one is dropped.

### 4.3 · The `trackAnthropicResponse` call (D-47)

```ts
trackAnthropicResponse(response, {
  sourceType: "ai_task",            // open field, no CHECK on the table
  userId: askerUserId,              // the SESSION asker — never the plan's owner
  requestId: proposalId,            // the PRE-MINTED id, minted before this call
});
```

The model id comes from `resolveAiTaskModel()` (`server/config/ai-task-model.ts`), read **per call**,
defaulting to the optimizer's tier. `resolveAiDraftModel` is not imported in this file and must not be.

### 4.4 · Failure paths

| What happened | The row | The cost row | The marker | What the traveler is told |
|---|---|---|---|---|
| Model returned a usable change set | **written**, `status='proposed'`, id = the pre-minted one | written | cleared | the proposal |
| Model **errored** and the SDK surfaced usage | **NOT written** | **written** (`requestId` = the pre-minted id — attributable to an ask with no proposal, D-46 (i), intended) | cleared | the ask failed; nothing was charged |
| Model errored with **no usage available** | not written | **not written**, and the log says *why* — a fabricated token count is worse than a missing row (§13) | cleared | the ask failed; nothing was charged |
| Output failed the `.strict()` parse | **NOT written** | written if usage exists | cleared | the ask failed; nothing was charged |
| A second ask arrives while one is in flight | not written | not written | untouched | **409 naming the in-flight proposal id** |
| The rate limit denied the ask | not written | not written | never taken | the limiter's own message and `retryAfterSec` |

**The marker is cleared in a `finally`**, so a throw anywhere above cannot wedge the trip.
**Nothing on any row is charged** — the charge point is the apply, and this rail never touches it.

### 4.5 · The D-45 option, if it is taken later

Pass the asker's own prior `question` values on **this** trip — `SELECT question FROM plan_proposals
WHERE trip_id = $1 AND question IS NOT NULL` scoped by the route's own already-authorized trip, most
recent first, capped. It changes no ruling: the drawer stays stateless and `conversation_id` stays
NULL. It is filed, not taken (see §2).

## 5 · Review fixes (2026-09-16/17 — ledger `2026-09-16-l16-lane1-review-fixes`)

An independent review of head `1c390b9` returned seven findings. Six are this section's; the
seventh (CI/mergeability) is the coordinator's. **No schema change and no migration**: the
`shared/schema.ts` diff is two column JSDoc blocks and the status doc line — no column, no index,
no type.

### 5.1 · Finding 1 (BLOCKING) — re-validation by id, one predicate

`assertProposalCatalogStillValid` tested a named `providerServiceId` for membership in
`loadOptimizerCatalog(...)`, which is `.limit(100)` with no `ORDER BY`. Past 100 live listings in a
destination, a live listing could fall off the page and be refused `listing_unavailable` — a false
§13 claim on a paid rail. Fix: `optimizerCatalogLivenessWhere(destination)` is exported from
`optimizer-baseline.service.ts` (the reader's own module); `loadOptimizerCatalog` pages over it
with identical semantics, and the validator selects `providerServices.id` under
`and(predicate, inArray(id, named))` — no page, no limit. R3 proves it with 101 live decoys inserted
BEFORE the named listing (heap order puts it past a page of 100) and a paused listing refused by id.
S11 (`ai-ask-create-rail.test.ts`) now pins the predicate and refuses a second spelling of it.

### 5.2 · Finding 2 (BLOCKING) — OPTION B: refund the fee on expiry (decision-maker ruling)

- **Trigger:** apply refused `stale_catalog_price` or `listing_unavailable` while
  `auth.basis === "paid"` (a Stripe-verified PaymentIntent bound to this proposal). Not
  `protected_item` — not ruled, left as it was.
- **Claim first (§15b):** `refundRefusedProposalCharge` flips the row with ONE atomic conditional —
  `status='refunded'`, `charge_basis='paid'`, `charged_amount_cents=<Stripe's amount>` — `WHERE
  status='proposed' AND stripe_payment_intent_id=<this PI>`. Existing columns carry the whole fact;
  `refunded` is a fourth app-enforced status (no CHECK, no migration).
- **Then Stripe:** `stripePaymentService.refundAiTaskProposalFee` — the THIRD caller of the one
  `createStripeRefundForBooking` call site — under `planProposalRefundIdempotencyKey(proposalId)` =
  `ai-task-refund-<proposalId>`.
- **Then record:** one booking-less `refunds` row (`booking_id` NULL, `reason =
  ai_task_proposal_refused:<refusal>:<proposalId>`), inserted once per Stripe refund id.
- **Loser / retry = one path:** a row already `refunded` on this PI answers from the audit row, or
  re-drives the same key. A failed Stripe call keeps the claim, logs at ERROR, answers
  `refund: { issued:false, state:"pending" }`; the next apply completes it. No rollback.
- **Response (§13):** `409 { reason, itemIds, refund: { issued:true, refundId, amountCents } }`;
  a retry on a `refunded` row answers `reason:"refunded"` with the same block. A covered refusal
  carries no `refund` block — nothing was charged.
- **Not written, and why:** no `platform_revenue` reversal (the charge is ledgered only after a
  SUCCESSFUL apply, so no row exists to reverse — R4 asserts zero rows); no `ai_cost_tracking` row
  (the charge lane writes none at apply).
- **Stated limits:** `refunds` has no UNIQUE on `stripe_refund_id`, so a true concurrent pair can
  leave two audit rows for ONE refund (R6 asserts one refund id, not one row); a caller that reads
  the row after the other's claim is answered `reason:"refunded"` rather than the refusal — true at
  the moment it read.

### 5.3 · Findings 3 and 4 — proofs

`server/__tests__/plan-proposal-refund.db.test.ts` R1–R7, wired into the `plan-proposals` job.
Stripe is stubbed on the shared prototype (the bundle-settlement precedent); the refund stub
emulates Stripe's idempotency (same key ⇒ same refund) because that is the property R6 leans on.
A7 in `ai-ask-create-rail.db.test.ts` now drives `applyPlanProposal` with a THROWING `reFinalize`
through an injected `deps` seam and asserts the apply resolves, the row is `applied`, and the error
line carries both ids — replacing a string-index pin over the source.

### 5.4 · Findings 5 and 6

5: both reads in the validator go through the injected `tx`, so the "joins the caller's
transaction" comment is now true. 6: unchanged; marked `lane 2: move the limit hit to the
model-call site` at the rate-limit read.

### 5.5 · Validation

tsc 129 == baseline; `npm run build`; `check-decision-guards`; `check-money-endpoints --self-test`
+ run (exit 0); `phase2-fee-gate.sh` (PASS); `check-test-files-wired --self-test` + ratchet OK;
`check-duplicate-migration-prefixes`; `check:mutation-auth` (rail set unchanged; manifest
regenerated); migrations applied from EMPTY on local Postgres (307/307); suites green against it:
plan-proposals P1–P7, plan-proposal-charge C1–C7, proposal-apply-authorization A1–A9,
ai-ask-create-rail S1–S11 and A1–A7, plan-proposal-refund R1–R7 (twice), bundle-partial-settlement
S1–S10, refund-retry-convergence, traveler-fee-refund; `grep -c replit.local package-lock.json` = 0.


---

## 6 · Rulings 2026-09-17 (folded in before merge)

Two follow-up rulings from the decision-maker, landed on this branch. **No schema change, no
migration**; one commit each. §6.2 lands in the next commit.

### 6.1 · Ruling (a) — OPTION B is widened to EVERY apply refusal of a PAID proposal

`PROPOSAL_REFUNDABLE_REFUSALS` carried `stale_catalog_price` and `listing_unavailable` only, and the
file said so out loud: `protected_item` was "deliberately NOT here: it is not ruled". The shape that
left behind is the one worth naming — a PAID proposal refused `protected_item` was **stuck for
good**. LD 42 D3 protects the named row permanently, so no retry of the apply can ever succeed; and
`discardPlanProposal` refuses a row carrying a `stripe_payment_intent_id`, so the traveler could not
discard it either. The fee stayed taken for a change the platform itself had decided must never be
made.

`protected_item` is now a **third caller of the same refund path** — no second Stripe site, the same
`ai-task-refund-<proposalId>` idempotency key, the same §15b claim-before-the-call, the same 409
shape carrying the `refund` block beside `reason:"protected_item"` and the `itemIds` that named the
protected rows. The route was not touched beyond its comment: it already asks
`isRefundableProposalRefusal(err.code)` rather than re-typing a string compare (§18 rule 1), which is
exactly why widening the ruling was a one-list edit.

`not_applicable` stays off the list, and the code now says why rather than leaving it unexplained: it
is the apply's own atomic conditional reporting that the row was no longer `proposed` when it got
there, so the row is already applied, discarded or refunded and whatever was owed on it was settled
by the path that moved it. Refunding on that code would be a second opinion about a terminal row.

**R8** (new) proves it end to end: a paid proposal whose `replaces` names an `origin='expert'` row ⇒
409 `protected_item` naming that row; exactly one `refunds.create`, under the proposal-derived key,
for the PaymentIntent's own amount; the row terminal as `refunded` carrying the recorded charge and
basis `paid` with `applied_at` still NULL and the payment identity unrewritten (§19a); one
booking-less `refunds` audit row naming the refusal; the plan byte-identical (the protected row
survives, the addition was never created); and a retry answering `reason:"refunded"` with the SAME
refund id and **zero** new Stripe calls.

### 6.3 · Validation (2026-09-17)

tsc 129 == baseline; `npm run build`; `check-decision-guards`; `check-money-endpoints --self-test`
+ run (exit 0); `phase2-fee-gate.sh` (PASS); `check-test-files-wired --self-test` + run
(`test-orphan-ratchet: OK`); `check-duplicate-migration-prefixes`; `check:mutation-auth` (595
registrations, rail set unchanged); migrations applied from EMPTY on a fresh local Postgres 16
database (308/308); `plan-proposal-refund.db.test.ts` **R1–R8 green**,
`ai-ask-create-rail.db.test.ts` A1–A7 green, `plan-proposal-charge.db.test.ts` C1–C7 green against
it; `grep -c replit.local package-lock.json` = 0. No schema touched, so no
`check-undeclared-tables` run was required.
