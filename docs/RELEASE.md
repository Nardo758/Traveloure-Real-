# Release / Publish runbook

Traveloure runs on Replit Autoscale. The app applies its own SQL migrations at
startup via `runMigrations()` (`server/index.ts`) — that is the **authoritative**
migration path, and it remaps legacy values before enforcing constraints.

**The trap:** Replit's deploy also runs an *automatic schema-push* (drizzle-kit,
from `shared/schema.ts`) at publish time. That push enforces the schema's CHECK
constraints **without** running our migrations' remap steps first. So when a
migration adds a CHECK over a column that still holds legacy values on production,
the push fails mid-deploy with `check constraint ... is violated by some row` and
offers the **destructive** "copy dev database over production" option.

> ⚠️ **Never click "Copy development database and data to production."** It
> overwrites prod with dev, wiping real users/bookings/earnings. Choose **Cancel**.

## Before every publish that includes a migration adding/changing a CHECK

1. **Run the preflight against production** (not dev):

   ```bash
   node scripts/preflight-prod-constraints.cjs "<PROD_DATABASE_URL>"
   ```

   - The banner prints the database name + host — confirm it's production.
   - **Exit 0 / "CLEAN"** → safe to publish.
   - **Exit 1** → it lists every violating value and prints ready-to-run remap SQL,
     plus any `UNMAPPED` values that need a human decision.

2. **Apply the remap on production** (review the suggested SQL first; decide any
   `UNMAPPED` values yourself — never guess-map a content field):

   ```bash
   psql "<PROD_DATABASE_URL>" <<'SQL'
   -- paste the remap block the preflight printed
   SQL
   ```

3. **Re-run the preflight** → confirm CLEAN.

4. **Publish.** The schema-push now passes (data conforms), the app boots, and
   `runMigrations()` finds the constraints already satisfied.

5. **Verify the new build is live** (not a stale deploy): probe a route that only
   exists post-change and confirm JSON, not the Vite HTML catch-all.

## Maintaining the preflight

When a new migration adds a CHECK over an enum-like column, add an entry to
`CONSTRAINT_MANIFEST` in `scripts/preflight-prod-constraints.cjs`: the allowed
values, a `remap` of known legacy→canonical values, and a `fallback` (a safe
default for unmapped values, or `null` to force a manual decision — use `null`
for content fields; a conservative constant only where one is genuinely safe,
e.g. earnings → `held`).

## Before every publish that includes a migration adding a UNIQUE index

The deploy-push trap has a second variant: declaring a UNIQUE index in
`shared/schema.ts` (required — see "CRITICAL: Replit deploy-push" in
`CLAUDE.md`, the `sb_idempotency_key_idx` / migration-155 lesson) makes the
push **enforce** it. If production already holds duplicate rows for that key,
the push fails mid-deploy the same way a violated CHECK does, and offers the
same destructive "copy dev database over production" option.

1. **Run the UNIQUE-index preflight against production:**

   ```bash
   node scripts/preflight-prod-unique-indexes.cjs "<PROD_DATABASE_URL>"
   ```

   - **Exit 0 / "PASS"** → safe to publish.
   - **Exit 1** → it lists every duplicated key value; de-duplicate on production
     first (there is no generic remap — de-duplication is case-by-case, decide
     which row wins), then re-run until clean.

2. When a new migration declares a UNIQUE index in `shared/schema.ts` over a
   column/table that previously had none, add an entry to `INDEX_MANIFEST` in
   `scripts/preflight-prod-unique-indexes.cjs` (the index name, table, columns,
   and the exact partial-index `where` predicate — it must mirror the
   `shared/schema.ts` declaration verbatim, see that file's own note).

3. **First application of this note:** migration 210 (S7 availability model,
   DECISIONS.md ledger row 102) adds
   `vendor_availability_slots_service_date_start_unique` — the availability
   materializer's `ON CONFLICT DO NOTHING` upsert target. The migration itself
   also runs this exact duplicate check inline and **fails loudly**
   (`RAISE EXCEPTION`, not a silent skip) if it finds any, so a database that
   runs the migration is already protected; this preflight step is for
   confirming production is clean **before** publishing the `shared/schema.ts`
   declaration (i.e., before the automatic drizzle-kit push runs against it).

## Staging (auth-dependent E2E)

Production purges the seeded `@traveloure.test` accounts on every boot, so no
suite that logs in can run against it. Auth-dependent smoke targets a separate
**staging** deployment; the unauthenticated smoke stays on production. Provisioning
staging is a one-time owner action — see **[`docs/STAGING.md`](./STAGING.md)** for the
exact env vars, GitHub secrets, and confirmation steps.

## The real fix (when there's time)

Disable Replit's deploy-time schema-push so `runMigrations()` is the single source
of truth. That's a Replit **deployment setting**, not a repo change — until it's
done, this preflight is the guard.
