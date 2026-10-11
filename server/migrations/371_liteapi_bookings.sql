-- 371 — liteapi_bookings (ledger `2026-10-10-s1-d3a-liteapi-booking`; brief
-- docs/planning/briefs/s1-d3-liteapi-booking.md). HELD: merges only with "Migration 371 SQL approved — Leon"
-- on the S1-d-3a PR. Approved in principle by the decision-maker, Oct 10, 2026 (S1-d-3 ruling 1).
--
-- A NEW table, born EMPTY, so its two UNIQUE indexes cannot be violated at creation (§20's born-object
-- carve-out). NO FK: a booking Nuitée took money for must outlive a deleted plan, item, hotel row or account,
-- so every link is app-enforced. NO DEFAULT on `status` and NO CHECK: the value set lives ONCE in
-- shared/liteapi-booking.ts. IF NOT EXISTS throughout, so a second run is a no-op. Table and all three
-- indexes are declared in shared/schema.ts.
--
-- One row per prebook. ONE writer: server/services/liteapi-booking.service.ts. The prebookId/transactionId
-- pair is written here BEFORE the Payment SDK opens, because LiteAPI cannot hand it back later.
CREATE TABLE IF NOT EXISTS liteapi_bookings (
  id                       varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id                  varchar NOT NULL,
  itinerary_item_id        varchar NOT NULL,
  user_id                  varchar NOT NULL,
  hotel_cache_id           varchar,
  provider_hotel_id        varchar(64) NOT NULL,
  env                      varchar(16) NOT NULL,
  status                   varchar(20) NOT NULL,
  offer_id                 text NOT NULL,
  prebook_id               varchar(128) NOT NULL,
  transaction_id           varchar(128) NOT NULL,
  liteapi_booking_id       varchar(128),
  hotel_confirmation_code  varchar(128),
  checkin                  date NOT NULL,
  checkout                 date NOT NULL,
  adults                   integer NOT NULL,
  amount_cents             integer NOT NULL,
  currency                 varchar(3) NOT NULL,
  commission_cents         integer,
  processing_fee_cents     integer,
  cancellation_policy      jsonb,
  failure_reason           text,
  claimed_at               timestamp,
  booked_at                timestamp,
  cancelling_at            timestamp,
  cancelled_at             timestamp,
  last_synced_at           timestamp,
  last_sync_status         varchar(32),
  created_at               timestamp NOT NULL DEFAULT now(),
  updated_at               timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_liteapi_bookings_prebook ON liteapi_bookings (prebook_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_liteapi_bookings_live_item ON liteapi_bookings (itinerary_item_id)
  WHERE status IN ('booking', 'confirmed', 'cancelling');
CREATE INDEX IF NOT EXISTS idx_liteapi_bookings_status ON liteapi_bookings (status);
