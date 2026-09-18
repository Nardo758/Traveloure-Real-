-- 311: Locked Decision 51 (ledger `2026-09-18-concierge-fee-cap-split`) — Booking Concierge fee
-- CAP and expert/platform SPLIT. Data-only: no ALTER, no CHECK, no shared/schema.ts change, so
-- preflight-prod-constraints.cjs needs no manifest entry.
--
-- (a) The cap the admin panel already edits (`expert_concierge_booking.max_amount`) is the ONE
--     cap `resolveConciergeBookingFee` applies — never the dead `concierge:booking_cap_cents`
--     duplicate below. Ratified value $40.00 (formerly 258's 4000-cent band). IDEMPOTENT and
--     never clobbers an admin-set cap: only fills a NULL.
UPDATE fee_bands
   SET max_amount = 40.00
 WHERE band_key = 'expert_concierge_booking'
   AND max_amount IS NULL;

-- (b) Retire the two migration-258 duplicates. KEPT, never deleted (§13 — a row that was seeded
--     was seeded); is_active=false so no resolver can pick them up (nothing reads them today —
--     fee-band-admin-guards D4b/D4c).
UPDATE fee_bands
   SET is_active = false,
       description = 'retired 2026-09-18-concierge-fee-cap-split: duplicate of expert_concierge_booking'
 WHERE band_key IN ('concierge:booking_pct', 'concierge:booking_cap_cents');

-- (c) The expert/platform split on the Booking Concierge fee, minted at COMPLETION (R6 posture,
--     migration-142 precedent — expert_review_expert_share). Admin-editable; default 75% to the
--     listing owner, platform keeps the remainder. INSERT-only — never overwrites an admin-tuned
--     value.
INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, description, is_active)
VALUES
  ('expert_concierge_booking_expert_share', 'percent', 0.75, 0.00, 1.00,
   'Expert share of the Booking Concierge facilitation fee, credited to the listing owner at completion (Locked Decision 51). Platform keeps the remainder (default 25%).', true)
ON CONFLICT (band_key) DO NOTHING;
