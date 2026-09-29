-- 333 — Content facts: the source registry and the one fact table (Track A step A5; content
-- sourcing brief `docs/planning/briefs/content-sourcing-brief.md` §3/§5; ledger
-- `2026-09-29-a5-draft-open-set`). HELD FOR RULING before merge (dispatch: "migration → hold").
--
-- TWO NEW TABLES born empty, with their indexes; NO CHECK (every value set is app-enforced and
-- stated ONCE in shared/content-facts.ts), NO DB DEFAULT on a status column; all declared in
-- shared/schema.ts. No UNIQUE index at all, so a publish prompt offering these objects is inside
-- §20's new-object carve-out with nothing to pre-check. Idempotent (IF NOT EXISTS throughout).
-- NO SEED: a source is added by an admin through a surface, never by a deploy (brief §5).
--
-- content_sources — the registry, one row per site/API/feed, organised by need (brief §5).
--   `active` is NOT NULL with no default: the writer states it, and no source goes active without
--   `terms_checked_at` and a license class (app-enforced, `canActivateSource`).
-- place_facts — every fact the engine can use, with its provenance (brief §3). Insert-only: a
--   superseded fact points at its successor (`superseded_by`); there is no DELETE path.
--   Two columns beyond §3, stated: `itinerary_item_id` (which plan item the fact was fetched for, so
--   a plan reads its own facts without a second mapping table) and `place_lat`/`place_lng` (§3's
--   "free-text + coords" ref, split into columns rather than packed into a string).

CREATE TABLE IF NOT EXISTS content_sources (
  id varchar(64) PRIMARY KEY,
  name varchar(200) NOT NULL,
  homepage text,
  market varchar(64),
  adapter varchar(30) NOT NULL,
  covers text[] NOT NULL,
  does_not_cover text[] NOT NULL,
  license_class varchar(20) NOT NULL,
  terms_url text,
  terms_checked_at timestamp,
  terms_checked_by varchar REFERENCES users(id) ON DELETE SET NULL,
  robots_ok boolean,
  refresh_interval_days integer,
  cost_ceiling_cents_per_day integer,
  active boolean NOT NULL,
  added_by varchar REFERENCES users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_sources_market ON content_sources (market);

CREATE TABLE IF NOT EXISTS place_facts (
  id varchar PRIMARY KEY,
  place_ref_kind varchar(20) NOT NULL,
  place_ref varchar(300) NOT NULL,
  place_lat decimal(10, 7),
  place_lng decimal(10, 7),
  market varchar(64),
  need varchar(40) NOT NULL,
  fact_type varchar(30) NOT NULL,
  value jsonb NOT NULL,
  origin varchar(30) NOT NULL,
  source_id varchar(64) REFERENCES content_sources(id) ON DELETE SET NULL,
  source_url text,
  license varchar(20),
  fetched_at timestamp NOT NULL,
  expires_at timestamp,
  verified_by varchar REFERENCES users(id) ON DELETE SET NULL,
  verified_at timestamp,
  cost_cents decimal(10, 3),
  plan_id varchar REFERENCES trips(id) ON DELETE SET NULL,
  itinerary_item_id varchar REFERENCES itinerary_items(id) ON DELETE SET NULL,
  superseded_by varchar,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_place_facts_ref ON place_facts (place_ref_kind, place_ref);
CREATE INDEX IF NOT EXISTS idx_place_facts_plan ON place_facts (plan_id);
CREATE INDEX IF NOT EXISTS idx_place_facts_item ON place_facts (itinerary_item_id);
