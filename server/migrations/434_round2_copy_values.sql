-- 434_round2_copy_values.sql
-- Round 2 COPY rows K-1 and K-3 (ledger 2026-11-04-round2-exp-qa). DATA ONLY: no ALTER, no CHECK, no index, no DEFAULT.
-- Per the round 2 rulings (Nov 4, 2026): "two UPDATEs keyed on the exact current string, expected rowcount 1 each".
-- Wording per the same rulings: K-1 "Local Perfect Day" → "A Local's Day"; K-3 drop "perfect".
-- Each UPDATE matches only the exact stored text, so a re-run, or a row an admin already edited, changes nothing.
-- The seed (server/seed-experience-types.ts) carries the new description, so a fresh database is born with it.

-- K-1: the offering label behind "… wanted in {neighbourhood}" on the city page (seeded by migration 062).
UPDATE expert_offering_types SET display_name = 'A Local''s Day'
  WHERE offering_type_key = 'local_perfect_day' AND display_name = 'Local Perfect Day';

-- K-3: the "Travel" occasion's description, shown under "More specific".
UPDATE experience_types SET description = 'Plan your trip with activities, accommodations, and services'
  WHERE slug = 'travel' AND description = 'Plan your perfect trip with activities, accommodations, and services';
