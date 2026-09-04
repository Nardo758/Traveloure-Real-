-- Migration 283: the six PLANNER roles, in the EXPERT catalog.
-- Ledger `2026-09-04-earn-planner-roles`; CLAUDE.md Locked Decision 36.
--
-- WHY THIS EXISTS
-- ───────────────
-- The /earn "Event Planner" card listed `service_offering_types` rows — the PROVIDER catalog
-- (the ten EVENT_CATEGORY_KEYS) — while its "I plan & coordinate events" door went to
-- /become-expert?type=event_planner, whose `local_expert_forms.offering_type_key` FKs into
-- `expert_offering_types` (migration 107). The expert catalog held NO planner rows, so every
-- key that door carried was unknown to the FK target and `storage.createLocalExpertForm`
-- clamped it to NULL — silently. A planner could pick "Proposal Planner" on /earn and the
-- platform recorded no offering at all.
--
-- These six rows are the expert-catalog home the planner door needed. They are NOT a copy of
-- the provider rows and the two catalogs are NOT merged (§4): a provider row is a VENDOR
-- someone books, an expert row here is a COORDINATOR who runs the whole event.
--
-- NO NEW TIER. `expert_offering_types.service_tier` carries a DB CHECK over exactly five
-- values (`000_baseline_schema.sql`, tightened by 037); adding a sixth is precisely the
-- publish-time drizzle-push CHECK failure the Coordination Prevention rules warn about. All
-- six rows land in the EXISTING `coordination` tier, which already means "done-for-you
-- execution" (`done_for_you_booking`, `group_trip_coord`, `vendor_wrangler`,
-- `occasion_coordination`). The Event Planner track is partitioned by an explicit KEY LIST
-- (`EVENT_PLANNER_OFFERING_KEYS`, client/src/lib/earn-roles.ts), never by tier — so the other
-- coordination rows stay on Trip Planner where they belong.
--
-- KEYS ARE UNSUFFIXED, DELIBERATELY. `expert_offering_types` and `service_offering_types` are
-- separate tables with separate primary keys and separate UNIQUE(offering_type_key)
-- constraints — they do NOT share a namespace, so `proposal_planner`, `party_planner` and
-- `date_night_designer` may exist in both. That is also the better answer for the funnel:
-- /start/events forwards `?offeringTypeKey=` to BOTH doors, so a shared key resolves in
-- whichever catalog the person's chosen door reads, while a suffixed key would resolve in one
-- and dangle in the other. `wedding_planner`, `wedding_day_of_coordinator` and
-- `corporate_event_coordinator` collide with nothing (the provider catalog spells those
-- `wedding_coordinator` and `corporate_event_coord`). `proposal_stager` stays a VENDOR row and
-- gets no expert twin — staging a proposal is a service you book, not an event you coordinate.
--
-- DELIVERY FORMATS: `in_person` + `hybrid`. Coordinating an event happens on the ground.
-- `delivery_formats` carries no DB CHECK, and both values are already understood by the
-- ServiceForm's `tierFormatsToAllowedMethods` map (→ "in-person" / "hybrid").
--
-- Idempotent: ON CONFLICT (offering_type_key) DO NOTHING, so a re-run adds nothing and — unlike
-- migrations 098/099 — never re-activates a row an admin deliberately deactivated.

INSERT INTO expert_offering_types
  (offering_type_key, service_tier, display_name, tagline, delivery_formats, is_surprising, sort_order)
VALUES
  ('wedding_planner',             'coordination', 'Wedding planner',              'Run the whole wedding, start to finish.',        ARRAY['in_person','hybrid'], false, 50),
  ('wedding_day_of_coordinator',  'coordination', 'Wedding day-of coordinator',   'Take the plan they made and run the day.',       ARRAY['in_person','hybrid'], false, 51),
  ('proposal_planner',            'coordination', 'Proposal planner',             'Design and run the moment end to end.',          ARRAY['in_person','hybrid'], false, 52),
  ('party_planner',               'coordination', 'Birthday and party planner',   'Celebrations away from home, coordinated.',      ARRAY['in_person','hybrid'], false, 53),
  ('corporate_event_coordinator', 'coordination', 'Corporate event coordinator',  'Offsites, dinners and launches, run for you.',   ARRAY['in_person','hybrid'], false, 54),
  ('date_night_designer',         'coordination', 'Date-night designer',          'One evening, planned and executed.',             ARRAY['in_person','hybrid'], false, 55)
ON CONFLICT (offering_type_key) DO NOTHING;
