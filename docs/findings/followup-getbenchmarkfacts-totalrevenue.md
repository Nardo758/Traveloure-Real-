# Followup — `getBenchmarkFacts` reads the banned `providerServices.totalRevenue` denorm

**Filed:** 2026-08-18 (Leon, out of the Partner Demand 2B review) · **Class:** Locked Decision 3 violation
(feeLedger-only money truth; `providerServices.totalRevenue` BANNED as an analytics source).
**Scope:** bounded — **one function, one test, its own small PR.** NOT part of `lane/partner-demand-data`.
**Claimable by:** any session between phases.

## As-of
`server/routes/demand.routes.ts:381` `getBenchmarkFacts(userId)`, at `main@c32180b2` (unchanged on the lane tip).

## The defect
`getBenchmarkFacts` builds advisor benchmark facts (a provider's revenue vs. category peers) by selecting
`totalRevenue: providerServices.totalRevenue` (line ~385) and summing it:

```ts
const services = await db
  .select({ categoryId: ..., totalRevenue: providerServices.totalRevenue, bookingsCount: ..., status: ... })
  .from(providerServices)
  .where(eq(providerServices.userId, userId));
const totalRevenue = services.reduce((sum, s) => sum + Number(s.totalRevenue || 0), 0);
```

`providerServices.totalRevenue` is the **denormalized counter** Locked Decision 3 bans as an analytics source — it can
drift from the real ledger and must not feed a figure shown to a provider. This predates the demand lane; it is a
genuine pre-existing violation, not lane debt, which is why the 2B gate (`scripts/check-demand-rollup.cjs`) deliberately
scopes to the demand-rollup module and only **flags** this line rather than policing or laundering it.

## The fix (direction named; already demonstrated in the same file)
The sibling business-advisor code at `demand.routes.ts:~447` already computes revenue the honest way — a **SUM over
`serviceBookings.totalAmount`** (the real number), with a `no_data` floor when the sample is too small. Two acceptable
fixes, pick one:

1. **Compute from `serviceBookings` SUM** for this provider's services (mirror the :447 pattern) instead of reading the
   denorm; keep the existing `< 5`-sample `status: "no_data"` posture (§13).
2. If the honest number can't be assembled cheaply here, **return `status: "no_data"`** rather than a denorm-based figure
   — a suppressed benchmark beats a wrong one.

Either way, delete the `providerServices.totalRevenue` read.

**It cannot wait for the fee ledger** (empty, R12-blocked) — the `serviceBookings` SUM is available today and is what the
sibling code already uses.

## Test
One targeted test proving the benchmark figure is derived from `serviceBookings` (or returns `no_data`) and **never** from
`providerServices.totalRevenue` — e.g. seed a provider whose denorm `totalRevenue` disagrees with the sum of its
`serviceBookings.totalAmount`, assert the returned fact matches the booking sum (or `no_data`), not the denorm.

## Guard follow-through (optional, in the same PR)
Once the read is gone, this file could be added back into `check-demand-rollup.cjs`'s `TOTALREV_FILES` (it is currently
excluded precisely because of this legacy read) so the ban is enforced there going forward — or left to the broader
money-guard. Note in the PR which you chose.

## Not in scope
No demand-lane files; no fee/floor changes; no schema change. One function, one test, one small PR.
