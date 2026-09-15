-- Migration 295: A PLAN ITEM MAY NAME A TRAVELER'S OWN VENUE, OR THE DISCOVER CONTENT IT CAME FROM.
-- Decision-maker ruling 2026-09-15, punchlist **D-16** (b) = A and (c) = A; ledger
-- `2026-09-15-d16-plan-holds-venues-and-content`. Additive, nullable, NO CHECK, no DEFAULT, no
-- backfill (the migration-181/195/273/275/277/279/280/281/282/284/287 posture — a CHECK here is
-- exactly the publish-time drizzle-push failure CLAUDE.md's Coordination Prevention rules warn
-- about). The three columns AND the index are ALSO declared in `shared/schema.ts` in this same
-- commit: per the deploy-push durability rule, a DB object the code depends on that `schema.ts`
-- does not declare is dropped by Replit's publish-time push and NEVER recreated (the stamped
-- migration will not re-run).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY: TWO KINDS OF CART LINE HAD NO PLAN REPRESENTATION AT ALL
-- ─────────────────────────────────────────────────────────────────────────────
-- LD 39: `itinerary_items` is the ONE store of a plan's contents and the cart is its
-- `ready_for_checkout` PROJECTION. Ledger `2026-09-13-guest-cart-becomes-plan` made a cart line
-- become an item at `POST /api/cart/resolve-trip` — but only where the round trip back through
-- `syncItemProjection` is FAITHFUL, because the instant a cart row is linked the projection is
-- entitled to rewrite it from the item. Two of the four refusals it had to write were refusals for
-- the SAME reason: the item table had no column for the line's own subject.
--
--   custom_venue_id — the traveler's OWN venue (`custom_venues`), the one they typed in
--       themselves. `cart_items.custom_venue_id` has existed all along; the plan had nowhere to
--       put it, so a venue a traveler added could not sit on their own plan.
--   content_type / content_id — a Discover CONTENT line (gem / hotel / activity / event /
--       neighborhood). These mirror `cart_items.content_type` (varchar(20)) and
--       `cart_items.content_id` (text) exactly, so the link back to the source survives the round
--       trip instead of being rewritten into the projection's own `itinerary_item` marker.
--
-- ON DELETE SET NULL IS THE RULING, NOT AN IMPLEMENTATION DETAIL (the migration-277 precedent).
-- Deleting a venue must never delete the plan item planned around it: the item keeps the traveler's
-- own title and stays on their slip, naming no venue. There is deliberately NO FK on
-- `content_id` — it is a soft reference the same way `dmo_extracted_place_id` and `gem_id` are:
-- the content it names lives across several tables (gems, hotels, activities) and no single
-- referent exists to point at.
--
-- §13 — NULL = NO LINK. Not "unknown", not "none": a plan item that names no venue and no content
-- is the ordinary item every plan is already full of, and no reader renders anything for a NULL.
-- NO BACKFILL is owed or possible — nothing on disk was ever asked these questions.
--
-- ADMISSION (§19) is not this migration's business and is deliberately NOT a re-admission:
-- `insertItineraryItemSchema` OMITS all three and NO pick-based schema re-admits them. They are
-- stamped SERVER-SIDE from the cart row by the one projection module
-- (`server/services/cart-projection.service.ts`), and are client-settable nowhere — under a
-- denylist schema a freshly added column is client-settable BY DEFAULT.
--
-- D-16 (a) (a multi-unit line) and the priceless-listing refusal are UNCHANGED and still refused:
-- `itinerary_items` has no unit column (that is punchlist D-41, unauthorized here) and a listing
-- with no published price would have its cart row deleted by the very next sync.
--
-- Idempotent; safe to re-run.

ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS custom_venue_id VARCHAR;
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS content_type VARCHAR(20);
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS content_id TEXT;

DO $$ BEGIN
  ALTER TABLE itinerary_items
    ADD CONSTRAINT itinerary_items_custom_venue_id_fkey
    FOREIGN KEY (custom_venue_id) REFERENCES custom_venues(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_itinerary_items_custom_venue_id
  ON itinerary_items(custom_venue_id);
