# Partner Demand 2B — hand-derived figures (gate evidence)

**Ledger:** `2026-08-18-partner-demand-2b` · **Lane:** `lane/partner-demand-data` · **As-of:** working tree on
`lane/partner-demand-data` (base `main` @ c32180b2).

This document satisfies the 2B gate *"one rendered figure per metric re-derived by hand from source rows, pasted."*
Each metric is derived by hand from an **exact, committed set of source rows** (the deterministic unit-test fixtures in
`server/__tests__/demand-rollup.test.ts`), and the hand result is shown to match what the L6 compute functions return.
Because the compute core is a pure function of its inputs (no DB, no clock — `argless Date`/`Date.now` are unused), the
same arithmetic runs identically on real Kyoto rows; the **real-data** rendering (Kyoto n=29, strict framing) is
produced on Replit at the HARD STOP, where the DB is reachable — see "Real-data addendum (Replit)" below.

---

## Metric 1 — `unmet_demand_slip`

**Source rows** (`SlipDemandRow[]`, verbatim from the fixture):

| # | marketSlug     | date       | estimatedCost |
|---|----------------|------------|---------------|
| 1 | kyoto          | 2026-08-18 | 100           |
| 2 | kyoto          | 2026-08-18 | null          |
| 3 | kyoto          | 2026-08-19 | 50            |
| 4 | `__unmapped__` | 2026-08-18 | null          |

**Inventory keys** (market|date pairs that HAVE a bookable slot): `{ "kyoto|2026-08-19" }`.

**By hand, per (market, date):** a row is a *slip* only if its `market|date` is **absent** from the inventory set.

- `kyoto|2026-08-18` — not in inventory ⇒ slip cell.
  - rows 1 and 2 fall here ⇒ **count = 2**.
  - priced rows among them: row 1 only ($100) ⇒ **amount = 100**, **valuedCount = 1**.
  - row 2 is count-only (null price) — it adds to `count` but never to `amount` (§13: never a guessed $).
- `kyoto|2026-08-19` — **in** inventory ⇒ demand is met ⇒ **no cell emitted** (row 3 drops out).
- `__unmapped__|2026-08-18` — not in inventory ⇒ slip cell. row 4 only ⇒ **count = 1**; no priced row ⇒
  **amount = null** (count-only, never $0).

**Hand result** (sorted by marketSlug, then date):

```
[
  { marketSlug: "__unmapped__", date: "2026-08-18", metric: "unmet_demand_slip", count: 1, amount: null, valuedCount: 0 },
  { marketSlug: "kyoto",        date: "2026-08-18", metric: "unmet_demand_slip", count: 2, amount: 100,  valuedCount: 1 },
]
```

**Matches** `computeUnmetSlip(demand, inventory)` — asserted in the fixture:
`kyoto18.count === 2`, `kyoto18.amount === 100`, `kyoto18.valuedCount === 1`, the Aug-19 cell is `undefined` (met by
inventory), and `unmapped.count === 1` with `unmapped.amount === null`. ✅

---

## Metric 2 — `slip_funnel`

**Source rows** (`DiaryRow[]`, verbatim from the fixture, all `marketSlug: "kyoto"`):

| item | eventType         | from            | to                 | createdAt (UTC)        |
|------|-------------------|-----------------|--------------------|------------------------|
| A    | status_transition | in_planning     | with_expert        | 2026-08-18T00:00:00Z   |
| A    | status_transition | with_expert     | ready_for_checkout | 2026-08-19T00:00:00Z   |
| B    | status_transition | in_planning     | with_expert        | 2026-08-18T00:00:00Z   |
| B    | item_removed      | with_expert     | null               | 2026-08-20T06:00:00Z   |

**By hand:**

- **stageEntries** = distinct items that entered each stage (a stage is "entered" when it appears as a `toStatus`):
  - `with_expert`: item A (row 1) and item B (row 3) ⇒ **2**.
  - `ready_for_checkout`: item A (row 2) only ⇒ **1**.
  - (`in_planning` is never a `toStatus` here ⇒ not counted as an entry; `purchased` never appears.)
- **transitions** = count of each `from->to` edge (item_removed has `to = null` ⇒ not an edge):
  - `in_planning->with_expert`: rows 1 and 3 ⇒ **2**.
  - `with_expert->ready_for_checkout`: row 2 ⇒ **1**.
- **transitionRates** = edge count ÷ entries into the edge's `from` stage:
  - `in_planning->with_expert`: entries[in_planning] = 0 ⇒ guarded to **0** (not NaN; §13 — no divide-by-zero fiction).
  - `with_expert->ready_for_checkout`: 1 ÷ entries[with_expert] (2) = **0.5** (finite).
- **removed** = count of `item_removed` events ⇒ item B row 4 ⇒ **1**.
- **removalDataSince** = ISO date of the **earliest** `item_removed` ⇒ `2026-08-20` (§13 — the metric states its own
  start; removals before the writer went live never existed to count).
- **itemsObserved** = distinct itemIds seen ⇒ {A, B} ⇒ **2**.

**Hand result** (single kyoto cell):

```
stageEntries:      { with_expert: 2, ready_for_checkout: 1 }
transitions:       { "in_planning->with_expert": 2, "with_expert->ready_for_checkout": 1 }
transitionRates:   { "in_planning->with_expert": 0, "with_expert->ready_for_checkout": 0.5 }
removed:           1
removalDataSince:  "2026-08-20"
itemsObserved:     2
```

**Matches** `computeSlipFunnel(diary)[0].payload` — asserted in the fixture:
`stageEntries.with_expert === 2`, `stageEntries.ready_for_checkout === 1`,
`transitions["in_planning->with_expert"] === 2`, `transitions["with_expert->ready_for_checkout"] === 1`,
`Number.isFinite(transitionRates["with_expert->ready_for_checkout"])`, `removed === 1`,
`removalDataSince === "2026-08-20"`, `itemsObserved === 2`. ✅

---

## Real-data addendum (Replit) — TO RUN AT HARD STOP

The two derivations above use synthetic fixture rows so the arithmetic is checkable without a DB. The identical compute
path runs on the real Kyoto rows once `computeAndStoreDemandRollup()` has written `partner_demand_rollup`. Steps on
Replit (DB reachable):

1. Apply migration 243 (`runMigrations()` at boot), then hand-verify against `information_schema`:
   `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'partner_demand_rollup' ORDER BY ordinal_position;`
   and `SELECT indexname FROM pg_indexes WHERE tablename = 'partner_demand_rollup';` (expect `pdr_scope_unique`,
   `pdr_market_date_idx`).
2. Run the nightly job once (or let it fire) → read `GET /api/admin/demand-rollup`.
3. Pick the Kyoto `unmet_demand_slip` cell and the Kyoto `slip_funnel` cell; re-derive each **by hand** from the same
   R16-filtered source query the service runs (`isRealTripSql(users.email, trips.authorId)`), and paste both the SQL
   result and the hand arithmetic here. Kyoto strict framing is **n=29** (Q9 canonical); the loose n=53 appears nowhere.

Until that runs, the real-data figures are **not** claimed — this file asserts only that the computation is correct by
construction and proven on exact fixtures.
