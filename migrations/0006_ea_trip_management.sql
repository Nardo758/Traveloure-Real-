-- EA → Marketplace integration: allow trips to be managed by an EA on behalf of a client.
-- The trip's userId remains the traveler (so all existing traveler views still work);
-- managed_by_ea_id is set when an EA is delegated to coordinate the trip end-to-end.

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS managed_by_ea_id varchar
    REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS ea_client_relationship_id varchar
    REFERENCES ea_client_relationships(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trips_managed_by_ea_id
  ON trips(managed_by_ea_id)
  WHERE managed_by_ea_id IS NOT NULL;
