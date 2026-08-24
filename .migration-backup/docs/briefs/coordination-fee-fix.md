# BRIEF — Event-coordination fee engine: wire the budget + settle the credit (FIX)

**Severity: 🔴 money math, live.** Peer of the fee-config auth fix. The `/api/coordination-states/:id/fee` engine is mispricing every event: the percent-of-budget tier is **dead** (budget never reaches the calc), so every coordination fee collapses to the $499 floor minus a credit that is itself applied unconditionally. Surfaced by journey-7:91 (`47901` vs expected `200000`); full reconciliation in `docs/audits/coordination-fee-verdict.md`.

**Type:** Fix, on its **own branch** (`claude/coordination-fee-fix`) — not folded into the structural branch or the Discover lane. It touches pricing, so per the CLAUDE.md **Coordination Prevention** rule it needs the decision-maker's sign-off on the decisions below and a CLAUDE.md note **before** code lands.

**Do not start coding until D-BUDGET and D-CREDIT are answered** — both change the numbers, and one is a genuine pricing-policy call, not a mechanical fix.

---

## The two defects (+ one literal), with `file:line`

### Defect 1 — budget never reaches the calc (the dominant bug, unambiguous)
`GET /fee` reads the budget from `state.totalEstimatedCost` (`server/routes.ts:7974`), a column **no code path writes**:
- `POST`/`PATCH /api/coordination-states` zod schemas accept only `experienceType/title/status/metadata` (`routes.ts:7791–7796`, `7810–7814`) — `total_estimated_cost` is not settable.
- `storage.createCoordinationState` derives nothing (`storage.ts`).
- The client's `metadata.budget` (what the test sends) lands in the jsonb blob and is never read by the fee calc.

⇒ `budgetCents = 0` always ⇒ `percentFee = 8% × 0 = 0` < floor ⇒ **`rule` is never `"percent"`**; every fee is the $499 floor (minus credit). A $500k wedding and a $1k one price identically. Systematic **undercharge**.

### Defect 2 — optimize credit applied unconditionally (a pricing DECISION)
`resolveCoordinationFee` subtracts the event optimize fee (`wedding = $19.99`) whenever `isEventOptimizer(eventType)` is true and the fee isn't disabled — **it never checks whether the traveler actually paid an optimize fee** (`optimization-fee.service.ts:151–159`; `getFee` credit rule at `:58` = `branch === "event"`). There is **no paid-signal** in the codebase to gate it (grep for `paidOptimize`/`optimization_payments`/a paid flag → none).

The codebase's **own unit tests contradict each other** on this:
- `event-coordination.test.ts:82–86` — `resolveCoordinationFee('wedding', 1_000_000)` expects `feeCents = 80000` (**no** credit; 8% of $10k). With the current handler this yields `78001` → **this test is currently failing/stale** (predates the credit, added in "3.0.1d").
- `event-coordination.test.ts:103–113` — expects the credit **is** subtracted (`rawFee − optimizeFee.priceCents`).
- journey-7:91 expects `200000` for a fresh $25k wedding — i.e. **no** credit on an unpaid state.

Two of three expect no credit on a fresh/unpaid state; one expects it always. This is unresolved pricing policy, not a bug with an obvious right answer.

### Literal — coordination floor/percent are code constants, not a fee_band
`DEFAULT_COORDINATION_FLOOR_CENTS = 499_00` / `DEFAULT_COORDINATION_PERCENT = 0.08` (`optimization-fee.service.ts:119–120`) with `// TODO: Phase 4.1 — read from DB` (`:139`). Not the cause of the bug (values are correct), but it violates the fee-bands single-source rule and should be resolved deliberately.

---

## Decisions required (decision-maker) — before code

