-- Migration 275: the traveler's BOOKING INPUTS move upstream onto `itinerary_items`.
-- Ledger `2026-09-03-slip-convergence`. Additive, nullable, NO CHECK, no DEFAULT, no backfill
-- (the migration-181/195/273 posture — a CHECK here is exactly the publish-time drizzle-push
-- failure CLAUDE.md warns about). All three columns are ALSO declared in `shared/schema.ts`
-- in this same commit: per the deploy-push durability rule, a DB object the code depends on
-- that `schema.ts` does not declare is dropped by Replit's publish-time push and never
-- recreated (the stamped migration will not re-run).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY: THE SLIP IS STATIONARY (docs/briefs/SLIP_EXPERIENCE_DISPATCH.md §0)
-- ─────────────────────────────────────────────────────────────────────────────
-- Every traveler surface is a VIEW of `itinerary_items`; the cart is specifically the
-- `ready_for_checkout` projection (`server/services/cart-projection.service.ts`). Three
-- surfaces (service-detail, experience-template, add-to-experience-dialog) instead wrote
-- STRAIGHT to `/api/cart`, minting rows with `itinerary_item_id IS NULL` — rows the
-- projection is explicitly and permanently blind to (that blindness is the whole
-- compatibility story for the nine Q1 cart consumers, and is NOT being weakened here).
-- Those items therefore never appeared on the traveler's slip. This lane repoints the three
-- surfaces onto `POST /api/trips/:tripId/itinerary-items` whenever a target trip resolves,
-- and these columns are what let a plan item CARRY the booking inputs those surfaces
-- collected — so the projection can rebuild an equivalent cart row instead of a second
-- surface hand-copying content sideways (copying between surfaces is prohibited by §0).
--
--   slot_id   — the traveler's picked availability slot. MIRRORS `cart_items.slot_id`
--               (migration 145) and carries the same meaning: an INTENT marker, NOT a
--               capacity hold. The atomic capacity CLAIM still happens exactly once, at
--               checkout, via `storage.bookSlot` (§15 — `UPDATE … WHERE booked_count <
--               capacity RETURNING`), never at add time; an abandoned plan can no more hold
--               a slot hostage than an abandoned cart could. FK ON DELETE SET NULL, matching
--               145: a provider deleting a slot must never cascade-delete a plan item.
--
--   check_in  — the stay's night range for a `pricing_unit = 'per_night'` service (the §17
--   check_out   Product Builder PROPERTY rung). These do NOT move the money path:
--               `getRoomNights()` in `server/routes/payments.routes.ts` still reads
--               `contentMeta.checkIn` / `contentMeta.checkOut` off the CART row, and
--               `resolveStayNightlyRates` / `resolveItemBaseAmount` are untouched. What
--               changes is PROVENANCE: these columns are the upstream SOURCE the projection
--               copies from, which replaces a CLIENT-SUPPLIED value on the cart row with a
--               SERVER-DERIVED one — a §14 tightening, not a loosening.
--               Ledger rows 107/108 (S11) chose `contentMeta` as "the smallest existing
--               carrier" for a cart-DIRECT add; this EXTENDS that choice one hop upstream,
--               it does not reverse it. `contentMeta` remains the carrier the money path
--               reads, and the cart-direct (guest / trip-less) add still writes it itself.
--
-- `date` (not timestamp) is deliberate: a night range is calendar dates, and it matches the
-- `YYYY-MM-DD` string shape `getRoomNights()` parses, with no timezone to get wrong.
-- NULL on every pre-275 row is the honest "this item carries no slot / is not a stay" state
-- (§13) — never a fabricated default. Idempotent.

ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS slot_id   VARCHAR;
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS check_in  DATE;
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS check_out DATE;

DO $$ BEGIN
  ALTER TABLE itinerary_items
    ADD CONSTRAINT itinerary_items_slot_id_fkey
    FOREIGN KEY (slot_id) REFERENCES vendor_availability_slots(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
