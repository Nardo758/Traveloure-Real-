# 3.3 Item 1.2 — Calendar ghost slots fixture + R21 populate-check (⚑ Replit)

**Lane:** `lane/partner-demand-surfaces` · **Step 3.3 / Item 1.2** · **⚑ Replit** (dev DB).
**Surface:** `/provider/calendar` — the month grid gains a **ghost** chip kind (dashed gold), a
**month-header demand aggregate**, and a tap → the availability editor with the requested window
preselected. Ghost source is the SAME L6 rollup the Market Research page reads
(`readPartnerDemandRollup`, own_book scope) — no parallel demand path.

**What the ghost is:** a day in one of the caller's markets with OPEN traveler demand
(`unmet_demand_slip`, kind `requested`) and NO bookable inventory — a slot they could open. It is
**market-level** and the copy says so ("N requested in Kyoto"), never "requested from you".

---

## Part A — ghost chip fixture

### Step 1 — seed a MARKET-LEVEL requested slip cell (future date, ≥ own_book floor 5)

`service_id` and `partner_id` are **NULL** (market-level — a per-service cell would be a funnel
child, not a ghost). `source_row_count` = 7 clears the own_book floor (5). The date is in the
future so the read classifies it `requested` (a forward window), not `missed`.

```sql
INSERT INTO partner_demand_rollup (market_slug, date, metric, partner_id, service_id, value, source_row_count)
VALUES (
  'kyoto', (CURRENT_DATE + INTERVAL '10 days')::date, 'unmet_demand_slip', NULL, NULL,
  '{"count":7,"amount":null,"valuedCount":0}'::jsonb, 7
)
ON CONFLICT (market_slug, date, metric, partner_id, service_id) DO UPDATE
  SET value = EXCLUDED.value, source_row_count = EXCLUDED.source_row_count, computed_at = now();
```

Precondition: the logged-in provider must OWN a service whose city resolves to `kyoto` (so the
own_book read includes the kyoto market). The seeded kyoto-interpreter provider qualifies.

### Step 2 — observe on `/provider/calendar` (as that provider)

Navigate to the month containing `CURRENT_DATE + 10 days`. **PASS =**
- that day shows a **dashed gold** chip reading **"7 requested in Kyoto · no open slot"**
  (testid `event-calendar-ghost-kyoto-<date>`);
- the month header shows **"7 requested · 1 day with no open slot"**
  (testid `text-calendar-demand-aggregate`);
- the legend carries a **"Requested (no slot)"** dashed swatch;
- clicking the ghost chip lands on `/provider/availability?date=<date>` with the add-slot form
  **open and the date prefilled** (scheduled listing) or the add-range form's start prefilled
  (property).

### Step 3 — honesty negatives

- Seed a second cell for the SAME market with `source_row_count = 3` (below the own_book floor 5) on
  `CURRENT_DATE + 11 days` → that day shows **no ghost** (suppressed, §13).
- Seed a cell with a PAST date (`CURRENT_DATE − 5 days`, count 7) → **no ghost** (that is `missed`,
  not `requested`; ghosts are forward windows only).
- Seed a per-service cell (`service_id` set) → **no ghost** (funnel child, not a market ghost).

### Step 4 — cleanup

```sql
DELETE FROM partner_demand_rollup
WHERE metric = 'unmet_demand_slip' AND market_slug = 'kyoto' AND partner_id IS NULL
  AND service_id IS NULL AND date >= (CURRENT_DATE - INTERVAL '5 days')::date
  AND date <= (CURRENT_DATE + INTERVAL '11 days')::date;
```

---

## Part B — R21 pressure-shading populate-check (the flag's unblock)

Calendar pressure shading ships **OFF** behind `SHOW_PRESSURE_SHADING` in
`client/src/pages/provider/calendar.tsx`, because it must shade high-pressure weeks from REAL
forward calendar-pressure rows, never an empty/partial table (§13). **Run this one query** before
flipping the flag:

```sql
-- Does trend_scores carry rows for the operating markets? (written by trend-score.service.ts)
SELECT count(*) AS trend_rows,
       count(*) FILTER (WHERE seasonal_expected IS NOT NULL) AS with_seasonal
FROM trend_scores;
```

- **Empty (0 rows)** ⇒ keep `SHOW_PRESSURE_SHADING = false`. The unblock is: run the trend scoring
  job so `trend_scores` is populated with forward calendar-pressure (season + holiday/festival).
- **Populated** ⇒ wire the decomposed calendar-pressure read into `pressureShade()` and flip the
  flag. **Never** render the composite `trend_score` or `crowd_band` on this surface (R21).

Ghost slots (Part A) are independent of this flag and ship live regardless of the trend table state.
