-- Migration 205: Travel surcharge — PROVIDER-CHOSEN MODE per listing.
-- DECISIONS.md ruling 81 (decision-maker ratified Aug 12, 2026), lane B1 (Wave 2).
--
-- A §14 MONEY lane. The mode + config are ordinary owner-authored LISTING config (like
-- service_radius / deposit config — no fee_bands involvement, §8), but the resulting CHARGE is
-- SERVER-DERIVED at checkout from the mode + config + the traveler's CONFIRMED pickup location
-- (server/services/travel-surcharge.service.ts), NEVER off req.body. The four modes:
--   none    — DEFAULT (every pre-205 row; column DEFAULTs 'none'). No surcharge, ever (§13).
--   flat    — one flat fee when the pickup is OUTSIDE the coverage radius (binary in/out).
--   zones   — provider-drawn base + N ordered tiers (child rows in service_surcharge_tiers); the
--             pickup maps to the smallest ring that CONTAINS it (honest containment, no distance).
--   per_km  — provider rate × STRAIGHT-LINE ("as-the-crow-flies") km from the pin.
-- NEVER-CLOBBER (ruling 62): switching the mode preserves the other modes' config, never nulls it.
--
-- PUBLISH-TRAP POSTURE (CLAUDE.md): all additive, NO DB CHECK on surcharge_mode (the app-enforced
-- vocabulary in insertProviderServiceSchema is the enforcement — a CHECK is what the Autoscale
-- deploy-push applies ahead of any value remap). Every object here is ALSO declared in
-- shared/schema.ts in the SAME commit, or the deploy push would drop it and the stamped migration
-- would never recreate it. Idempotent.

-- (a) provider_services surcharge CONFIG columns. surcharge_flat_amount / surcharge_per_km are
--     deliberately not bare `amount`/`rate` names so the fee gate cannot misread them.
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS surcharge_mode varchar(20) DEFAULT 'none';
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS surcharge_flat_amount decimal(10, 2);
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS surcharge_per_km decimal(10, 2);
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS surcharge_max_km integer;

COMMENT ON COLUMN provider_services.surcharge_mode IS
  'B1 (ruling 81). Provider-chosen travel-surcharge mode (surchargeModeEnum none|flat|zones|per_km, '
  'app-enforced, no DB CHECK). DEFAULT none. Listing config, but the CHARGE is server-derived at '
  'checkout from the mode + config + the traveler''s confirmed pickup (§14).';
COMMENT ON COLUMN provider_services.surcharge_max_km IS
  'B1 (ruling 81). Outer bound / booking eligibility ceiling — a confirmed pickup beyond this cannot '
  'book (refused BEFORE any charge). NULL = no ceiling.';

-- (b) service_surcharge_tiers — the `zones` mode's ordered surcharge rings. Child rows of
--     provider_services on the service_route_points pattern: ON DELETE CASCADE, UNIQUE
--     (service_id, position). radius_km/fee are NOT NULL (a ring with no radius or no fee is not a
--     tier). Positions server-derived from array order on the owner-gated replace-list PUT.
CREATE TABLE IF NOT EXISTS service_surcharge_tiers (
  id varchar PRIMARY KEY,
  service_id varchar NOT NULL REFERENCES provider_services(id) ON DELETE CASCADE,
  "position" integer NOT NULL,
  radius_km decimal(10, 3) NOT NULL,
  fee decimal(10, 2) NOT NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT service_surcharge_tiers_service_position_unique UNIQUE (service_id, "position")
);

CREATE INDEX IF NOT EXISTS service_surcharge_tiers_service_idx
  ON service_surcharge_tiers (service_id);

-- (c) cart_items.pickup_location — the traveler's CONFIRMED pickup for a cart line ({address,lat,lng}).
--     The surcharge TRIGGER. NULL ⇒ no surcharge (§13). Read server-side at checkout/preview to
--     derive the surcharge (§14 — the amount is never off req.body).
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS pickup_location jsonb;

COMMENT ON COLUMN cart_items.pickup_location IS
  'B1 (ruling 81). Traveler''s confirmed pickup location for this line ({address,lat,lng}), the '
  'travel-surcharge trigger. NULL = no pickup ⇒ no surcharge (§13). Written owner-gated via '
  'PATCH /api/cart/:id; read server-side at checkout to derive the surcharge (§14).';
