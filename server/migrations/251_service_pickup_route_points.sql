-- Pickup-route stops are intentionally distinct from service_route_points:
-- the former describes where travelers can be collected; the latter describes
-- the ordered places the service visits.
CREATE TABLE IF NOT EXISTS service_pickup_route_points (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id VARCHAR NOT NULL REFERENCES provider_services(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT service_pickup_route_points_service_position_unique UNIQUE (service_id, position)
);

CREATE INDEX IF NOT EXISTS service_pickup_route_points_service_idx
  ON service_pickup_route_points(service_id);