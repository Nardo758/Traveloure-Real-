-- 179_fee_ledger.sql — Fee-Ledger lane Phase 1B. The append-only fee event log.
--
-- WHY (audit C1): the platform's fee capture was a scalar column in a two-sided fee model.
-- `payments.routes.ts:307` ADDS a computed fee to the traveler total; `:878-879` DEDUCTS the same
-- rate from the provider base; `:961-964` records ONE side in `service_bookings.platform_fee`. On
-- an $80 service the platform retained $40 and recorded $20 — every downstream read under-reported
-- take by half, across ~15 independent aggregations. A patch fixes the number once; an append-only
-- event log makes the class impossible: every covered fee that moves writes a row, and one
-- invariant proves the books balance per booking.
--
-- SHAPE: a fee EVENT LOG, not a general ledger. No double-entry, no chart of accounts (dispatch §3).
-- The invariant provides the integrity.
--
-- APPEND-ONLY: no UPDATE and no DELETE path exists in application code, including to "fix" a bad
-- row — corrections are a reversal row plus a new row (`reverses_ledger_id`). This is why the two
-- existing in-place mutators (booking-actions.service.ts:91-101 rewriting platform_revenue,
-- affiliate-reconciliation.service.ts:425-427 overwriting expert_earnings.amount) are SUPERSEDED
-- by this table rather than complemented by it.
--
-- No CHECK-over-legacy-values trap: this is a NEW table, so its CHECKs cannot be violated by rows
-- already on disk (the publish-time CHECK failure mode in CLAUDE.md needs pre-existing rows). All
-- objects here are declared in shared/schema.ts in the SAME commit per the deploy-push durability
-- rule — an undeclared table or index is dropped by the Autoscale push and, because the migration
-- is already stamped, never recreated.

