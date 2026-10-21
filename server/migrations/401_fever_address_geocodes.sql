-- 401 — fever_address_geocodes (ledger `2026-10-21-blog-checks-fever-area`, renumbered in
-- `2026-10-21-blog-fever-followup` so the hide-flag migration can take 400).
--
-- A Fever event with an address and no coordinates is geocoded once through OpenStreetMap Nominatim.
-- The answer is kept permanently, including a miss (null latitude/longitude), so the same address is
-- never asked again. A network failure is not a row. No DEFAULT, no CHECK, no extra index, no backfill.
-- Declared in shared/schema.ts (deploy-push durability). IF NOT EXISTS, so a second run is a no-op.
CREATE TABLE IF NOT EXISTS fever_address_geocodes (
  address_key text PRIMARY KEY,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  attribution text,
  looked_up_at timestamp
);
