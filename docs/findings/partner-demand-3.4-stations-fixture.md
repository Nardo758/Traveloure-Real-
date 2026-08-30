# 3.4 Item 2 — Today card + Performance→Demand fixture (⚑ Replit)

**Lane:** `lane/partner-demand-surfaces` · **Step 3.4 / Item 2** · **⚑ Replit** (dev DB).
Two provider surfaces read the SAME L6 rollup (own_book scope, server-enforced) — no parallel
demand path. **2.2's advisor prompt is human-read-before-merge.**

- **2.1 Today card** (`/provider/dashboard`): ONE card, the highest-value demand signal, chosen
  SERVER-SIDE (`/api/me/demand-rollup/top`). Gold edge, deep-links to Market Research. R19 — a
  service signal shows $, a stay signal shows trips/nights and NEVER a dollar figure.
- **2.2 Performance → Demand tab** (`/provider/performance?tab=demand`): an "Unmet demand" card with
  month figures (requested vs missed, shown separately — R20) + a funnel line (server `stallStage`)
  + a link to Market Research. The Business Advisor's assembled facts gain `demandRollup` with each
  figure labeled by kind + unit and a `rulesNote` (R19/R20) riding into the prompt.

---

## Step 1 — seed floor-clearing REQUESTED demand for the provider's market (own_book floor 5)

Requires the logged-in provider to own a service whose city resolves to `kyoto`. Seeds a market-level
requested slip cell with $ (service-shaped) and a stay cell (count-only), plus a market funnel with a
clear stall — all future/near-dated so they classify `requested`.

```sql
-- service-shaped requested slip ($) — drives the Today card headline + the tab's Requested $ figure
INSERT INTO partner_demand_rollup (market_slug, date, metric, partner_id, service_id, value, source_row_count)
VALUES ('kyoto', (CURRENT_DATE + INTERVAL '7 days')::date, 'unmet_demand_slip', NULL, NULL,
        '{"count":9,"amount":1350,"valuedCount":9}'::jsonb, 9)
ON CONFLICT (market_slug, date, metric, partner_id, service_id) DO UPDATE
  SET value = EXCLUDED.value, source_row_count = EXCLUDED.source_row_count, computed_at = now();

-- stay-shaped requested demand (count-only, R19 — NO $)
INSERT INTO partner_demand_rollup (market_slug, date, metric, partner_id, service_id, value, source_row_count)
VALUES ('kyoto', (CURRENT_DATE + INTERVAL '8 days')::date, 'unmet_demand_stay', NULL, NULL,
        '{"trips":6,"nights":18,"travelers":null,"travelersCaptured":0}'::jsonb, 6)
ON CONFLICT (market_slug, date, metric, partner_id, service_id) DO UPDATE
  SET value = EXCLUDED.value, source_row_count = EXCLUDED.source_row_count, computed_at = now();

-- market-level funnel with a clear stall (with_expert → ready loses the most) — drives the tab's funnel line
INSERT INTO partner_demand_rollup (market_slug, date, metric, partner_id, service_id, value, source_row_count)
VALUES ('kyoto', CURRENT_DATE, 'slip_funnel', NULL, NULL,
        '{"stageEntries":{"in_planning":20,"with_expert":18,"ready_for_checkout":4,"purchased":3},
          "transitions":{},"transitionRates":{},"avgHoursInStage":{},"removed":2,"removalDataSince":"2026-08-05","itemsObserved":20}'::jsonb,
        20)
ON CONFLICT (market_slug, date, metric, partner_id, service_id) DO UPDATE
  SET value = EXCLUDED.value, source_row_count = EXCLUDED.source_row_count, computed_at = now();
```

## Step 2 — Today card (`/provider/dashboard`)

**PASS =** ONE gold-edged card (testid `card-today-demand`) reading
**"$1,350 in requested Kyoto experiences with no open slot"** (testid `text-today-demand-headline`),
sub-line "9 planned experiences · your highest-value opening today", "See demand →" linking to
`/provider/market-research`. The service $ signal wins over the stay signal (R19 — stay carries no $,
so it can't out-rank a $ figure).

**Stay-fallback check:** delete the slip `$` row (keep only the stay row) → the card flips to
**"6 trips seeking a Kyoto stay"** / "18 nights requested · no on-platform stay yet" — and shows **no
dollar figure** anywhere (R19). Restore the slip row after.

**Below-floor / empty check:** with no floor-cleared requested demand, the card does **not render**
(§13 — never an empty or zero card, never a feed).

## Step 3 — Performance → Demand (`/provider/performance?tab=demand`)

**PASS =** an "Unmet demand" card (testid `card-demand-rollup`) with, for kyoto:
- **Requested** $1,350 · 9 experiences, and "6 stay trips · 18 nights" (testid `rollup-requested-kyoto`);
- **Missed** shown as a SEPARATE column (testid `rollup-missed-kyoto`) — never summed with requested (R20);
- a funnel line "Biggest drop-off: With expert → Ready (14 of 18)" (testid `rollup-funnel-kyoto`);
- "See the full demand map →" linking to `/provider/market-research`.

## Step 4 — advisor prompt facts (human read; `?factsOnly=1` seam, no AI call)

```bash
curl -sS -X POST "$APP_URL/api/me/business-advisor?factsOnly=1" -b "$PROVIDER_COOKIE" | jq '.facts.demandRollup'
```
**PASS =** `demandRollup.rulesNote` states the R19 (never blend units) and R20 (never sum
requested+missed) invariants verbatim, and `demandRollup.markets[].requested/.missed` each carry
`serviceDollars` + `serviceCount` + `stayTrips` + `stayNights` — the labels ride INTO the prompt so
the narration cannot blend a stay into a dollar figure or add requested to missed. **Human read:**
confirm the assembled facts + system-prompt rule read honestly before merge.

## Step 5 — cleanup

```sql
DELETE FROM partner_demand_rollup
WHERE market_slug = 'kyoto' AND partner_id IS NULL AND service_id IS NULL
  AND date >= (CURRENT_DATE - INTERVAL '1 day')::date AND date <= (CURRENT_DATE + INTERVAL '9 days')::date
  AND metric IN ('unmet_demand_slip','unmet_demand_stay','slip_funnel');
```
