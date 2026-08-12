-- Migration 201: service_translations — per-service, per-locale translated CONTENT.
-- Ruling 60 Phase B (docs/DECISIONS.md ruling 60 / ruling 73; QA_PUNCH_LIST I18N-4).
--
-- Ruling 60 names TWO localization systems and forbids conflating them. Phase A (ruling 65)
-- shipped system A — CHROME (buttons/labels via i18next locale JSON), which SILENTLY falls
-- back to English because that is standard chrome behavior. This is system B — the provider's
-- OWN traveler-facing CONTENT (listing name/descriptions/meeting-point text). CONTENT must NOT
-- silently masquerade: an untranslated listing shows the ORIGINAL with an explicit
-- "shown in English / 原文（英語）" label, and an UNAPPROVED draft is NEVER shown to a traveler
-- (§13 applied to language).
--
-- Child rows of provider_services on the service_route_points / service_attestations pattern
-- (migrations 192/197): ON DELETE CASCADE, UNIQUE (service_id, locale). Only genuine free-text
-- CONTENT columns are translatable — NOT enums/prices/IDs (§14: identity/amount never travel
-- through here). `status` ('draft' | 'approved') and `source` ('human' | 'ai_draft') are
-- app-enforced varchars with NO DB CHECK (the migration-144/195 posture — a CHECK over an app
-- vocabulary is the publish-time deploy-push failure CLAUDE.md warns about). `source='ai_draft'`
-- makes a machine draft labeled BY CONSTRUCTION. `updated_by` is the SESSION user, stamped
-- server-side (§14 — never from req.body), ON DELETE SET NULL because deleting an account must
-- not erase the historical fact that a translation was authored.
--
-- Additive, idempotent, no CHECK (publish-trap avoidance); table + UNIQUE + index are ALSO
-- declared in shared/schema.ts so the deploy push cannot drop them (publish-trap rule).

CREATE TABLE IF NOT EXISTS service_translations (
  id varchar PRIMARY KEY,
  service_id varchar NOT NULL REFERENCES provider_services(id) ON DELETE CASCADE,
  locale varchar(8) NOT NULL,
  service_name varchar(255),
  short_description varchar(150),
  description text,
  meeting_point text,
  status varchar(20) NOT NULL DEFAULT 'draft',   -- 'draft' | 'approved' (app-enforced, no CHECK)
  source varchar(20) NOT NULL DEFAULT 'human',   -- 'human' | 'ai_draft' (app-enforced, no CHECK)
  updated_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT service_translations_service_locale_unique UNIQUE (service_id, locale)
);

CREATE INDEX IF NOT EXISTS service_translations_service_idx
  ON service_translations (service_id);
