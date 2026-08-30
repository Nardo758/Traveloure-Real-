-- Migration 145: C3 — slot-aware checkout (Wave C money-path centerpiece).
--
-- Two ADDITIVE NULLABLE slot references (no CHECK, no DEFAULT, no backfill → no publish-time
-- drizzle-push trap; NULL = the item/booking is not slot-bound, which is every existing row and
-- every non-dated service — the honest state):
--   cart_items.slot_id        — the traveler's picked slot, carried from service-detail add-to-cart
--   service_bookings.slot_id  — stamped at checkout AFTER the atomic capacity claim succeeds
--
-- FKs are ON DELETE SET NULL: a provider deleting a slot must not delete carts/bookings — the
-- booking's own bookingDetails snapshot keeps the human-readable schedule regardless.
-- The capacity claim itself is code (storage.bookSlot, rewritten atomic UPDATE ... WHERE
-- booked_count < capacity RETURNING — §15), not a constraint here.

ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS slot_id VARCHAR;
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS slot_id VARCHAR;

DO $$ BEGIN
  ALTER TABLE cart_items
    ADD CONSTRAINT cart_items_slot_id_fkey
    FOREIGN KEY (slot_id) REFERENCES vendor_availability_slots(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE service_bookings
    ADD CONSTRAINT service_bookings_slot_id_fkey
    FOREIGN KEY (slot_id) REFERENCES vendor_availability_slots(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
