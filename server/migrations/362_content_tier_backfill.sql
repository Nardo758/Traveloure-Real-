-- 362 — content-tier tags, BACKFILL ONLY (ledger `2026-10-09-fd2-content-tier-tags`). APPROVED by the founder,
-- Oct 9, 2026. DATA ONLY: no ALTER, CHECK, index or DEFAULT change. Idempotent: every UPDATE is guarded by
-- source_class IS NULL, so a second run touches 0 rows and nothing an admin set is clobbered.
-- Left untagged on purpose: AI-written gems (ruling 3), night-scene (none exists, ruling 7), legacy
-- plan_options / itinerary_items (stamped at write time from now on; NULL is never guessed, §13).

-- place_facts: Places = display in plan; crawled facts follow the license mapping (ruling 1/2);
-- expert-confirmed nuggets are local and ours.
UPDATE place_facts SET source_class = 'public', reuse_class = 'display_in_plan'
  WHERE source_class IS NULL AND origin = 'places_api';
UPDATE place_facts SET source_class = 'public',
       reuse_class = CASE license WHEN 'restricted' THEN 'display_in_plan'
                                  WHEN 'partner'    THEN 'internal'
                                  ELSE 'link_only' END                  -- official, editorial
  WHERE source_class IS NULL AND origin = 'crawled';
UPDATE place_facts SET source_class = 'local', reuse_class = 'reusable'
  WHERE source_class IS NULL AND origin = 'expert_nugget';

-- Gems: expert-curated ⇒ local, verified by the curator; team-seeded (not AI) ⇒ local, "Traveloure team".
-- AI-written gems (ai_generated = true, no curator) are LEFT UNTAGGED — ruling 3.
UPDATE travel_pulse_hidden_gems SET source_class = 'local', reuse_class = 'reusable',
       verified_by = COALESCE(verified_by, curated_by_expert_id),
       verified_at = COALESCE(verified_at, detected_at)
  WHERE source_class IS NULL AND curated_by_expert_id IS NOT NULL;
UPDATE travel_pulse_hidden_gems SET source_class = 'local', reuse_class = 'reusable',
       author_label = 'Traveloure team', verified_at = COALESCE(verified_at, detected_at)
  WHERE source_class IS NULL AND curated_by_expert_id IS NULL AND COALESCE(ai_generated, false) = false;

-- Expert nuggets: local, authored and verified by the expert who wrote them.
UPDATE local_knowledge_nuggets SET source_class = 'local', reuse_class = 'reusable',
       verified_at = COALESCE(verified_at, created_at)
  WHERE source_class IS NULL;

-- Public events: public, link only (the free draft keeps its events list — ruling 2).
UPDATE city_events SET source_class = 'public', reuse_class = 'link_only'
  WHERE source_class IS NULL;

-- Seasons: ours, public.
UPDATE destination_seasons SET source_class = 'public', reuse_class = 'reusable'
  WHERE source_class IS NULL;

-- Neighbourhood descriptions: public (ruling 4), team-seeded.
UPDATE city_neighborhoods SET source_class = 'public', reuse_class = 'reusable',
       author_label = 'Traveloure team', authored_at = COALESCE(authored_at, created_at)
  WHERE source_class IS NULL;

-- Ready Made: expert-authored, local.
UPDATE ready_made_trips SET source_class = 'local', reuse_class = 'reusable'
  WHERE source_class IS NULL;
