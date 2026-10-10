-- 366 — LiteAPI hotel margin bands (ledger `2026-10-10-s1-d2-liteapi-rates`; brief
-- docs/planning/briefs/s1-d2-liteapi-rates.md). DATA ONLY: no DDL, no CHECK, no index, nothing to declare.
-- HELD: merges only with "Migration 366 SQL approved — Leon" on the S1-d-2 PR.
--
-- Two percent bands the rates service reads BY NAME (LD 8: no margin literal in code). Insert-if-missing;
-- an admin-tuned row is never overwritten, and a second run is a no-op. Values are Leon's (S1-d-2 ruling 1).
--   hotel_margin_public   markup on a stay's public rate, floored at LiteAPI's suggested selling price
--   hotel_margin_bundle   markup inside a bundle (seeded for the bundle lane; read by nothing yet)
-- Both are declared optional in RESOLVER_FEE_BAND_REQUIREMENTS with fallback 0 (sell at the SSP).
INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, display_name, description, is_active)
VALUES
  ('hotel_margin_public', 'percent', 0.12, NULL, NULL, 'Hotel margin — public rate',
   'Markup on a LiteAPI stay''s public rate, shown on the stay card. The shown price is never below the suggested selling price. Off ⇒ no margin (sell at the SSP).', true),
  ('hotel_margin_bundle', 'percent', 0.06, NULL, NULL, 'Hotel margin — bundle',
   'Markup on a LiteAPI stay inside a bundle. Seeded for the bundle lane; nothing reads it yet. Off ⇒ no margin.', true)
ON CONFLICT (band_key) DO NOTHING;
