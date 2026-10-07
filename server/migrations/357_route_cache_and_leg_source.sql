-- 357 — step 9a routing engine (ledger `2026-10-07-step9a-routing-engine`; surface spec §14.1; step 9
-- brief L2 as amended by ruling 4, ruling 3). SQL HELD for the founder's ruling before merge. ADDITIVE
-- ONLY. No function, trigger, CREATE OR REPLACE or DO block. IF NOT EXISTS everywhere, so a second run
-- is a no-op. Both objects are declared in shared/schema.ts (deploy-push durability rule).
--
-- (1) route_cache — a NEW table, born empty, with only its PK (the new-table rule). One row per routed
--     leg answer, shared across plans. It holds the five facts the decision-maker allowed (Oct 7, 2026)
--     and NOTHING else: duration, distance, line name, fare and provenance — no polyline, no steps.
--   cache_key        `<origin>|<destination>|<mode>|h<local hour>`; a stop is `place:<Google place ID>`,
--                    else `pt:<lat>,<lng>` rounded to 4 decimals (ruling 4). Built by shared/routing-engine.ts.
--   origin_key / destination_key / mode / hour_bucket — the key's parts, for reading the table by eye
--   duration_min / distance_m — the routed answer
--   line             transit line name(s), else NULL
--   fare_amount / fare_currency — only when the source gave a fare, in its own currency (L6); else NULL
--   source           who answered: `google_routes` | `stub`
--   checked_at       when the source answered. Freshness is read against ROUTE_CACHE_TTL_DAYS (config,
--                    default 30) at READ time, so no expiry is stored and a TTL change applies at once.
CREATE TABLE IF NOT EXISTS route_cache (cache_key varchar(300) PRIMARY KEY);
ALTER TABLE route_cache ADD COLUMN IF NOT EXISTS origin_key varchar(140);
ALTER TABLE route_cache ADD COLUMN IF NOT EXISTS destination_key varchar(140);
ALTER TABLE route_cache ADD COLUMN IF NOT EXISTS mode varchar(20);
ALTER TABLE route_cache ADD COLUMN IF NOT EXISTS hour_bucket integer;
ALTER TABLE route_cache ADD COLUMN IF NOT EXISTS duration_min integer;
ALTER TABLE route_cache ADD COLUMN IF NOT EXISTS distance_m integer;
ALTER TABLE route_cache ADD COLUMN IF NOT EXISTS line text;
ALTER TABLE route_cache ADD COLUMN IF NOT EXISTS fare_amount numeric(12, 2);
ALTER TABLE route_cache ADD COLUMN IF NOT EXISTS fare_currency varchar(3);
ALTER TABLE route_cache ADD COLUMN IF NOT EXISTS source varchar(40);
ALTER TABLE route_cache ADD COLUMN IF NOT EXISTS checked_at timestamp;

-- (2) transport_legs.source — which routing source computed this leg (`google_routes` | `stub`).
--     NULL = not a routing-engine leg (an expert's, the variant optimizer's, a legacy row). Readers
--     show an engine leg to a traveler only on a plan that passes `planGetsRoutedLegs` (ruling 3),
--     and an expert's confirmed leg for the same pair wins. Nullable, no DEFAULT / CHECK / index / FK,
--     no backfill — no new `proposal_status` value (that column carries migration 154's CHECK).
ALTER TABLE transport_legs ADD COLUMN IF NOT EXISTS source varchar(30);
