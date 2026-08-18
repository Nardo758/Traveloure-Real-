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

---

## Real-data addendum — RUN 2026-08-18 (Replit, main @ 460df63b, dev DB)

Migration `243_partner_demand_rollup.sql` applied at boot (`[Migrations] Applied + recorded: 243_partner_demand_rollup.sql
… 1 newly applied, 242 already recorded`). Schema hand-verified: all 9 columns per the migration; indexes
`partner_demand_rollup_pkey`, `pdr_market_date_idx`, `pdr_scope_unique` all present. Rollup triggered once via
`computeAndStoreDemandRollup()` (**8 rows written**), then read through the authenticated admin endpoint
`GET /api/admin/demand-rollup` (blanket §2 admin guard; login as the seeded admin). Kyoto strict framing is **n=29**
(Q9 canonical); the loose n=53 appears nowhere below.

### Kyoto `unmet_demand_slip` — stored cell vs hand derivation

**Rendered row (admin read):**

```
{ "marketSlug": "kyoto", "date": "2026-10-01", "metric": "unmet_demand_slip",
  "value": null, "n": 3, "status": "no_data" }
```

**Stored value (DB):** `{ "count": 3, "amount": 240, "valuedCount": 3 }`, `source_row_count = 3`.

**Hand derivation from the same R16-filtered source query** (open items `routing_status IN
('in_planning','with_expert')` joined to trips + users, `WHERE (email IS NULL OR email NOT ILIKE '%@traveloure.test')
AND author_id IS NULL AND market_slug = 'kyoto'`):

| market_slug | start_date | estimated_cost | routing_status |
|-------------|------------|----------------|----------------|
| kyoto       | 2026-10-01 | 80.00          | in_planning    |
| kyoto       | 2026-10-01 | 80.00          | in_planning    |
| kyoto       | 2026-10-01 | 80.00          | in_planning    |

- Market-local date: `2026-10-01T00:00:00Z` → Asia/Tokyo = **2026-10-01** (09:00 JST, same calendar day). ✅
- Inventory check: zero bookable `vendor_availability_slots` rows for any Kyoto-city service on 2026-10-01 ⇒ the
  (kyoto, 2026-10-01) key is absent from the inventory set ⇒ all 3 rows are slips. ✅
- **count = 3**; all 3 rows priced at $80 ⇒ **amount = 240**, **valuedCount = 3**. Matches the stored cell exactly. ✅
- **Floor behaviour is correct, not a bug:** n=3 < MARKET floor (10) ⇒ the read renders `no_data` (§13); the stored
  row is untouched. This is the suppression tier doing its job on a genuinely thin cell.

**Honesty note (§13, reported not silently "fixed"):** the 3 source rows belong to
`optv2-…@journey-w1.test` — journey-suite residue, not organic demand. R16 as ratified excludes only
`%@traveloure.test` + authoring trips, so these rows legitimately pass the predicate as written. Whether
`%@journey-w1.test` (or `%.test` generally) joins the R9 pattern list is a lane ruling, not something this pass
decides. Either way the cell is floor-suppressed today, so no partner-facing figure is affected.

### Kyoto `slip_funnel` — stored cell vs hand derivation

**Rendered row (admin read):** `status: "ok"`, `n = 27`, date `2026-08-15`, value:

```
stageEntries:      { purchased: 23, ready_for_checkout: 27 }
transitions:       { "in_planning->ready_for_checkout": 27, "ready_for_checkout->purchased": 23,
                     "payment_pending->confirmed": 20 }
transitionRates:   { "in_planning->ready_for_checkout": 0, "ready_for_checkout->purchased": 0.8519,
                     "payment_pending->confirmed": 0 }
avgHoursInStage:   { in_planning: null, with_expert: null, ready_for_checkout: 0, purchased: null }
removed: 0        removalDataSince: null        itemsObserved: 27
```

**Hand derivation from the same R16-filtered diary query** (`item_transition_log` joined to trips + users, same
predicate, `market_slug = 'kyoto'` — 70 events over 27 distinct items, all on 2026-08-14 UTC). SQL aggregates over the
identical source:

| what | key | value |
|------|-----|-------|
| stage entries (distinct items entering) | ready_for_checkout | 27 |
| stage entries | purchased | 23 |
| transition count | in_planning->ready_for_checkout | 27 |
| transition count | ready_for_checkout->purchased | 23 |
| transition count | payment_pending->confirmed | 20 |
| items observed (distinct item_id) | — | 27 |
| removed (`item_removed` events) | — | 0 |
| latest event (UTC) | — | 2026-08-14 19:12:00 |

- `ready_for_checkout->purchased` rate: 23 ÷ entries[ready_for_checkout] (27) = 0.851851… → rounded **0.8519**. ✅
- `in_planning->ready_for_checkout` and `payment_pending->confirmed` rates: their `from` stages are never a
  `toStatus` in this diary (in_planning is only ever a source; payment_pending is not a ladder stage) ⇒
  entries = 0 ⇒ guarded to **0**, not NaN (§13). ✅
- `avgHoursInStage.ready_for_checkout = 0` — checkout flips happen seconds after the rfc entry (e.g. 17:46:18 →
  17:46:23), mean dwell rounds to 0.00 h. ✅
- Storage date **2026-08-15** = market-local (Asia/Tokyo) date of the latest diary event, 2026-08-14 19:12 UTC =
  2026-08-15 04:12 JST — the funnel's one reserved "as of" date per market. ✅
- `removed = 0`, `removalDataSince = null` — no `item_removed` events exist yet for real Kyoto trips (the diary
  writer only went live in Phase 2A), so the metric honestly states it has no removal window. ✅
- n = 27 ≥ MARKET floor (10) ⇒ renders `ok`. ✅

Every stored/rendered figure matches its hand re-derivation from the identical R16-filtered source rows. The
fixture-proven arithmetic above and the real-data path agree.
