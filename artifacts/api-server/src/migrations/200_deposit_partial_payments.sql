-- 200: Deposits / partial payments on the cart-checkout rail (Lane 7, DECISIONS.md ruling 72).
--
-- RATIFIED DESIGN (decision-maker, Aug 11 2026): MANUAL BALANCE + PROVIDER OPT-IN PER LISTING.
--   • A listing takes a deposit ONLY when its provider turns it on and sets a percentage OR a flat
--     amount. Deposits OFF ⇒ checkout is byte-identical to today (CLAUDE.md §13).
--   • The traveler pays the DEPOSIT at checkout through the EXISTING §15 claim machine (one PI per
--     claim). The BALANCE is a SECOND, separate checkout the traveler completes before a cutoff —
--     its own authorized PaymentIntent, no stored-card / off-session / scheduled auto-charge.
--
-- ALL columns are ADDITIVE-NULLABLE with NO DB CHECK (publish-trap rule: an app-enforced vocabulary
-- in shared/schema.ts / server/services/deposit.service.ts is the enforcement, never a CHECK that a
-- deploy-time drizzle push would apply ahead of any value remap). Every column is DECLARED in
-- shared/schema.ts so the publish push maintains it. Booleans default false to mirror the legacy
-- `bookings` shape this deliberately copies onto `service_bookings` (§ Service Model).

-- ── Deposit CONFIG lives on provider_services (the canonical service table; provider_pricing is an
--    orphan with ZERO server consumers — audited Aug 11 2026 — so it is NOT wired here). These are
--    ordinary owner-authored LISTING facts, like `price`/`serviceRadius`: business config the
--    provider sets on their OWN listing, NOT a platform fee/commission rate (§8/§18 do not apply —
--    no split, no band, nothing that multiplies a platform take). Named so the fee gate cannot
--    misread them as fee literals.
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS deposit_enabled boolean DEFAULT false;
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS deposit_type varchar(20);          -- 'percentage' | 'flat' (app-enforced)
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS deposit_percentage integer;         -- e.g. 30 = 30% of the line total
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS deposit_flat_amount decimal(10,2);  -- flat dollars collected now

-- ── Booking-side state on service_bookings (the cart rail table), mirroring the legacy `bookings`
--    deposit/balance shape additively. A deposit-partial booking lands in status='deposit_paid'
--    (a plain varchar value, no CHECK) — DISTINGUISHABLE BY CONSTRUCTION from both a full-paid
--    `confirmed` and an unauthorized `payment_pending` claim, and deliberately OUTSIDE every
--    paid-equivalent / completion-eligible status set, so a deposit-only booking releases NO
--    earning (D8 completion fires only from `confirmed`).
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS deposit_amount decimal(10,2);
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS deposit_paid boolean DEFAULT false;
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS balance_amount decimal(10,2);
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS balance_paid boolean DEFAULT false;
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS balance_due_at timestamp;
-- PI linkage columns — written ONLY by the shared promotion / balance-authorization paths
-- (§19a: a booking is never BORN carrying a PaymentIntent id). Stripped in insertServiceBookingSchema
-- and in storage.createServiceBooking, exactly as stripe_payment_intent_id is.
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS stripe_deposit_intent_id varchar(255);
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS stripe_balance_intent_id varchar(255);
