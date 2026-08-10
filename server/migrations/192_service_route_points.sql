-- Migration 192: service_route_points — ordered route stops for a provider service.
-- CLAUDE.md ruling 22 (decision-maker ratified Aug 10, 2026).
-- Child rows of provider_services on the dmo_extracted_places pattern (migration 185):
-- ON DELETE CASCADE, UNIQUE (service_id, "position"). lat/lng nullable — an unlocated stop
-- is honestly coordinate-less (§13; never guessed onto the map). Additive, idempotent,
-- no CHECK (publish-trap avoidance); table + UNIQUE + index are ALSO declared in
-- shared/schema.ts so the deploy push cannot drop them (publish-trap rule).

CREATE TABLE IF NOT EXISTS service_route_points (
  id varchar PRIMARY KEY,
  service_id varchar NOT NULL REFERENCES provider_services(id) ON DELETE CASCADE,
  "position" integer NOT NULL,
  name varchar(255) NOT NULL,
  latitude decimal(10, 7),
  longitude decimal(10, 7),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT service_route_points_service_position_unique UNIQUE (service_id, "position")
);

CREATE INDEX IF NOT EXISTS service_route_points_service_idx
  ON service_route_points (service_id);
