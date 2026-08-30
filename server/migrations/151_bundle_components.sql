-- 151: Provider Product Builder, bundle shape (§17 — ratified Jul 28, 2026: join table,
-- snapshot-at-booking, bundle-first). provider_services stays canonical: a bundle IS a
-- provider_services row (so the F2 approval queue, storefront read-gates, and checkout
-- rails work unchanged); this migration adds only the SHAPE marker and the component
-- linkage.
--
-- Publish-trap posture: product_shape is additive nullable, no DEFAULT, no CHECK
-- (NULL = single service — every existing row). bundle_components is a NEW table, so
-- its constraints have no legacy rows to violate → no drizzle-push CHECK failure.

-- Shape marker: NULL = single service (all existing rows), 'bundle' = a bundle row.
-- Values are app-layer (the create path writes them); deliberately no DB CHECK on an
-- existing table (the migration-129 additive posture).
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS product_shape VARCHAR(20);

-- Component linkage (the ratified JOIN-TABLE decision — real FK integrity so the F2
-- rule "no unapproved service hides inside a sellable bundle" is enforceable by query).
--   bundle_service_id    → the bundle row.        ON DELETE CASCADE (bundle gone → rows gone)
--   component_service_id → a component service.   ON DELETE RESTRICT (a service inside a
--                          bundle cannot be deleted until removed from the bundle — the
--                          honest failure mode; silently vanishing components would leave
--                          a sellable bundle whose contents changed underneath the buyer)
CREATE TABLE IF NOT EXISTS bundle_components (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  bundle_service_id VARCHAR NOT NULL REFERENCES provider_services(id) ON DELETE CASCADE,
  component_service_id VARCHAR NOT NULL REFERENCES provider_services(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bundle_components_no_self CHECK (bundle_service_id <> component_service_id),
  CONSTRAINT bundle_components_unique UNIQUE (bundle_service_id, component_service_id)
);

-- The engine/read side fetches components per bundle.
CREATE INDEX IF NOT EXISTS idx_bundle_components_bundle ON bundle_components(bundle_service_id);
-- The delete-guard/where-used side asks "which bundles contain this service?".
CREATE INDEX IF NOT EXISTS idx_bundle_components_component ON bundle_components(component_service_id);
