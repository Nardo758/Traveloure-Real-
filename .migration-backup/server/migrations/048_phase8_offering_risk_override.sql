-- Phase 8.2.5 (offering-level risk override).
--
-- Adds a per-offering risk override that supersedes the category default.
-- Used by the Phase 5 eligibility engine to suppress high-risk offerings
-- for family / low-mobility trips, without making the whole category high.
--
-- Example: activity_provider stays moderate (workshops, tea, cooking) so it
-- doesn't get suppressed for family trips — but sport_instructor escalates
-- to high so it does. Without this column the only choices were "escalate
-- the entire category" (wrong default) or "leave it moderate and accept the
-- safety gap" (also wrong).
--
-- Enum: low | moderate | high | specialized.
-- specialized = "extreme" — currently used for nothing in this seed; future
-- inserts (mountaineering, scuba, etc.) would land there. Insurance escalation
-- derived from specialized is a later follow-on, NOT this commit.
--
-- This commit ONLY adds the field + seeds the one row the user named.
-- Phase 5 will read it for eligibility suppression.

ALTER TABLE service_offering_types
  ADD COLUMN IF NOT EXISTS risk_override VARCHAR(20);

-- CHECK constraint for the enum. Idempotent: drop-if-exists then add.
ALTER TABLE service_offering_types
  DROP CONSTRAINT IF EXISTS service_offering_types_risk_override_chk;

ALTER TABLE service_offering_types
  ADD CONSTRAINT service_offering_types_risk_override_chk
  CHECK (risk_override IS NULL OR risk_override IN ('low', 'moderate', 'high', 'specialized'));

-- Seed: sport_instructor escalates to 'high'. Surf / Bike / Kayak / Climb
-- bundles all read as adventure even though some sub-variants (e.g. flat-water
-- kayaking) are tame. Conservative default: high. If/when this is split into
-- separate offering types by sport, individual rows can drop back to moderate.
UPDATE service_offering_types
SET risk_override = 'high'
WHERE offering_type_key = 'sport_instructor';

-- ─── Assert exactly the intended row is set; null everywhere else ────────────
DO $$
DECLARE
  unexpected_overrides TEXT;
  expected_set INT;
BEGIN
  -- Any offering with a non-null risk_override that isn't in the intended set?
  SELECT string_agg(offering_type_key, ', ' ORDER BY offering_type_key)
    INTO unexpected_overrides
    FROM service_offering_types
    WHERE risk_override IS NOT NULL
      AND offering_type_key NOT IN ('sport_instructor');

  IF unexpected_overrides IS NOT NULL THEN
    RAISE EXCEPTION
      'Phase 8.2.5 gate FAILED: unexpected risk_override on offering_type_key(s): %', unexpected_overrides;
  END IF;

  -- Intended set actually populated?
  SELECT COUNT(*) INTO expected_set
    FROM service_offering_types
    WHERE offering_type_key = 'sport_instructor' AND risk_override = 'high';

  IF expected_set <> 1 THEN
    RAISE EXCEPTION
      'Phase 8.2.5 gate FAILED: sport_instructor risk_override = high not set (found % matching rows)', expected_set;
  END IF;
END$$;
