-- 153: Provider Product Builder, property shape (§17 — ratified Jul 29, 2026: per-night
-- slots on the existing vendor_availability_slots rail, price + pricing_unit marker,
-- multi-room via child service rows + parent self-FK). provider_services stays canonical:
-- a property IS a provider_services row (product_shape='property') and each room type is
-- its own child row (product_shape='property_room') — so F2 approval, storefront
-- read-gates, the §15 atomic slot claim, and earnings all work per-room unchanged. No new
-- service table (FAQ prohibition holds), no new availability table.
--
-- Publish-trap posture: both columns are additive nullable, no DEFAULT, no CHECK
-- (NULL pricing_unit = flat pricing — every existing row; NULL parent_service_id = not a
-- room child — every existing row). Values are app-layer vocabulary (the migration-129/151
-- additive posture) → no drizzle-push CHECK failure.

-- Nightly-rate marker: NULL = flat price (all existing rows), 'per_night' = the price
-- column is a per-night rate; charge = nights × rate, server-derived (§14).
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS pricing_unit VARCHAR(20);

-- Room-child linkage: a property_room row points at its parent property row.
-- ON DELETE RESTRICT (the bundle-components posture): a property cannot be deleted while
-- rooms exist — silently orphaning bookable children would leave sellable rows whose
-- listing context vanished underneath them. Delete rooms first, then the property.
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS parent_service_id VARCHAR;

DO $$ BEGIN
  ALTER TABLE provider_services
    ADD CONSTRAINT provider_services_parent_service_id_fkey
    FOREIGN KEY (parent_service_id) REFERENCES provider_services(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- Children-of-parent lookup (property page assembling its rooms; RESTRICT enforcement scans).
CREATE INDEX IF NOT EXISTS idx_provider_services_parent ON provider_services(parent_service_id)
  WHERE parent_service_id IS NOT NULL;
