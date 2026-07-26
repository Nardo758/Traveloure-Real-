-- Migration 146: users.stripe_customer_id — Frictionless-Payments FP-1.
--
-- One ADDITIVE NULLABLE column (no CHECK, no DEFAULT, no backfill → no publish-time push trap):
-- the user's Stripe Customer id (cus_...), the durable anchor for saved payment methods and
-- off-session one-click charges. NULL = no Stripe customer yet (created lazily at first payment).
--
-- Card details themselves are NEVER stored in this database — Stripe vaults them; we hold only
-- this opaque customer token (and transient payment_method ids read live from Stripe's API).
-- Replaces the fragile per-request customers.list({email}) lookup optimization.routes.ts carried.

ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
