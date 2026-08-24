-- 159: per-item routing state + the item↔booking key — Trip-Canon Lane 1 (Reconcile), Phase 1a.
-- Governing docs: docs/briefs/RECONCILE_PHASE1_SCOPE.md (§1 W1, §3 Phase 1a, §4),
-- docs/briefs/ROUTING_STATE_CONTRACT.md, docs/planning/TRIP_CANON_MASTER_BRIEF.md §5 item 2
-- (the approved booking_id amendment).
--
-- WHY (W1): no per-item routing state exists anywhere today — the audit's transition table has
-- L2→L3 UNOWNED, and "is this item selected, sent to the expert, or bought?" is currently inferred
-- from `cart_items` membership, which carries two different meanings for nine consumers. This is a
-- GREENFIELD column: there are no legacy semantics to migrate.
--
-- VALUE SET IS TS-LEVEL, DELIBERATELY **NO DB CHECK**: `in_planning | with_expert |
-- ready_for_checkout | purchased` is declared in `shared/schema.ts` as `ROUTING_STATUSES` and
-- enforced in the transition endpoints (Phase 1b). A CHECK here would buy nothing on a brand-new
-- column whose every row is born at the default, while creating exactly the publish-time
-- drizzle-push remap trap CLAUDE.md documents (the push enforces schema CHECKs without running our
-- migrations' remap steps first, and offers the DESTRUCTIVE "copy dev over production" option on
-- failure). This is the pre-109 delivery-method posture: varchar column, canonical set in TS.
-- Nothing to add to the preflight CONSTRAINT_MANIFEST.
--
-- DEFAULT COMES FROM THIS EXPLICIT ALTER, NOT FROM A DRIZZLE PUSH (scope §3, Phase 1a gate): the
-- gate proves DB default == ORM default == 'in_planning' via information_schema, rather than
-- assuming the push wrote it.
--
-- BACKFILL: existing rows take the column default and NOTHING ELSE (scope §4 — "null/default is
-- honest; fabricated history is not"). We do NOT infer `purchased` for historical items that
-- happen to have a booking; that history was never recorded and inventing it would be a §13
-- fabrication. Historical items read as `in_planning`, which is the honest statement that their
-- routing was never tracked.

-- 1) Routing state. NOT NULL + DEFAULT set in the same statement so existing rows are filled by
--    the default at ALTER time (no separate UPDATE, no window where the column is NULL).
ALTER TABLE itinerary_items
  ADD COLUMN IF NOT EXISTS routing_status VARCHAR(20) NOT NULL DEFAULT 'in_planning';

-- 2) The item↔booking key (master brief §5 item 2, approved amendment). Additive NULLABLE, no
--    DEFAULT — an item has no booking until the checkout confirm path stamps one atomically with
--    the `→purchased` transition (contract §2: checkout is the sole writer of the forward edge).
--    ON DELETE SET NULL: deleting a booking must not cascade-delete the plan item (the
--    providerServiceId posture on this same table). This is the key the refund/cancel reversal
--    edge (`purchased → in_planning`, contract §1) resolves through — without it a reversal cannot
--    find the item it must un-purchase.
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS booking_id VARCHAR;

DO $$ BEGIN
  ALTER TABLE itinerary_items
    ADD CONSTRAINT itinerary_items_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES service_bookings(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- 3) The reversal path looks items up BY booking id (refund knows the booking, must find the
--    item). Declared in shared/schema.ts as well — per the CLAUDE.md deploy-push rule an index
--    that exists only in migration SQL is dropped by the publish push and, once this migration is
--    stamped, never recreated.
CREATE INDEX IF NOT EXISTS idx_itinerary_items_booking_id
  ON itinerary_items(booking_id);
