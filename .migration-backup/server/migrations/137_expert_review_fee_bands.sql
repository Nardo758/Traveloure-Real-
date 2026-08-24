-- 137: Expert-review tier fees → fee_bands (closes the §14 A1 filed follow-up; F3 of the
-- revenue-model review). The $50 / $50+5% / $100+8% tier constants relocated from the client by
-- A1 become admin-editable config; resolveExpertReviewAmount reads these bands and falls back to
-- the same code constants when a row is absent/invalid (the coordination-floor safe-failure
-- posture, §8). Flat bands are DOLLARS; percent bands are FRACTIONS of the variant totalCost.
-- Idempotent ON CONFLICT DO NOTHING — never overwrites admin-tuned values. No CHECK/schema
-- change → no publish-time push trap.

INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, description, is_active)
VALUES
  ('expert_review_flat',        'flat',    50.00, NULL, NULL,
   'Expert Review Only tier — flat fee (USD). Fallback default matches the pre-137 code constant.', true),
  ('expert_review_book_flat',   'flat',    50.00, NULL, NULL,
   'Expert Review & Book tier — flat component (USD).', true),
  ('expert_review_book_percent','percent',  0.05, 0.00, 0.15,
   'Expert Review & Book tier — percent of variant total cost.', true),
  ('full_concierge_flat',       'flat',   100.00, NULL, NULL,
   'Full Concierge tier — flat component (USD).', true),
  ('full_concierge_percent',    'percent',  0.08, 0.00, 0.20,
   'Full Concierge tier — percent of variant total cost.', true)
ON CONFLICT (band_key) DO NOTHING;
