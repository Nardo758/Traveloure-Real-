-- Migration 155: re-assert the UNIQUE partial index on service_bookings.idempotency_key —
-- the DB half of the §15 checkout idempotency guard.
--
-- GROUND TRUTH (why this exists when 096 already ran):
--   Migration 096 created `service_bookings_idempotency_key_idx` (UNIQUE, WHERE
--   idempotency_key IS NOT NULL). But that index is declared ONLY in raw migration SQL —
--   `shared/schema.ts` carries `idempotencyKey: text("idempotency_key")` with no uniqueness.
--   Per the CLAUDE.md "Replit deploy-push" note, publish runs an automatic drizzle-kit
--   schema-push from shared/schema.ts, which therefore does not know about this index. A
--   push-canonical or freshly-pushed environment can consequently be missing it, and 096 is
--   already stamped so it will never recreate it. Without the index, POST /api/checkout's
--   idempotency dedup silently degrades from an atomic DB claim to a check-then-insert
--   (TOCTOU) — the §15 bug shape, on the money path.
--
--   This migration re-asserts the index so the guard is present wherever migrations run. On
--   any DB that already has it (i.e. every environment where 096 executed) this is a no-op.
--
-- WHY NOT declare it in shared/schema.ts instead: adding uniqueness there would make the
--   publish-time drizzle push enforce it, and a push that meets pre-existing duplicate
--   non-NULL keys fails the deploy and offers the DESTRUCTIVE "copy dev over production"
--   option. Whether prod holds such duplicates cannot be verified from here, so that is
--   flagged for the decision-maker rather than done silently. (It should hold none: 096's
--   index has been rejecting them — indeed it was rejecting LEGITIMATE multi-item checkouts,
--   the P0 the companion code change fixes by suffixing rows 2..n.)
--
-- GUARDED: if duplicate non-NULL keys somehow already exist, the unique index is SKIPPED with
-- a NOTICE (and a plain index is created so the dedup SELECT still has support) rather than
-- failing startup. The migration runner is fail-fast and this is not a data-integrity remap
-- we can safely refuse a boot over — a loud NOTICE plus a working non-unique index is the
-- proportionate failure mode, and the duplicates then need manual reconciliation.
--
-- Idempotent: IF NOT EXISTS + guarded; safe to re-run. Index-only, no column/CHECK/DEFAULT
-- change and no backfill → nothing for the publish-time push to violate (no CONSTRAINT_MANIFEST
-- entry needed; the preflight script tracks CHECK constraints, not indexes).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM service_bookings
    WHERE idempotency_key IS NOT NULL
    GROUP BY idempotency_key
    HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Migration 155: service_bookings holds duplicate idempotency_key values — skipping UNIQUE index, creating a plain index instead. Reconcile the duplicates, then create service_bookings_idempotency_key_idx manually.';
    CREATE INDEX IF NOT EXISTS service_bookings_idempotency_key_plain_idx
      ON service_bookings (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS service_bookings_idempotency_key_idx
      ON service_bookings (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;
