-- 370 — transport_option_events (ledger `2026-10-11-tc3b-ride-recommender`; TC-3 brief rev 1, lane TC-3b;
-- decision-maker rulings 1–4, Oct 11, 2026). HELD: merges only with Leon's approval comment on the TC-3b PR.
--
-- A NEW table, born EMPTY, so its UNIQUE index cannot be violated at creation (§20's born-object carve-out).
-- One row per trip × corridor × ride service × event: `offered` once (written when the plan card first serves
-- the suggestion), `accepted` when the ride is inserted through the ride route, `skipped` from the owner-only
-- dismiss route. The UNIQUE index IS the dedupe: every writer inserts ON CONFLICT DO NOTHING.
-- NO FK: the log outlives a deleted plan, item or listing (it is the acceptance record rule 8 ranks by). NO
-- DEFAULT and NO CHECK on `event`: the value set lives ONCE in shared/transport-option-events.ts. IF NOT EXISTS
-- throughout, so a second run is a no-op. Table and both indexes are declared in shared/schema.ts.
-- ONE writer: server/services/transport-option-events.service.ts.
CREATE TABLE IF NOT EXISTS transport_option_events (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id       varchar NOT NULL,
  corridor_key  varchar(160) NOT NULL,
  service_id    varchar NOT NULL,
  event         varchar(16) NOT NULL,
  day_number    integer,
  leg_id        varchar,
  occasion      varchar(50),
  created_at    timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transport_option_events_once
  ON transport_option_events (trip_id, corridor_key, service_id, event);
CREATE INDEX IF NOT EXISTS idx_transport_option_events_service ON transport_option_events (service_id, event);