**D-BUDGET — what is the canonical budget field, and where does it get set?**
- **(a)** `/fee` reads `state.metadata?.budget` (×100) — smallest change, no schema/migration; treats `metadata.budget` as canonical (dollars).
- **(b)** `POST`/`PATCH` accept a first-class `budget`/`totalEstimatedCost` field and persist `total_estimated_cost`; `/fee` keeps reading it — cleaner contract, but a schema/validation change (and arguably a migration if the column's nullability/semantics change).
- **(c)** `storage.createCoordinationState` derives `total_estimated_cost` from `metadata.budget` — hides the mapping in storage; least explicit.
- *Recommendation:* **(a)** for the fix (unblocks pricing now, no schema churn), with **(b)** filed as the clean follow-up. Confirm the unit (`metadata.budget` is **dollars**, ×100 → cents; the test sends `25000` = $25,000).

**D-CREDIT — when does the optimize-fee credit apply?**
- **(a)** Only when the traveler **actually paid** an optimize fee that credits toward coordination (payment-gated). Requires a paid-signal (none exists today — would need to record/lookup the optimize payment for this trip/state). Matches journey-7:91 and the "small budget floor" expectations.
- **(b)** Always for event types (config-driven, current behavior). Then journey-7:91's expected `200000` is wrong (should be `198001`) and must be updated, and `:82–86` must be updated to `78001`.
- *Recommendation:* **(a)** — "credit the optimize fee you paid" is the honest semantics and what 2 of 3 tests encode; (b) hands every event optimizer a $19.99 discount they didn't earn. But this is your pricing call.

**D-BAND — move floor/percent to `fee_bands` now, or file separately?**
- Fold a `coordination_floor` / `coordination_percent` band (or a single coordination fee-config row) into this fix, or land the budget/credit fix first and file the band migration as its own follow-up. *Recommendation:* file separately — keep this fix to the pricing-correctness bug; the literal is pre-existing and rate-neutral. Either way, **no new fee literal** may be introduced by the fix.

---

## Fix steps (once D-BUDGET / D-CREDIT are locked)

1. **CLAUDE.md first** — record the coordination-fee budget source + credit semantics decision (Coordination Prevention rule; this is approval-workflow/fee-adjacent).
2. **Wire the budget** per D-BUDGET so the percent tier can fire.
3. **Gate the credit** per D-CREDIT (payment-gated, or leave always-on and fix the assertions).
4. **Reconcile the tests to the decision** — `event-coordination.test.ts:82–86` and `:103–113` must agree with each other and with journey-7:91 under the chosen semantics; update whichever encode the rejected policy. Do **not** weaken assertions to pass — align them to the ratified numbers.
5. **No fee literals** — if D-BAND says "now," resolve through a band; else leave the constants with their TODO untouched.

## Verification (this is money — behavioral, not just unit)
- Unit: all `event-coordination.test.ts` cases green **and mutually consistent** under the locked semantics.
- Behavioral (local server + real session), the proof the verdict couldn't complete: `POST /api/coordination-states {experienceType:"wedding", metadata:{budget:25000}}` → `GET …/fee` returns **`feeCents = 200000`, `rule = "percent"`, `breakdown.percentOfBudget = 200000`** (assuming D-CREDIT = payment-gated and no optimize paid). Record the observed JSON.
- Regression: a small-budget wedding still floors ($499); a non-event (`vacation`) still gets `optimizeCreditCents = 0`.

## What NOT to do
- Don't wire the budget and stop — you'll ship `198001` and journey-7:91 stays red on the credit. Both defects (or defect 1 + a ratified credit policy) must land together.
- Don't "fix" journey-7:91 by matching it to the current buggy handler — the handler is wrong on budget regardless.
- Don't introduce a fee literal; if you touch rates, resolve through a band.
- Don't fold into the structural/Discover branches — own pricing lane, merges on its own.
- Don't skip the CLAUDE.md note — pricing/approval-adjacent change.

---

*Scoping/plan artifact. No handler or test changed here. Blocks on D-BUDGET + D-CREDIT (decision-maker). journey-7:91 stays red until this lands — it is a correct money assertion, and #137 must not merge past it as "just red."*
