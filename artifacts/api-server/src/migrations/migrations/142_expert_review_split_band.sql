-- 142: R6 (ratified Jul 26, 2026) — expert-compensation split on completed review work.
-- The expert-review fee is captured 100%-platform at payment (F3, migration 137 bands); when the
-- assigned expert COMPLETES the request, they are credited this share of the paid fee via the
-- earnings ledger (born held, escrow spine) and the capture-time platform_revenue row is re-split
-- so the platform's net take is the remainder (default 25%). Admin-editable per the standing
-- "all fees adjustable from the admin panel" directive — the code constant 0.75 survives only as
-- the safe-failure fallback (§8 coordination-floor posture).
-- Idempotent ON CONFLICT DO NOTHING — never overwrites an admin-tuned value. No CHECK/schema
-- change → no publish-time push trap.

INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, description, is_active)
VALUES
  ('expert_review_expert_share', 'percent', 0.75, 0.00, 1.00,
   'Expert share of a PAID expert-review fee, credited to the reviewing expert when the request completes (R6). Platform keeps the remainder (default 25%).', true)
ON CONFLICT (band_key) DO NOTHING;
