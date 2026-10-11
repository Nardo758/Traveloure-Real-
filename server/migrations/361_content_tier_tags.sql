-- 361 — content-tier tags, COLUMNS ONLY (ledger `2026-10-09-fd2-content-tier-tags`; brief
-- docs/planning/briefs/fd-content-tiers-phase0.md §B/§C). SQL as held in PR #1367, APPROVED by the founder,
-- Oct 9, 2026 ("361, 362 and 363 approved"). ADDITIVE ONLY: every column nullable, no DEFAULT / CHECK / index /
-- FK, no backfill here (362 is the data). IF NOT EXISTS, so a second run is a no-op. Every column is declared in
-- shared/schema.ts (deploy-push durability rule). Value sets are app-enforced ONCE in shared/content-tiers.ts.
--
-- source_class — 'public' | 'local'; NULL = UNTAGGED, and an untagged row never reaches a draft (ruling 3).
-- reuse_class  — 'display_in_plan' | 'link_only' | 'internal' | 'reusable' (ruling 1), beside the unchanged
--                license / license_class.
-- author_label — 'Traveloure team' only on rows a person on the team seeded; never on machine output.
ALTER TABLE place_facts              ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE place_facts              ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE place_facts              ADD COLUMN IF NOT EXISTS author_label varchar(120);
ALTER TABLE place_facts              ADD COLUMN IF NOT EXISTS official_source_fact_id varchar;
ALTER TABLE travel_pulse_hidden_gems ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE travel_pulse_hidden_gems ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE travel_pulse_hidden_gems ADD COLUMN IF NOT EXISTS author_label varchar(120);
ALTER TABLE travel_pulse_hidden_gems ADD COLUMN IF NOT EXISTS verified_by  varchar;      -- ruling 3: the verifier IS the author
ALTER TABLE travel_pulse_hidden_gems ADD COLUMN IF NOT EXISTS verified_at  timestamp;
ALTER TABLE travel_pulse_hidden_gems ADD COLUMN IF NOT EXISTS expires_at   timestamp;
ALTER TABLE local_knowledge_nuggets  ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE local_knowledge_nuggets  ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE local_knowledge_nuggets  ADD COLUMN IF NOT EXISTS verified_at  timestamp;
ALTER TABLE local_knowledge_nuggets  ADD COLUMN IF NOT EXISTS expires_at   timestamp;
ALTER TABLE local_knowledge_nuggets  ADD COLUMN IF NOT EXISTS official_source_fact_id varchar;
ALTER TABLE city_events              ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE city_events              ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE destination_seasons      ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE destination_seasons      ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE city_neighborhoods       ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE city_neighborhoods       ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE city_neighborhoods       ADD COLUMN IF NOT EXISTS author_label varchar(120);
ALTER TABLE city_neighborhoods       ADD COLUMN IF NOT EXISTS authored_at  timestamp;
ALTER TABLE plan_options             ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE ready_made_trips         ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE ready_made_trips         ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE itinerary_items          ADD COLUMN IF NOT EXISTS source_class varchar(16);   -- ruling 9
