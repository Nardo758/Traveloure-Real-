-- Migration 307: A PARTIALLY FULFILLED BUNDLE SETTLES ONCE BY ITS PURCHASE-TIME COMPONENT ALLOCATION.
-- Decision-maker ruling 2026-09-16 — punchlist D-51; ledger `2026-09-16-bundle-partial-settlement`.
-- Closes the money gap the D-32..D-35 lane (migration 306) STOPPED on: a `partially_completed`
-- traveler had been charged in full and was owed the deducted share, recorded on the row and
-- refunded by nothing.
--
-- Every object below is ADDITIVE, with NO DEFAULT on any decision-bearing column and NO DB CHECK (the
-- migration-181/195/273/275/276/277/279/280/281/282/284/287/295/297/301/302/303/304/305/306 posture —
-- a CHECK here is exactly the publish-time drizzle-push failure CLAUDE.md's Coordination Prevention
-- rules warn about), and NO BACKFILL. Column, table and UNIQUE are ALSO declared in `shared/schema.ts`
-- in this same commit per the deploy-push durability rule: an object `schema.ts` does not declare is
-- dropped by Replit's publish-time push and NEVER recreated, because the migration is already stamped.
--
-- No CHECK is added or changed, so `scripts/preflight-prod-constraints.cjs` needs no new
-- `CONSTRAINT_MANIFEST` entry and the publish-time push has nothing to fail on.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- `booking_component_states.allocation_cents` — THE CONTRACT FACT BESIDE THE CATALOG FACT
-- ─────────────────────────────────────────────────────────────────────────────
-- D-33's `snapshot_price_cents` is the component's CATALOG price at purchase. A bundle is routinely
-- discounted, so those prices need not sum to what the bundle was sold for. The ruling requires a
-- nonnegative gross ALLOCATION per component that sums EXACTLY to the bundle's pre-fee purchase price
-- (`service_bookings.total_amount`). It is derived ONCE at birth by the checkout composer as the
-- pro-rata share of that price with deterministic largest-remainder rounding (`allocateBundleCents`,
-- `shared/bundle-component-states.ts`) and never re-read from the listing. NULL = not captured (§13):
-- every row born before this migration, and every snapshot with an unpriced component. Such a bundle
-- CANNOT settle partially and says so (`allocation_missing`) — never an equal split, never a guess.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- `bundle_partial_settlements` — ONE NON-TERMINAL SETTLEMENT RECORD PER BOOKING
-- ─────────────────────────────────────────────────────────────────────────────
-- The whole-row refund rail claims `service_bookings.status = 'refunded'` — terminal, and a lie about
-- the components that WERE delivered. A partial settlement needs its own claim: UNIQUE (booking_id) is
-- the §15 claim (`INSERT … ON CONFLICT DO NOTHING`), `settled_at IS NULL` is the unpromoted state the
-- nightly TTL sweep reclaims (§15b), and the promote is `UPDATE … WHERE settled_at IS NULL`. The
-- amounts are pinned on the claim BEFORE Stripe is called, so a retry re-reads the same cents and the
-- amount-scoped idempotency key `bundle-settle-<bookingId>` is unambiguous by construction.
-- `component_outcomes` is the immutable per-component outcome set the ruling names.
--
-- FK ON DELETE CASCADE, on the `booking_component_states` pattern: this row is the settlement of THOSE
-- component rows. The money audit that must outlive the booking is the `refunds` row (ON DELETE SET
-- NULL, migration 156), which the shared refund issuer writes for this refund as for every other.

ALTER TABLE booking_component_states ADD COLUMN IF NOT EXISTS allocation_cents INTEGER;

COMMENT ON COLUMN booking_component_states.allocation_cents IS
  'D-51 (ledger 2026-09-16-bundle-partial-settlement): the component''s purchase-time GROSS ALLOCATION in integer cents — the pro-rata share of service_bookings.total_amount, largest-remainder rounded so the bundle''s allocations sum EXACTLY to the pre-fee price. Written once at birth by the checkout composer, never re-read from the listing. NULL = not captured (pre-307 rows, unpriced snapshots) and blocks partial settlement (§13).';

CREATE TABLE IF NOT EXISTS bundle_partial_settlements (
  id VARCHAR PRIMARY KEY,
  booking_id VARCHAR NOT NULL REFERENCES service_bookings(id) ON DELETE CASCADE,
  settled_amount_cents INTEGER NOT NULL,
  traveler_refund_cents INTEGER NOT NULL,
  seller_earning_cents INTEGER NOT NULL,
  platform_revenue_cents INTEGER NOT NULL,
  component_outcomes JSONB NOT NULL,
  stripe_refund_id VARCHAR(255),
  claimed_at TIMESTAMP NOT NULL,
  settled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS bundle_partial_settlements_booking_unique
  ON bundle_partial_settlements (booking_id);

COMMENT ON TABLE bundle_partial_settlements IS
  'One partial settlement per partially fulfilled bundle (punchlist D-51, ledger 2026-09-16-bundle-partial-settlement). UNIQUE (booking_id) is the §15 claim; settled_at IS NULL is a claimed-but-unpromoted row the nightly TTL sweep reclaims (§15b); the promote is an atomic conditional on settled_at IS NULL, driven by the settlement itself and by the charge.refunded webhook. Amounts are pinned at claim, before Stripe, and never rewritten. The booking stays partially_completed — never refunded.';
