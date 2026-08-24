-- 256: affiliate grounding link on itinerary_items (ledger 2026-08-23-item2-affiliate).
-- Set by the build-time slip resolver when a free-text AI item matches a bookable affiliate product
-- (rung 02 of the resolution waterfall: catalog → affiliate → DMO). Real FK to affiliate_products
-- (a stable persisted row) with ON DELETE SET NULL so retiring a product never cascade-deletes the
-- plan item. Additive-nullable, NO CHECK (publish-trap rule). Declared in shared/schema.ts.
-- Behavior-neutral on apply. The traveler's booking CTA is server-derived from this at
-- plancard-assembly time (§16 vault token) and the column is never client-settable (§19).

ALTER TABLE itinerary_items
  ADD COLUMN IF NOT EXISTS affiliate_product_id varchar
  REFERENCES affiliate_products(id) ON DELETE SET NULL;
