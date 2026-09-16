-- Migration 306: A BUNDLE'S COMPONENTS ARE ROWS, AND A PARTIALLY COMPLETED BUNDLE IS ITS OWN STATE.
-- Decision-maker ruling 2026-09-15 — punchlist D-32 / D-33 / D-34 / D-35, all option A; ledger
-- `2026-09-16-d32-d35-bundle-components`. Content of record:
-- `docs/design/BUNDLE_PARTIAL_COMPLETION_BRIEF.md` (§2 state machine, §3 money, §5 columns).
--
-- Every object below is ADDITIVE, with NO DEFAULT on any decision-bearing column and NO DB CHECK (the
-- migration-181/195/273/275/276/277/279/280/281/282/284/287/295/297/301/302/303/304/305 posture — a
-- CHECK here is exactly the publish-time drizzle-push failure CLAUDE.md's Coordination Prevention
-- rules warn about), and NO BACKFILL. Table, UNIQUE and index are ALSO declared in `shared/schema.ts`
-- in this same commit per the deploy-push durability rule: an object `schema.ts` does not declare is
-- dropped by Replit's publish-time push and NEVER recreated, because the migration is already stamped.
--
-- No CHECK is added or changed, so `scripts/preflight-prod-constraints.cjs` needs no new
-- `CONSTRAINT_MANIFEST` entry and the publish-time push has nothing to fail on.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- D-32 — `booking_component_states`: ONE ROW PER COMPONENT OF A PURCHASED BUNDLE
-- ─────────────────────────────────────────────────────────────────────────────
-- Per-component COMPLETION already lived on `service_bookings.booking_details.componentCompletions`,
-- a `{componentId: ISO}` jsonb map. It cannot carry FAILED, and a jsonb key cannot be the target of
-- an atomic conditional the way a row can — so every §15 claim the partial-completion state machine
-- needs would be a read-modify-write on the whole document. A row is claimed with
-- `UPDATE … WHERE status = 'pending'`; the statement is the guard (§15/§18b).
--
-- `booking_revision_requests` / `service_route_points` pattern: FK -> service_bookings(id) ON DELETE
-- CASCADE, UNIQUE (booking_id, component_service_id), an index on the parent. `component_service_id`
-- carries NO FK to provider_services on purpose: the row is a SNAPSHOT of what was bought, and a
-- component the seller later deletes must not take the traveler's record of it away.
--
-- BORN AT CHECKOUT by the checkout claim's composer (`storage.createServiceBooking`, inside the birth
-- transaction, from the purchase-time snapshot) and by nothing else. NO BACKFILL: a booking born before
-- this table has no rows, its jsonb stays the legacy source and every reader NAMES which source it read.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- D-33 — `snapshot_price_cents`: THE COMPONENT'S PRICE AS IT WAS AT PURCHASE
-- ─────────────────────────────────────────────────────────────────────────────
-- SERVER-DERIVED from the catalog at checkout (§14; never from a request body, never a rate literal),
-- written once at birth and never re-read from the listing — a seller repricing afterwards must not
-- move a refund or a mint. The component prices need NOT sum to the bundle price (a bundle is
-- routinely discounted): every share is PRO-RATA over the snapshot. NULL = not captured (§13) — never
-- 0, which would read as "this component was free" — and a bundle with any unpriced component can
-- never be partially completed; it is handed to a human with the reason stated.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- D-34 / D-35 — NEED NO DDL
-- ─────────────────────────────────────────────────────────────────────────────
-- `partially_completed` joins `service_bookings.status` as a CODE change: the column is `varchar(30)`
-- with no CHECK (the LD 44(e) posture). The ONE mint over REDUCED figures is `storage.
-- mintCompletionEarningsForBooking` reading these rows; migration 203's one-row-per-booking unique
-- indexes are untouched, which is what makes it ONE mint by construction.

CREATE TABLE IF NOT EXISTS booking_component_states (
  id VARCHAR PRIMARY KEY,
  booking_id VARCHAR NOT NULL REFERENCES service_bookings(id) ON DELETE CASCADE,
  component_service_id VARCHAR NOT NULL,
  "position" INTEGER,
  service_name TEXT,
  status VARCHAR(20) NOT NULL,
  snapshot_price_cents INTEGER,
  delivered_at TIMESTAMP,
  accepted_at TIMESTAMP,
  completed_at TIMESTAMP,
  failed_at TIMESTAMP,
  failure_reason TEXT,
  cancelled_at TIMESTAMP,
  refunded_at TIMESTAMP,
  refund_amount_cents INTEGER,
  stripe_refund_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_component_states_booking_component_unique
  ON booking_component_states (booking_id, component_service_id);

CREATE INDEX IF NOT EXISTS booking_component_states_booking_idx
  ON booking_component_states (booking_id);

COMMENT ON TABLE booking_component_states IS
  'One row per component of a purchased bundle (punchlist D-32, ledger 2026-09-16-d32-d35-bundle-components). Born at checkout by the claim composer from the purchase-time snapshot; status is app-enforced (pending|completed|failed|cancelled|refunded, no CHECK); every transition is an atomic conditional on status. No backfill: a booking with no rows keeps booking_details.componentCompletions as its legacy source, read and named as such.';
COMMENT ON COLUMN booking_component_states.snapshot_price_cents IS
  'D-33: the component''s catalog price AT PURCHASE, in integer cents, server-derived at checkout and never re-read from the listing. Every refund or mint share is PRO-RATA over the snapshot (prices need not sum to the bundle price). NULL = not captured — never 0 — and blocks partial completion (§13).';
COMMENT ON COLUMN booking_component_states.status IS
  'pending (born) | completed | failed | cancelled | refunded — app-enforced, no CHECK. Only completed and failed have writers in the D-32..D-35 lane; cancelled/refunded are declared for the component-refund lane.';
