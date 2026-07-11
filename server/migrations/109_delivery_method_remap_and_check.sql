-- Migration 109: delivery_method row remap + CHECK constraint
-- (Structural consolidation brief, Phase 1d — remap table approved by the
-- decision-maker 2026-07-11 with the amended CHECK set; decision D3a.)
--
-- Canonical vocabulary (deliveryMethodEnum, shared/schema.ts — D3a locked):
--   pdf, video, call, in_person, voice_notes, async_messaging, hybrid
--
-- Approved remaps (applied to BOTH delivery_method tables):
--   video-call → video      (locked: NOT call — the schema distinguishes a
--                            live/recorded video session from a voice call)
--   in-person  → in_person  (spelling normalization, zero semantic loss)
--   document   → pdf        (flatten: zero document rows in production
--                            provider_services; the only real rows are the two
--                            CANONICAL_TEMPLATES seed rows in service_templates.
--                            'document' is NOT added to the enum and is NOT in
--                            the CHECK set.)
--
-- Production distribution at approval time (provider_services, 105 rows):
--   pdf 67 · in_person 35 · call 2 · async_messaging 1 — no NULLs, no
--   non-canonical values; the remaps are no-ops there. service_templates
--   carries document ×2 / hybrid ×2 / video ×2 (startup seeder) in every
--   environment — the document rows are this migration's real work.
--
-- The CHECK rides here atomically (decision-maker call: constraint lands the
-- moment the bad values are gone, never loose between migrations). NULL stays
-- allowed. The companion commit fixes the CANONICAL_TEMPLATES seeder literals
-- (server/routes.ts) from 'document' to 'pdf' so fresh environments seed
-- CHECK-clean values.
--
-- Refusal guard: any value outside {canonical ∪ mapped ∪ NULL} in either table
-- aborts the migration with the offending values listed — no half-apply.

DO $$
DECLARE
  bad_ps TEXT;
  bad_st TEXT;
BEGIN
  IF to_regclass('provider_services') IS NULL OR to_regclass('service_templates') IS NULL THEN
    RAISE EXCEPTION 'Migration 109 REFUSED: provider_services / service_templates missing';
  END IF;

  SELECT string_agg(DISTINCT delivery_method, ', ')
    INTO bad_ps
    FROM provider_services
    WHERE delivery_method IS NOT NULL
      AND delivery_method NOT IN (
        'pdf','video','call','in_person','voice_notes','async_messaging','hybrid',
        'video-call','in-person','document');

  SELECT string_agg(DISTINCT delivery_method, ', ')
    INTO bad_st
    FROM service_templates
    WHERE delivery_method IS NOT NULL
      AND delivery_method NOT IN (
        'pdf','video','call','in_person','voice_notes','async_messaging','hybrid',
        'video-call','in-person','document');

  IF bad_ps IS NOT NULL OR bad_st IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration 109 REFUSED: unmapped delivery_method value(s) — provider_services: [%] service_templates: [%]. Extend the approved remap table before running.',
      COALESCE(bad_ps, ''), COALESCE(bad_st, '');
  END IF;
END $$;

UPDATE provider_services SET delivery_method = 'video'     WHERE delivery_method = 'video-call';
UPDATE provider_services SET delivery_method = 'in_person' WHERE delivery_method = 'in-person';
UPDATE provider_services SET delivery_method = 'pdf'       WHERE delivery_method = 'document';

UPDATE service_templates SET delivery_method = 'video'     WHERE delivery_method = 'video-call';
UPDATE service_templates SET delivery_method = 'in_person' WHERE delivery_method = 'in-person';
UPDATE service_templates SET delivery_method = 'pdf'       WHERE delivery_method = 'document';

-- CHECKs — idempotent via pg_constraint probe (ADD CONSTRAINT has no IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'provider_services'::regclass AND conname = 'provider_services_delivery_method_check'
  ) THEN
    ALTER TABLE provider_services
      ADD CONSTRAINT provider_services_delivery_method_check
      CHECK (delivery_method IS NULL OR delivery_method IN
        ('pdf','video','call','in_person','voice_notes','async_messaging','hybrid'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'service_templates'::regclass AND conname = 'service_templates_delivery_method_check'
  ) THEN
    ALTER TABLE service_templates
      ADD CONSTRAINT service_templates_delivery_method_check
      CHECK (delivery_method IS NULL OR delivery_method IN
        ('pdf','video','call','in_person','voice_notes','async_messaging','hybrid'));
  END IF;
END $$;

-- Reversal (manual):
--   ALTER TABLE provider_services DROP CONSTRAINT IF EXISTS provider_services_delivery_method_check;
--   ALTER TABLE service_templates DROP CONSTRAINT IF EXISTS service_templates_delivery_method_check;
--   (the row remaps are one-way by design; the pre-remap values were never canonical)
