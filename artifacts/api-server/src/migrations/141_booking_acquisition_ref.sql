-- Migration 141: service_bookings.acquisition_ref — backoffice S4 (acquisition attribution).
--
-- One ADDITIVE NULLABLE column: the short-link code (short_links.code, migration 139) that
-- brought the traveler in, written at checkout when a captured ?ref= resolves to a real
-- short link. Soft reference (no FK) — a deleted link must not break historical attribution.
--
-- The attribution SOURCE column already exists (service_bookings.source, default 'direct') but
-- had NO writer until S4 — the checkout now derives it server-side (vocabulary per the ratified
-- S4 decision: direct | link | cross_sell; app-enforced, deliberately NO DB CHECK — the
-- publish-time drizzle-push CHECK-failure trap, and legacy rows hold 'direct' by default).
--
-- No CHECK, no DEFAULT, no backfill → no publish-time push trap. Analytics-only; never read
-- into a money decision.

ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS acquisition_ref VARCHAR(12);
