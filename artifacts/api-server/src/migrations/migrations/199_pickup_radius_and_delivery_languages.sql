-- 199_pickup_radius_and_delivery_languages.sql — SS-4 + SS-6 (docs/DECISIONS.md ruling 69,
-- dispositions 9). Two additive-nullable columns on `provider_services`, in ONE migration because
-- they are one ratification, land on one table, and share one publish-trap posture. Neither is a
-- money, identity or rate field (§14/§18/§19): both are ordinary owner-authored listing facts.
--
-- ════ (a) SS-4 — pickup radius is SPLIT from service radius ═══════════════════════════════════
-- Measured defect (QA_PUNCH_LIST SS-4): `#serviceRadius` ("Service Radius (km)") and
-- `#coverageRadius` ("Pickup radius (km)") render SIMULTANEOUSLY for a pickup operator and BOTH
-- write `provider_services.service_radius` — typing 17 into one made the other read 17. For a
-- transfer/tour operator "how far I travel to work" and "how far I collect from" are genuinely
-- different numbers; Tier A only labelled them as one value.
--
-- NEVER-CLOBBER (the disposition's own words, and ruling 62's amendment posture one lane over):
-- `service_radius` is UNTOUCHED. There is NO BACKFILL — a row whose single radius was typed under
-- the old two-labels-one-column UI keeps exactly the number it has, and we do not presume to know
-- which of the two meanings the provider intended by it. NULL therefore means "not set" and MUST
-- render as such (§13), never as 0 and never as a copy of the service radius.
--
-- ════ (b) SS-6 — delivery language ═══════════════════════════════════════════════════════════
-- Measured (QA_PUNCH_LIST SS-6): an `information_schema` sweep found the only language columns are
-- `local_expert_forms.languages`, `service_gap_analysis.language_gaps` and
-- `trip_emergency_contacts.languages`. Providers had none, and the traveler page showed no
-- language at all. In Kyoto delivery language is a PURCHASABLE ATTRIBUTE (shared tea-ceremony
-- sessions commonly run in Japanese with English requiring a private session).
--
-- TYPE AUDITED, NOT GUESSED: this follows `local_expert_forms.languages` — `jsonb`, array of
-- strings. Deliberately DEFAULT NULL rather than that column's `'[]'`, because NULL and `[]` must
-- stay distinguishable here: NULL = "the provider never told us" (render nothing), `[]` = "they
-- opened the field and cleared it". §13 forbids the alternative that matters most — an absent
-- value must NEVER render as a default "English".
--
-- DISTINCT FROM RULING 60, stated because the names collide: ruling 60 ratified (A) UI chrome
-- translation and (B) provider CONTENT translation. Neither is "what language is the experience
-- delivered in". This column is the third thing.
--
-- PUBLISH-TRAP POSTURE (CLAUDE.md): additive, nullable, NO CHECK, NO DEFAULT on the radius, no
-- backfill — so the Autoscale deploy-push cannot fail on rows already on disk. BOTH columns are
-- DECLARED in shared/schema.ts in the SAME commit: an undeclared object is dropped by the push
-- and, because this migration is stamped after its first run, would never be recreated.

ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS pickup_radius_km INTEGER;
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS delivery_languages JSONB;

COMMENT ON COLUMN provider_services.pickup_radius_km IS
  'SS-4 (ruling 69). How far the provider will travel TO COLLECT a traveler, in km. Distinct from '
  'service_radius (how far they travel to work). NULL = not set — never 0, never a copy of '
  'service_radius. No backfill: the pre-split single value stays on service_radius untouched.';

COMMENT ON COLUMN provider_services.delivery_languages IS
  'SS-6 (ruling 69). JSONB array of language names the service is DELIVERED in. Follows '
  'local_expert_forms.languages. NULL = never captured (render nothing — never a default '
  '"English"); [] = deliberately cleared. Distinct from ruling 60 chrome/content translation.';
