# 3.5 Item 3 — Admin demand strip fixture (⚑ Replit) — HUMAN READ before merge

**Lane:** `lane/partner-demand-surfaces` · **Step 3.5 / Item 3** · **⚑ Replit** (dev DB).
Four extensions, **no new pages**, all under the §2 blanket `/api/admin` guard (admin/Leon-only):

- **markets.tsx** — "Cross-market unmet demand" card: `/api/admin/demand-rollup` (cross_partner
  floor 10, R27; includes the `__unmapped__` bucket, R13). Requested/missed shown separately;
  below-floor markets named, never numbered (§13).
- **data.tsx** — "Demand rollup health" card: `/api/admin/demand-rollup/health` (row counts +
  freshness; §17 "silence must be distinguishable" — a null lastComputedAt reads "never run").
- **fee-bands.tsx** — "Demand suppression floors (R27)" card: `/api/admin/demand-floors`
  (READ-ONLY from config, no client literals) + a "Recruitment one-pager" control whose generation
  is **R18-gated to Phase 4** (`/api/admin/demand-one-pager` is a stub returning "awaiting Phase 4").

**Audience floor:** every admin view reads at the **cross_partner** floor (10) — the admin is not
the party a figure is about (R27). **Config-only:** floors are shown from `demand-floors.config.ts`,
never editable here (a Leon-editable, audit-logged floor control needs a floors table — a separate
ratified change; noted, not built).

---

## Step 1 — seed cross-partner-clearing demand for a mapped market AND the unmapped (Lisbon) cluster

`source_row_count` ≥ 10 clears the cross_partner floor. The `__unmapped__` row carries the real
Lisbon-cluster shape (destinations that don't resolve to an operating market, R13).

```sql
-- mapped market, requested service $ (clears cross_partner floor 10)
INSERT INTO partner_demand_rollup (market_slug, date, metric, partner_id, service_id, value, source_row_count)
VALUES ('kyoto', (CURRENT_DATE + INTERVAL '5 days')::date, 'unmet_demand_slip', NULL, NULL,
        '{"count":14,"amount":2100,"valuedCount":14}'::jsonb, 14)
ON CONFLICT (market_slug, date, metric, partner_id, service_id) DO UPDATE
  SET value = EXCLUDED.value, source_row_count = EXCLUDED.source_row_count, computed_at = now();

-- unmapped bucket (Lisbon et al.) — R13; clears the cross_partner floor
INSERT INTO partner_demand_rollup (market_slug, date, metric, partner_id, service_id, value, source_row_count)
VALUES ('__unmapped__', (CURRENT_DATE + INTERVAL '5 days')::date, 'unmet_demand_slip', NULL, NULL,
        '{"count":11,"amount":1600,"valuedCount":11}'::jsonb, 11)
ON CONFLICT (market_slug, date, metric, partner_id, service_id) DO UPDATE
  SET value = EXCLUDED.value, source_row_count = EXCLUDED.source_row_count, computed_at = now();

-- a market BELOW the cross_partner floor (n=6): must be named, never numbered
INSERT INTO partner_demand_rollup (market_slug, date, metric, partner_id, service_id, value, source_row_count)
VALUES ('goa', (CURRENT_DATE + INTERVAL '5 days')::date, 'unmet_demand_slip', NULL, NULL,
        '{"count":6,"amount":700,"valuedCount":6}'::jsonb, 6)
ON CONFLICT (market_slug, date, metric, partner_id, service_id) DO UPDATE
  SET value = EXCLUDED.value, source_row_count = EXCLUDED.source_row_count, computed_at = now();
```

## Step 2 — observe (as an admin session)

- **`/admin/markets`** → "Cross-market unmet demand" (testid `card-admin-demand`): rows for **Kyoto**
  ($2,100 · 14 exp) and **Unmapped destinations** ($1,600 · 11 exp, amber, "outside the operating
  markets"). A footer line "Below the cross-partner floor of 10 (omitted, §13): goa" (testid
  `text-admin-demand-belowfloor`) — goa is NAMED, its number never shown.
- **`/admin/data`** → "Demand rollup health" (testid `card-rollup-health`): Last computed timestamp,
  total rows, distinct markets, and a per-metric count (`unmet_demand_slip`, …). With the table
  emptied, Last computed reads **"never run"** (not a fabricated date).
- **`/admin/fee-bands`** → "Demand suppression floors (R27)" (testid `card-demand-floors`): three
  tiers — Own book ≥ 5, Cross-partner ≥ 10, Sold ≥ 25 — each with its audience-scope wording, marked
  read-only/config-set. The "Recruitment one-pager" card's **Generate** button (testid
  `button-generate-one-pager`) toasts **"One-pager generation is disabled until Phase 4
  authorization (R18)…"** and produces no artifact.

## Step 3 — auth negative (Leon-only)

Hit `/api/admin/demand-rollup`, `/api/admin/demand-rollup/health`, `/api/admin/demand-floors`, and
`POST /api/admin/demand-one-pager` **without** an admin session → all return 401/403 (the §2 blanket
`/api/admin` guard), never data.

## Step 4 — cleanup

```sql
DELETE FROM partner_demand_rollup
WHERE metric = 'unmet_demand_slip' AND partner_id IS NULL AND service_id IS NULL
  AND date = (CURRENT_DATE + INTERVAL '5 days')::date
  AND market_slug IN ('kyoto','__unmapped__','goa');
```

**Human read:** confirm the cross-partner floor wording, the unmapped-bucket honesty, the health
"never run" state, and that the one-pager control cannot generate anything before merge.
