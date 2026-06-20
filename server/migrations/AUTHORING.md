# Migration Authoring Guide

This document codifies conventions for keeping the Traveloure migration ledger clean
and easy to reason about. Read it before authoring or landing a new migration.

---

## Numbering

- Migrations are numbered sequentially (`NNN_description.sql`).
- Never reuse a number, even if a file was deleted.
- Gaps in the sequence are intentional and documented in `migration-files.ts`.

---

## Idempotency requirement

Every migration **must** be safe to re-run without error:

- `CREATE TABLE IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `ALTER TABLE … ADD COLUMN IF NOT EXISTS`
- `INSERT … ON CONFLICT DO NOTHING`
- `DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN NULL END $$` for types/constraints

The ledger (`schema_migrations`) prevents double-execution in normal operation, but the
idempotency guard is the safety net when a DB was bootstrapped from a Drizzle snapshot.

---

## Superseded migrations — the no-op convention

**Problem:** During iterative development it is common for two migrations to land in the
same release where the first is made redundant by the second (e.g. `090` widened
`average_temp` to `varchar(60)`; `091` immediately converts it to `TEXT`, making the
intermediate widening pointless).

If the superseding migration ships _before_ `090` has been applied to any environment,
the original DDL in `090` never needs to run. But the file must still exist in the
sequence so that:

1. The ledger sequence remains intact (no gaps that confuse future auditors).
2. The migration runner can record it without breaking the ledger gate.

**Convention:** When a migration is superseded within the same release and has not yet
been applied to any environment, **replace its SQL body with a `SELECT 1` no-op** and
add a header comment explaining why:

```sql
-- SUPERSEDED by migration NNN (NNN_description.sql).
-- <one-line explanation of what NNN does that covers this migration's intent>
-- This file is kept as a no-op so the migration ledger sequence remains intact.
SELECT 1;
```

**Decision criteria:**

| Situation | Action |
|-----------|--------|
| Superseding migration ships in the same PR / release, original has **not** been applied anywhere | Replace body with `SELECT 1` + header comment |
| Superseding migration ships later, original **has** been applied to prod | Keep the original DDL; write the superseding migration to be idempotent against whatever the original did |
| File is a complete duplicate of another registered file | Delete from disk, remove from `MIGRATION_FILES`, document the gap in the header comment block |

**Runner behaviour:** `run-migrations.ts` logs a `[Migrations][WARN]` line whenever it
encounters a no-op file (body is only `SELECT 1` after whitespace/comment stripping).
This surfaces no-ops at startup so they don't silently accumulate.

---

## Registering a new migration

1. Write the SQL file in `server/migrations/`.
2. Append it to the `MIGRATION_FILES` array in `server/migrations/migration-files.ts`.
   - Keep the array in numeric order.
   - Add an inline comment block above the entry if the migration has caveats, supersedes
     another, or requires a one-time bootstrap step.
3. Update `server/migrations/AUTHORING.md` (this file) only if the convention itself changes.

---

## Deleting / excluding a migration

If a file must be excluded from the runner (crashed on prod, DDL absorbed elsewhere, etc.):

1. Remove the filename from `MIGRATION_FILES`.
2. Add an entry to the `── Intentional gaps / exclusions ──` comment block at the top of
   `migration-files.ts` explaining why it was removed.
3. **Do not delete the `.sql` file from disk** unless it is a clean byte-for-byte duplicate
   of another registered file — future branch replays or DB restores may reference it.

---

## Bootstrap and dry-run modes

See the header comment in `run-migrations.ts` for full docs on:

- `MIGRATION_DRY_RUN=true` — read-only audit (safe against prod)
- `MIGRATION_BOOTSTRAP_ONLY=true` — stamps the ledger for a Drizzle-snapshot prod DB
