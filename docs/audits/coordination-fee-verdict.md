# Coordination-fee reconciliation — $479.01 vs $2,000 (READ-ONLY verdict)

**Merge gate for PR #137.** journey-7:91 now reaches the handler (bucket-2 auth fix worked) and returns `feeCents = 47901` ($479.01); the test expects `200000` ($2,000, `rule="percent"`). One of them is wrong.

## Verdict: **HANDLER WRONG** — live event-coordination pricing bug

The fee engine reads its budget from a column **no code path ever writes**, so every coordination fee is computed against a **$0 budget**. The percent-of-budget tier is therefore dead: every fee collapses to the $499 floor (minus any optimize credit), regardless of the real event budget. The test's expectation is correct and matches the endpoint's own documented rule; it cannot be made to pass by changing its input. **#137 does not merge past this as "just red."**

---

## The arithmetic, reconstructed exactly

`47901 = 49900 (floor $499) − 1999 (wedding $19.99 optimize credit)`, with **`budgetCents = 0`**.

Step by step, from source:
1. `budgetCents = 0` (budget never reaches the calc — see wiring below).
2. `percentFee = round(0 × 0.08) = 0` — `optimization-fee.service.ts:144`.
3. `rawFeeCents = max(49900, 0) = 49900`, `rule = "floor"` — service.ts:145–146.
4. `isEventOptimizer("wedding") = true`; wedding optimize fee `= 1999` with `creditTowardCoordination = (branch==="event") = true` — service.ts:152–157, `getFee` at :53, credit rule at :58; seed value in migration `076_phase2_optimizer_prices.sql:21` (`price_cents = 1999 WHERE event_type IN ('wedding','corporate')`).
5. `feeCents = max(0, 49900 − 1999) = 47901` — service.ts:159.

This reproduces the observed `47901` **exactly** — a specific wrong calculation, not a random failure. (What the response returns alongside it — `rule: "floor"`, `breakdown.percentOfBudget: 0` — also contradicts the test's `rule: "percent"` / `percentOfBudget: 200000`, and is fully explained by `budgetCents = 0`.)

## Where the budget is lost (the actual bug, with `file:line`)

The budget the client supplies never reaches the fee math because the **write path and the read path use different fields**, and the read field is orphaned:

| Path | Field | Evidence |
|---|---|---|
| Client sends (and test sends) | `metadata.budget` (= 25000) | journey-7.spec.ts:102; `POST /api/coordination-states` zod accepts `experienceType/title/status/metadata` only — **routes.ts:7791–7796** |
| Stored | into the `metadata` jsonb blob, untouched | `storage.createCoordinationState` spreads the input as-is, derives nothing — **storage.ts** (`createCoordinationState`) |
| Fee calc reads | `state.totalEstimatedCost` (×100) → **null → 0** | **routes.ts:7974–7976** |

`coordination_states.total_estimated_cost` is **read only** by the `/fee` handler (routes.ts:7974) and **written by nothing** — not `POST` (schema strips it, routes.ts:7791), not `PATCH` (same schema, `total_estimated_cost` not accepted — routes.ts:7810–7814), not the storage layer. The other `totalEstimatedCost` writes in the codebase target AI-itinerary tables, not `coordination_states`. So the budget field the fee engine reads is structurally disconnected from every way a client can provide a budget.

**Why the test can't just be "fixed":** neither the create nor the patch API accepts a field that sets `total_estimated_cost`, so no documented request can supply the budget the calc reads. The assertion at journey-7:91 encodes the endpoint's own documented rule ("greater of $499 floor or 8% of budget"); it is correct and should stay red until the handler is wired.

## Impact

🔴 **Money math, same class as the fee-config hole.** The percent-of-budget tier is **entirely dead** — a $500,000 wedding and a $1,000 one are both charged the $499 floor (minus credit). Systematic **undercharge** on every above-floor event: the platform never collects the percentage it's designed to. For the test's $25k wedding: $479.01 collected vs $2,000 owed — a 76% shortfall.

**Fee-band note:** the calc uses `DEFAULT_COORDINATION_FLOOR_CENTS = 499_00` / `DEFAULT_COORDINATION_PERCENT = 0.08` as **code constants** (service.ts:119–120) with a `TODO: Phase 4.1 read from DB` (service.ts:139) — i.e. this fee is **not yet resolved through an admin-configurable band**, unlike the commission path. Not the cause of this bug (the values are correct; the budget is the problem), but flag for the fee-band single-source rule: coordination floor/percent are literals today.

## Fix direction (NOT done here — read-only)

Wire the budget through, one of:
- **(a)** `/fee` reads `state.metadata?.budget` (×100) as the budget source (routes.ts:7974), or
- **(b)** `POST/PATCH /api/coordination-states` accepts a budget and persists `total_estimated_cost` (routes.ts:7791/7810), or
- **(c)** `storage.createCoordinationState` derives `total_estimated_cost` from `metadata.budget`.

Its own scoped fix (event-coordination pricing), jumps priority per the money-math class. Keep journey-7:91 red until it lands.

---

*Read-only reconciliation. Nothing changed — not the handler, not the test. Behavioral confirm was attempted locally but the sandbox reaped the app server across turns; the exact-arithmetic reconstruction (47901 = 49900 − 1999 at budget 0) is dispositive and independently checkable from the cited lines.*