CREATE TABLE IF NOT EXISTS fee_ledger (
  id                  VARCHAR PRIMARY KEY,
  created_at          TIMESTAMP NOT NULL DEFAULT now(),

  -- Polymorphic subject ref. Exactly one of these is set for a booking-scoped event; the pair
  -- follows the existing platform_revenue source_type/source_id convention rather than inventing
  -- a new one.
  source_type         VARCHAR(40)  NOT NULL,   -- 'service_booking' | 'booking' (legacy rail) | 'ready_made_purchase' | 'template_purchase' | 'coordination' | 'tip' | 'affiliate'
  source_id           VARCHAR      NOT NULL,
  booking_id          VARCHAR,                 -- convenience denormalization for the per-booking invariant; NULL for non-booking events

  -- WHAT moved.
  fee_type            VARCHAR(40)  NOT NULL,
  amount              NUMERIC(12,2) NOT NULL,
  currency            VARCHAR(3)   NOT NULL DEFAULT 'usd',
  borne_by            VARCHAR(12)  NOT NULL,   -- traveler | provider | expert | platform

  -- HOW the rate was decided. band_id is NULLABLE BY DESIGN (Phase 0 §1a): three override layers
  -- sit above the band, so for an entity-override row there is no band that explains the rate.
  -- rate_source is the discriminator that keeps the ledger honest about which layer decided.
  band_id             UUID REFERENCES fee_bands(id),
  rate_as_resolved    NUMERIC(10,4),           -- the rate actually applied, snapshotted at write time
  rate_source         VARCHAR(20)  NOT NULL,   -- band | entity_override | rails | code_fallback | flat
  cap_applied         BOOLEAN      NOT NULL DEFAULT false,  -- true when fee_bands.max_amount clamped the amount (D1's $25 traveler-fee cap)

  -- Attribution (D1 rails). acquisition_ref mirrors service_bookings.acquisition_ref; it is
  -- ANALYTICS-DERIVED on the booking row but here it is a FEE INPUT, because rails selects the
  -- band and waives the traveler fee.
  source_attribution  VARCHAR(12)  NOT NULL DEFAULT 'platform',  -- platform | rails
  acquisition_ref     VARCHAR(32),

  -- Stripe provenance, snapshotted when available. Under transaction strategy (b) the row is
  -- written at the authorization stamp, so the PaymentIntent IS in scope for cart-rail events —
  -- which is precisely why (b) was ruled over writing at fee computation time, where ruling 46
  -- guarantees no PI exists yet.
  stripe_payment_ref  VARCHAR(255),
  stripe_transfer_ref VARCHAR(255),
  stripe_refund_ref   VARCHAR(255),

  -- Reversal linkage. A correction is a NEW row pointing at what it reverses.
  reverses_ledger_id  VARCHAR REFERENCES fee_ledger(id),

  -- Idempotency: the same logical fee event can be attempted twice (retry, replay, re-drive) and
  -- must land exactly once. This is the ledger's half of the §15 idempotency invariant.
  idempotency_key     VARCHAR(255) NOT NULL,

  description         TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- ── DB-layer guards (ruling 35 two-layer discipline) ────────────────────────────────────────
  -- A zero-amount fee event is meaningless and hides a resolution bug behind a real-looking row.
  CONSTRAINT fee_ledger_amount_nonzero CHECK (amount <> 0),
  -- A reversal must say what it reverses; a non-reversal must not claim to reverse anything.
  CONSTRAINT fee_ledger_reversal_linkage CHECK (
    (fee_type = 'reversal' AND reverses_ledger_id IS NOT NULL)
    OR (fee_type <> 'reversal' AND reverses_ledger_id IS NULL)
  ),
  CONSTRAINT fee_ledger_borne_by CHECK (borne_by IN ('traveler','provider','expert','platform')),
  CONSTRAINT fee_ledger_rate_source CHECK (rate_source IN ('band','entity_override','rails','code_fallback','flat')),
  CONSTRAINT fee_ledger_attribution CHECK (source_attribution IN ('platform','rails')),
  -- The full ruled taxonomy is seeded here, including types this lane does not yet write, so a
  -- later lane extending coverage adds a writer rather than a migration (dispatch D/Q-L2).
  CONSTRAINT fee_ledger_fee_type CHECK (fee_type IN (
    'traveler_service_fee',
    'provider_commission_full',
    'provider_commission_rails',
    'expert_commission',
    'ai_concierge_fee',
    'affiliate_margin',
    'credit_applied',
    'reversal'
  )),
  -- A band-sourced rate must name its band; an override/fallback must not borrow one.
  CONSTRAINT fee_ledger_band_provenance CHECK (
    (rate_source = 'band' AND band_id IS NOT NULL)
    OR (rate_source <> 'band')
  )
);

-- Exactly-once landing for a retried/replayed fee event.
CREATE UNIQUE INDEX IF NOT EXISTS fee_ledger_idempotency_key_idx ON fee_ledger (idempotency_key);
-- The invariant query's access path: all events for one booking.
CREATE INDEX IF NOT EXISTS fee_ledger_booking_idx ON fee_ledger (booking_id) WHERE booking_id IS NOT NULL;
-- Polymorphic subject lookup (repoint reads, per-source aggregation).
CREATE INDEX IF NOT EXISTS fee_ledger_source_idx ON fee_ledger (source_type, source_id);
-- Reconciliation by Stripe reference.
CREATE INDEX IF NOT EXISTS fee_ledger_payment_ref_idx ON fee_ledger (stripe_payment_ref) WHERE stripe_payment_ref IS NOT NULL;
-- Reversal traversal.
CREATE INDEX IF NOT EXISTS fee_ledger_reverses_idx ON fee_ledger (reverses_ledger_id) WHERE reverses_ledger_id IS NOT NULL;

COMMENT ON TABLE fee_ledger IS
  'Append-only fee EVENT log (fee-ledger lane, audit C1). Every covered fee that moves writes a row '
  'in the same transaction as the money mutation. Corrections are reversal rows — there is no UPDATE '
  'or DELETE path in application code. Invariant per covered booking: '
  'traveler_paid - provider_credited = SUM(fee_ledger.amount).';
