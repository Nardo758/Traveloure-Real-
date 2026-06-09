---
name: Migration chain root cause — null id + missing column
description: Three migration bugs that block the full 001-050 chain from applying on a fresh dev DB; all fixed on main 2026-06-09.
---

## The rule
Any SQL migration that INSERTs into a table whose `id` column has no DEFAULT (no `gen_random_uuid()` or sequence) will FATAL with "null value in column id". Any INSERT where VALUES rows have fewer expressions than target columns will FATAL with "INSERT has more target columns than expressions".

## The three bugs (all fixed)
1. `033_phase1_seed_fee_bands_and_settings.sql` — two INSERT blocks each had 7 VALUES entries for 8 declared columns; `is_active` was missing. Fixed by appending `, true` to every VALUES row in both blocks.
2. `034_phase1_reconcile_service_categories.sql` — INSERT into `service_categories` without `id` col; table has no DEFAULT. Fixed by prepending `ALTER TABLE service_categories ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;`.
3. `042_phase3_seed_neighborhoods.sql` — INSERT into `city_neighborhoods` without `id` col; same no-DEFAULT bug. Fixed by prepending `ALTER TABLE city_neighborhoods ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;`.

## Why it wasn't obvious
The migration runner (`run-migrations.ts`) does `throw err` on any failure — fail-fast stops all subsequent migrations. So 034 failing means 035-050 never run, and `upsell_impressions` (049) and `category_key` seeding (034) never land. The symptom looks like "tables missing" but the root cause is the early FATAL.

## How to apply
Before writing a seed migration that INSERTs into a table with a varchar/text `id` column: check `information_schema.columns` for `column_default`. If NULL, prepend the ALTER TABLE SET DEFAULT statement to the same migration file.
