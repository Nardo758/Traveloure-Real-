-- 220: Seed the full set of currencies the budget converter supports.
-- Migration 217 only seeded EUR, GBP, JPY, AUD, SGD; the budget service previously
-- supported CAD, CHF, CNY, INR, MXN, BRL, THB as well. These rows are added here so
-- conversions for those currencies do not fail with an unsupported-currency error.
-- The daily FX refresh scheduler is also updated (same commit) to fetch and overwrite
-- these with live rates. Idempotent: ON CONFLICT DO NOTHING.

INSERT INTO fx_rates (currency_code, rate_to_usd) VALUES
  ('CAD', 1.36),
  ('CHF', 0.88),
  ('CNY', 7.24),
  ('INR', 83.12),
  ('MXN', 17.15),
  ('BRL', 4.97),
  ('THB', 35.50)
ON CONFLICT (currency_code) DO NOTHING;
