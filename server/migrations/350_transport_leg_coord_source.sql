-- Ledger `2026-10-04-leg-google-coords` (decision-maker ruling, Oct 4, 2026: LD 57 extends to
-- transport_legs). SQL APPROVED by the decision-maker, Oct 4, 2026. ADDITIVE ONLY: two nullable columns on
-- transport_legs. No DEFAULT, no CHECK, no index, no FK, no backfill. Declared in shared/schema.ts
-- (deploy-push durability rule). IF NOT EXISTS so a second run is a no-op.
--   coord_source      `google` when a from/to point on the leg came from a Google Places location
--                     fact (app-enforced value set); NULL = no Google coordinate recorded
--   coord_fetched_at  that fact's fetch time, the start of its 30-day cache window
ALTER TABLE transport_legs ADD COLUMN IF NOT EXISTS coord_source varchar(20);
ALTER TABLE transport_legs ADD COLUMN IF NOT EXISTS coord_fetched_at timestamp;
