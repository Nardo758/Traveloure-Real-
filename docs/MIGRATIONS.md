# Database Migrations — Current State & Prod-Move Plan

> Status as of 2026-06-03. This document is the source of truth for what
> tooling actually runs against the DB. Update it any time the workflow
> changes.

## Today's reality (push-managed, with documentary SQL artifacts)

The repo's actual deploy path is **`npm run db:push`** (`drizzle-kit push`).
Push diffs `shared/schema.ts` against the connected DB and applies the
inferred DDL directly. There is no migration runner wired into
`server/index.ts` or CI.

The SQL files in `migrations/` (currently `0000` through `0004`) are
**partial historical documentation**, not an executable history:

- `migrations/meta/_journal.json` only references `0000` and `0003`.
  `0001` and `0002` are orphan SQL files — never journaled, never run by
  any tool.
- `0004_neighborhood_tagging.sql` (Phase 1b-1) is committed as the
  authoritative DDL artifact for that change, but it is also not journaled
  yet. Its schema-side counterpart (`cityNeighborhoods` table +
  `provider_services.neighborhood` + `travel_pulse_hidden_gems.neighborhood`)
  is in `shared/schema.ts`, so `db:push` will apply it on dev.
- The `0003_snapshot.json` baseline is ~24 K lines. Hand-editing snapshots
  is not viable.

This means today's dev DB is reproducible only by `db:push` against
`shared/schema.ts` as it currently exists — not from any committed
migration history.

## Why we accept this for now

A clean migration history is needed for the **prod move off Replit**,
not for day-to-day dev. As long as Replit dev DBs are managed by push,
and as long as Phases 2-6 are about to churn the schema substantially,
reconstructing per-migration history (option B from the Phase 1b-5
discussion) is high effort for short half-life.

`scripts` now include `db:migrate` and `db:generate` so the runner exists
the moment we have a clean baseline to migrate forward from.

## What the prod move must do (scheduled)

When we cut over off Replit, the migration history gets established
**once** via baseline, and forward changes flow through `drizzle-kit`
properly. Concrete runbook:

1. **Generate the baseline** from the current `shared/schema.ts`:
   ```
   # against an empty scratch DB so drizzle-kit emits a from-empty diff
   DATABASE_URL=<scratch-empty-db-url> npm run db:generate -- --name=baseline
   ```
   This produces `migrations/0000_baseline.sql` plus
   `migrations/meta/0000_snapshot.json` capturing the full schema.

2. **Replace the orphan history.** Move existing `0000`–`0004` SQL files
   to `migrations/_archive/` for the record and rebuild `_journal.json`
   so it contains exactly one entry: the baseline.

3. **Mark the baseline as applied on every existing DB** (dev, staging,
   prod-to-be) without re-running its DDL:
   ```sql
   -- drizzle's tracking table; name may need verification per drizzle-kit version
   INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
   VALUES ('<baseline_hash>', extract(epoch from now()) * 1000);
   ```
   The hash comes from `_journal.json`'s baseline entry.

4. **From this point forward, only `db:migrate`** in CI / deploy. `db:push`
   is reserved for prototyping against scratch DBs.

5. **Phase 1b-1's neighborhood DDL is in the baseline** — no separate 0004.
   `0004_neighborhood_tagging.sql` stays in `_archive/` as a record of the
   change's intent.

## Day-to-day until the prod move

- Schema changes: edit `shared/schema.ts`, run `npm run db:push` against
  your dev DB.
- **Also commit a documentary `.sql` artifact** in `migrations/` for any
  non-trivial change (new table, new index, type changes). Name it
  `NNNN_short_description.sql`. The next-baseline runbook absorbs it.
- This keeps an audit trail even though the runner isn't reading it yet.

## Decision history

- 2026-06-03 — Phase 1b-5: chose "A now + scheduled baseline" over full
  history reconstruction. Baselining was awkward in this container (no
  installed drizzle-kit, snapshot size, DB env required). Reconstructing
  per-migration history would have produced fragile snapshots for
  migrations already applied via push everywhere that matters, and the
  schema is about to churn through Phases 2-6. The prod-move cut is the
  natural moment to establish a clean baseline once.
