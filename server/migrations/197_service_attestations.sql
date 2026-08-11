-- Migration 197: service_attestations — D9 onboarding attestations keyed to delivery method +
-- category risk (docs/DECISIONS.md ruling 62's D9 clause, executed by ruling 67).
--
-- SHAPE: child rows of provider_services on the dmo_extracted_places (185) / service_route_points
-- (192) pattern — ON DELETE CASCADE, composite UNIQUE (service_id, attestation_key). The UNIQUE is
-- what makes re-affirming idempotent: the write path is INSERT … ON CONFLICT DO NOTHING, so a
-- double-click or a re-save produces exactly ONE row carrying the FIRST affirmation's timestamp.
--
-- WHY A TABLE AND NOT A JSONB COLUMN: an attestation is an evidentiary record — who said it and
-- when — and the class-B jsonb remediation posture in this repo (ruling 13) says a fact that must
-- be queried, joined to a user, or read back years later does not belong in a blob. Rows also give
-- the UNIQUE that makes idempotency structural rather than application logic.
--
-- affirmed_by is the SESSION user, stamped server-side (§14: never req.body). ON DELETE SET NULL —
-- deleting an account must not delete the historical fact that the attestation was made.
--
-- NO CHECK on attestation_key: the vocabulary is app-enforced in shared/service-attestations.ts
-- (the migration-144/195 posture — a CHECK over an app vocabulary is exactly the publish-time
-- deploy-push failure CLAUDE.md warns about). Additive, idempotent. Table + UNIQUE + index are ALSO
-- declared in shared/schema.ts so the deploy push cannot drop them (publish-trap rule).
--
-- NEGATIVE SPACE: there is no un-affirm path and no UPDATE path. An affirmation is append-only —
-- a provider who stops meeting a condition changes their listing, they do not un-say a sentence
-- they said on a date.

CREATE TABLE IF NOT EXISTS service_attestations (
  id varchar PRIMARY KEY,
  service_id varchar NOT NULL REFERENCES provider_services(id) ON DELETE CASCADE,
  attestation_key varchar(64) NOT NULL,
  affirmed_at timestamp NOT NULL DEFAULT now(),
  affirmed_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT now(),
  CONSTRAINT service_attestations_service_key_unique UNIQUE (service_id, attestation_key)
);

CREATE INDEX IF NOT EXISTS service_attestations_service_idx
  ON service_attestations (service_id);
