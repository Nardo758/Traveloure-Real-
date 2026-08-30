# Runbook: Production Database Restore (Disaster Recovery)

**Last tested: 2026-08-17 — full drill PASSED** (dump 17s, restore 16s, 272 tables, row counts + content hash verified identical).

## What exists

| Layer | Mechanism | Max data loss | Who operates it |
|---|---|---|---|
| Primary | Replit production DB **point-in-time restore** (Neon history). Retention: 7 days (Core) / 28 days (Pro/Teams). | ~0 (restore to any second inside retention) | Repl owner, via the **Database tool → production database → Restore** in the workspace |
| Secondary | Manual `pg_dump` export (procedure below) | Whatever elapsed since the last manual dump | Anyone with `PROD_DATABASE_URL` |

Point-in-time restore is the primary DR path: near-zero RPO within the retention window, done from the Database pane UI. **Rolling back the database does NOT roll back code** — pair it with the matching code checkpoint/commit if the whole app must align.

## Emergency restore — primary path (point-in-time)

1. Stop writes if possible (pause the deployment or enable a maintenance flag).
2. Open the workspace → Database tool → select the **production** database → Restore → pick the timestamp just before the incident.
3. Redeploy / resume traffic.
4. Verify with read-only checks: `psql "$PROD_DATABASE_URL"` → spot-check recent rows in `service_bookings`, `users`, `expert_earnings`.

## Emergency restore — secondary path (dump/restore), tested procedure

Measured on the real prod DB (85 MB, PG 16.14): **dump ~17s, restore ~16s, total downtime ≈ 1 minute** including verification. Times scale roughly linearly with DB size.

```bash
# 1. Dump (custom format; works from any workspace shell with the secret)
pg_dump "$PROD_DATABASE_URL" -Fc -f prod-backup.dump

# 2. Restore into the target (scratch DB for drills, or the recovered prod URL)
pg_restore -d "<TARGET_URL>" --no-owner --no-privileges prod-backup.dump

# 3. Verify — table count, key row counts, content hash
psql "<TARGET_URL>" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"  # expect parity
for T in users service_bookings bookings provider_services trips expert_earnings; do
  psql "<TARGET_URL>" -t -c "SELECT '$T', count(*) FROM $T"; done
psql "<TARGET_URL>" -t -c "SELECT md5(string_agg(id||coalesce(email,''), ',' ORDER BY id)) FROM users"
```

## Drill procedure (repeat quarterly)

1. `pg_dump "$PROD_DATABASE_URL" -Fc -f /tmp/prod-backup.dump` (time it)
2. `psql "$DATABASE_URL" -c "CREATE DATABASE dr_drill;"` on the dev instance
3. `pg_restore` into `dr_drill` (time it), expect exit 0 and zero errors
4. Verify table count, per-table row counts, and the `users` content hash match prod
5. `DROP DATABASE dr_drill;` and delete the dump file — **never leave prod data at rest in dev**

## Rules

- `PROD_DATABASE_URL` access is read-only by convention for agents/devs — restores that write to prod are a human-owner action.
- Never restore a prod dump *over* the dev database's main DB (it would destroy dev fixtures); always use a scratch database.
- Delete dump files immediately after use; they contain real user PII.
