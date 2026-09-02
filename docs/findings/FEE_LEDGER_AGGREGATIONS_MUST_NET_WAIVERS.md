# Finding — fee_ledger aggregations must net `covered_by` waiver legs (forward contract)

**Filed by:** lane `claude/traveler-fee-collection` (ruling `2026-09-02-traveler-fee-applies-everywhere`, BLOCKER condition 2).
**Class:** revenue-overstatement-on-launch. **Disposition:** FILED, not fixed in this lane (per ruling). **as-of** branch base `4644af6`.

## What

Trip-Pass / rails suppression of the traveler service fee is recorded as **two rows that net to zero** in `fee_ledger`:
a `traveler_service_fee (+X)` row and a **`fee_waiver (−X)`** row tagged `covered_by:trip_pass|rails` (migration-179
`amount <> 0` CHECK stands; a literal $0 row is impossible — see ruling). This means:

- `SUM(amount)` over a booking (or over the whole table) **is already correct** — the negative leg nets automatically.
  The migration-179 invariant `traveler_paid − provider_credited = SUM(amount)` holds by construction.
- **Any aggregation that filters `fee_type = 'traveler_service_fee'` and sums only that** will **overstate** fee
  revenue by the suppressed total the day Trip Pass launches — it counts the `+X` and never sees the `−X` (which
  lives under `fee_type = 'fee_waiver'`).

## Evidence (why this is filed, not fixed)

- **`fee_ledger` has ZERO readers today.** A repo-wide grep for `fee_ledger` / `feeLedger` consumers (SELECT/SUM/
  GROUP BY) finds only the rails **writer** (`fee-ledger.service.ts`), the invariant stated in a comment, and one
  pointer comment (`optimization.routes.ts:274`). No revenue report, admin dashboard, or rollup reads this table
  yet. So there is **nothing to overstate today** — the risk is entirely prospective.
- Because there is no consumer, there is no code to fix in this lane. Fixing a non-existent reader would be
  speculative.

## The contract this finding pins (for whoever builds the first `fee_ledger` revenue reader)

1. **To get gross fee revenue:** `SUM(amount)` across the relevant `fee_type`s — do NOT pre-filter to positive rows.
2. **To get the suppressed (waived) total** (the number that tells us whether Trip Pass is priced correctly, per the
   ruling): `SUM(-amount)` over `fee_type = 'fee_waiver'` (or `SUM(amount)`, which is already negative).
3. **Never** report `SUM(amount) WHERE fee_type = 'traveler_service_fee'` as "fee revenue" — that is the pre-waiver
   gross and it double-counts the covered bookings.
4. A per-booking view must include BOTH legs or neither.

## Suggested durable guard (for the reader's lane, not this one)

When the first aggregation lands, add a test asserting a covered booking contributes **net $0** to fee revenue
(the `+X` and `−X` both present), mirroring the D-1 rebuild-guard shape the invariant CI check uses.
