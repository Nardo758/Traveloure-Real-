-- Migration 131 — Content availability tagging + CTA booking classifier (remediation P1)
--
-- Adds FOUR ADDITIVE NULLABLE columns to affiliate_products. NO DB CHECK / NO NOT NULL / NO DEFAULT
-- → no publish-time drizzle-push CHECK-failure trap (migration 124/125/129 additive posture). The
-- enumerated value sets are validated at the zod/ORM layer, NOT a DB CHECK, so a Replit deploy-push
-- against legacy rows can never fail on them.
--
-- Ratified decision (2026-07-24): availability = normalized status + optional date-range (both).
-- §13: NULL is the honest "unknown" state — the tagging pass never fabricates a status or a date.
--
-- Columns:
--   availability_status  intended: 'available' | 'seasonal' | 'limited' | 'sold_out' (NULL = unknown)
--   available_from       optional booking-window start (NULL = no bound)
--   available_to         optional booking-window end   (NULL = no bound)
--   booking_type         CTA classifier (P4): 'in_platform_bookable' | 'affiliate_bookable' | 'informational'
--                        NULL → the CTA resolver treats affiliate content as 'affiliate_bookable' (agent rail).
--
-- Idempotent (ADD COLUMN IF NOT EXISTS). No backfill: the 9 existing products stay NULL until a real
-- admin tagging pass supplies true values (no fabrication).

ALTER TABLE affiliate_products ADD COLUMN IF NOT EXISTS availability_status VARCHAR(20);
ALTER TABLE affiliate_products ADD COLUMN IF NOT EXISTS available_from DATE;
ALTER TABLE affiliate_products ADD COLUMN IF NOT EXISTS available_to DATE;
ALTER TABLE affiliate_products ADD COLUMN IF NOT EXISTS booking_type VARCHAR(24);
