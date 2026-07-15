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

## The real fix (when there's time)

Disable Replit's deploy-time schema-push so `runMigrations()` is the single source
of truth. That's a Replit **deployment setting**, not a repo change — until it's
done, this preflight is the guard.
