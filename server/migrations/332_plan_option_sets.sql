-- 332 — Plan option sets (Track A step A3; ledger `2026-09-29-a3-option-sets`; product map §E2
-- approved R124, §M1/§M7–M9 ratified `2026-09-29-m7-m9-ratified`).
--
-- TWO NEW TABLES born empty, with their indexes; NO CHECK, NO DB DEFAULT on status; all declared in
-- shared/schema.ts. Both UNIQUE indexes are on tables this same file creates, so a publish prompt
-- offering them is inside §20's new-object carve-out. Idempotent (IF NOT EXISTS throughout).
--
-- plan_option_sets — one slot being decided. Beyond §E2's columns it carries the two markers Part 4
-- named as owed by §M: `anchor_role` (primary | secondary | NULL = not an anchor, §3.2) and
-- `chosen_via` (choose | version_whole | version_stop, §3.5), plus `stop_position` (M1: one primary
-- per stop). One primary per (trip, stop) is APP-enforced inside one transaction, never a UNIQUE —
-- a promote swaps roles mid-transaction.
-- plan_options — one candidate. Beyond §E2's columns: `hotel_cache_id` (M9's engine source) and
-- `location_precision` (a pin is `exact` only when the traveler placed it or the source row carries
-- its own coordinates; NULL = unlocated, never guessed onto a map).

CREATE TABLE IF NOT EXISTS plan_option_sets (
  id varchar PRIMARY KEY,
  trip_id varchar NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  itinerary_item_id varchar REFERENCES itinerary_items(id) ON DELETE SET NULL,
  user_experience_id varchar REFERENCES user_experiences(id) ON DELETE SET NULL,
  day_number integer,
  category_key varchar(64),
  label varchar(120),
  status varchar(20) NOT NULL,
  anchor_role varchar(20),
  stop_position integer,
  chosen_option_id varchar,
  chosen_at timestamp,
  chosen_by varchar,
  chosen_via varchar(20),
  created_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_option_sets_trip ON plan_option_sets (trip_id);
CREATE UNIQUE INDEX IF NOT EXISTS plan_option_sets_open_item_uniq
  ON plan_option_sets (itinerary_item_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS plan_options (
  id varchar PRIMARY KEY,
  set_id varchar NOT NULL REFERENCES plan_option_sets(id) ON DELETE CASCADE,
  position integer NOT NULL,
  source_kind varchar(20) NOT NULL,
  provider_service_id varchar REFERENCES provider_services(id) ON DELETE SET NULL,
  affiliate_product_id varchar REFERENCES affiliate_products(id) ON DELETE SET NULL,
  hotel_cache_id varchar REFERENCES hotel_cache(id) ON DELETE SET NULL,
  title varchar(255) NOT NULL,
  location_name varchar(255),
  latitude decimal(10, 7),
  longitude decimal(10, 7),
  location_precision varchar(30),
  price_snapshot decimal(10, 2),
  added_by_user_id varchar,
  added_by_role varchar(20),
  expert_recommendation text,
  expert_recommended_by varchar,
  source_impression_id varchar,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_options_set_position_uniq ON plan_options (set_id, position);
