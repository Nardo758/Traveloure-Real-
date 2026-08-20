# 3.3 Item 1.1 — Catalog funnel rows fixture (⚑ Replit visual proof + human read)

**Lane:** `lane/partner-demand-surfaces` · **Step 3.3 / Item 1.1** · **⚑ Replit** (dev DB).
**Surface:** `/provider/services` (Catalog, Manage view) — the `.listing` row gains a per-service
**demand funnel** under the meta line, a **stall** highlight (server-chosen), a **removed** badge in
the right column, and an honest **below-floor** line for sparse listings.

**Why a fixture:** the funnel row renders only when the L6 rollup holds a per-service `slip_funnel`
cell for one of the caller's OWN listings. Dev demand is sparse, so we seed two cells directly (the
read path + floor/stall wiring is all that's under test here; the nightly compute job is proven
elsewhere). This is the **human-read-before-merge** step for 1.1.

**What it proves (maps to the dispatch):**
- funnel bar under the meta line, per service (own_book scope — server-enforced to the caller's listings);
- **stall segment = largest stage-to-stage drop, computed SERVER-SIDE** (`stallStage` on the read row);
  the page renders `↓<dropped>` at that one segment and does NO client math;
- **removal badge** in the right column with `removalDataSince` in its tooltip;
- **below-floor** listing renders the honest line verbatim — "Appears in N planned trips — shows at 5"
  — with N and the floor (5) both from the server (no client literal);
- scope: a cell for a service the caller does NOT own never appears (R27 own_book read filter).

---

## Step 0 — pick a provider and TWO of their own service IDs + their market

```sql
-- The seeded kyoto-interpreter provider owns ≥3 services (phase-d-kyoto-vendors.seed.ts).
SELECT ps.id, ps.service_name, ps.city
FROM provider_services ps
JOIN users u ON u.id = ps.user_id
WHERE u.email = 'kyoto-interpreter@traveloure.test'
ORDER BY ps.created_at
LIMIT 3;
-- Call the first id <SVC_A> (gets a floor-clearing funnel), the second <SVC_B> (below-floor line).
-- The market slug the read scopes to is resolveMarketSlug(city) — for a Kyoto city this is 'kyoto'.
```

## Step 1 — seed a floor-CLEARING per-service funnel cell for SVC_A (visible bar + stall + removal)

`stageEntries` 20 → 18 → 4 → 3: the biggest fall is **with_expert → ready_for_checkout** (−14), so the
server's `computeStallStage` marks THAT segment and the row shows `↓14` there. `source_row_count` = 20
clears the own_book floor (5). `removed` = 6 with a `removalDataSince` drives the right-column badge.

```sql
INSERT INTO partner_demand_rollup (market_slug, date, metric, partner_id, service_id, value, source_row_count)
VALUES (
  'kyoto', CURRENT_DATE, 'slip_funnel', NULL, '<SVC_A>',
  '{"stageEntries":{"in_planning":20,"with_expert":18,"ready_for_checkout":4,"purchased":3},
    "transitions":{},"transitionRates":{},"avgHoursInStage":{},
    "removed":6,"removalDataSince":"2026-08-01","itemsObserved":20}'::jsonb,
  20
)
ON CONFLICT (market_slug, date, metric, partner_id, service_id) DO UPDATE
  SET value = EXCLUDED.value, source_row_count = EXCLUDED.source_row_count, computed_at = now();
```

## Step 2 — seed a BELOW-FLOOR per-service funnel cell for SVC_B (honest line, no bar)

`source_row_count` = 3 is below the own_book floor (5) ⇒ the read nulls the value and the page renders
the honest line "Appears in 3 planned trips — shows at 5" instead of a bar (§13 show-the-N).

```sql
INSERT INTO partner_demand_rollup (market_slug, date, metric, partner_id, service_id, value, source_row_count)
VALUES (
  'kyoto', CURRENT_DATE, 'slip_funnel', NULL, '<SVC_B>',
  '{"stageEntries":{"in_planning":3,"with_expert":1},"transitions":{},"transitionRates":{},
    "avgHoursInStage":{},"removed":0,"removalDataSince":null,"itemsObserved":3}'::jsonb,
  3
)
ON CONFLICT (market_slug, date, metric, partner_id, service_id) DO UPDATE
  SET value = EXCLUDED.value, source_row_count = EXCLUDED.source_row_count, computed_at = now();
```

## Step 3 — observe on the page (log in as the provider, open `/provider/services`, Manage view)

**PASS =**
- SVC_A's `.listing` row shows, under the meta line: `20 Planning › 18 With expert ↓14 4 Ready › 3 Booked`
  (testid `demand-funnel-<SVC_A>`; the `↓14` carries testid `demand-stall-<SVC_A>` and a "Biggest
  drop-off here: 14 of 18 don't continue" tooltip) — the stall sits on the with_expert→ready segment,
  NOT computed on the client.
- SVC_A's right column shows a **`6 removed`** badge (testid `badge-removed-<SVC_A>`) whose tooltip
  reads "Removal data since 2026-08-01".
- SVC_B's row shows **"Appears in 3 planned trips — shows at 5"** (testid `text-demand-belowfloor-<SVC_B>`)
  and NO funnel bar.
- A third service with no seeded cell shows **no funnel row at all** (§13 honest absence).

**Scope negative (optional):** seed a `slip_funnel` cell with `service_id` = some OTHER provider's
service id and `market_slug='kyoto'`; log in as kyoto-interpreter → that row must NOT appear (own_book
read filters to owned service ids). This is the R27/own-book scope proof.

## Step 4 — cleanup

```sql
DELETE FROM partner_demand_rollup
WHERE metric = 'slip_funnel' AND market_slug = 'kyoto' AND date = CURRENT_DATE
  AND service_id IN ('<SVC_A>', '<SVC_B>');
```

**Screenshots for the human read:** the SVC_A row (bar + `↓14` stall + `6 removed` badge) and the
SVC_B below-floor line, both in the Manage list.
