-- 435_guest_plan_one_per_session.sql
-- A-5 (ledger 2026-11-05-lane1-guest-save-rail): one live guest plan per guest session. Shape per the Lane 1 rulings
-- (Nov 5, 2026): dedupe step keeps the EARLIEST plan per hash, reassigns items to it, deletes the rest; then a unique
-- partial index; the server get-or-creates (guest-plan.service.ts createGuestPlan).
--
-- Scope: unclaimed guest plans only (guest_session_hash set, guest_claimed_at NULL). No account's plan is read or written.
-- An item whose source the earliest plan already holds (the same content link, listing or partner product) is not moved:
-- it is the same save twice, and it goes with its plan (items cascade). Every other item is moved.
-- The index is declared in shared/schema.ts (publish-trap rule). Data step + index; no column, no CHECK, no DEFAULT.

-- 1. Move each later plan's items to the earliest plan of its session.
WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY guest_session_hash ORDER BY created_at ASC NULLS LAST, id ASC) AS keep_id
  FROM trips
  WHERE guest_session_hash IS NOT NULL AND guest_claimed_at IS NULL
)
UPDATE itinerary_items AS i
SET trip_id = r.keep_id
FROM ranked AS r
WHERE i.trip_id = r.id
  AND r.id <> r.keep_id
  AND NOT EXISTS (
    SELECT 1 FROM itinerary_items AS k
    WHERE k.trip_id = r.keep_id
      AND (
        (i.content_id IS NOT NULL AND k.content_type IS NOT DISTINCT FROM i.content_type AND k.content_id = i.content_id)
        OR (i.provider_service_id IS NOT NULL AND k.provider_service_id = i.provider_service_id)
        OR (i.affiliate_product_id IS NOT NULL AND k.affiliate_product_id = i.affiliate_product_id)
      )
  );

-- 2. Delete the later plans (their remaining items cascade).
WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY guest_session_hash ORDER BY created_at ASC NULLS LAST, id ASC) AS keep_id
  FROM trips
  WHERE guest_session_hash IS NOT NULL AND guest_claimed_at IS NULL
)
DELETE FROM trips WHERE id IN (SELECT id FROM ranked WHERE id <> keep_id);

-- 3. At most one live guest plan per session.
CREATE UNIQUE INDEX IF NOT EXISTS trips_guest_session_live_uidx ON trips (guest_session_hash)
  WHERE guest_session_hash IS NOT NULL AND guest_claimed_at IS NULL;
