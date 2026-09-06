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

## Step 0 — publish only from a clean `main` at `origin/main`

**This step comes before every other one on this page, migration or no migration.**

A Replit Autoscale publish **does not read `origin`. It builds the workspace
filesystem.** So a checkout carrying a commit that is not on `main` publishes that
commit to production, and branch protection cannot stop it — it never sees the
publish. On 2026-09-06 that is exactly what happened: the push of a local commit was
rejected, the publish succeeded anyway, and commit `96c39f5` served real users while
`origin/main` had never seen it. Every check was green.

`scripts/publish-preflight.cjs` now runs as the **first step of the deployment build**
(`.replit` `[deployment] build` → `npm run build:prod`) and fails the build unless all
four hold:

| # | Condition | Why |
|---|-----------|-----|
| 1 | current branch is `main` | lane work reaches production by MERGING, never by publishing the lane checkout |
| 2 | `git status --porcelain` is empty | any staged, modified **or untracked** file would ship unreviewed — untracked counts, because the build can read it |
| 3 | `HEAD` == `origin/main` | the 2026-09-06 incident, exactly |
| 4 | `package-lock.json` has zero `replit.local` | the lockfile-purity rule, at the last moment it can still be caught |

`npm run dev` and CI's `npm run build` are untouched — the script enforces only under
`--strict` (which the deployment build passes) or a truthy `REPLIT_DEPLOYMENT`, and is
a one-line no-op everywhere else. To see where the checkout stands at any time:

```bash
npm run preflight:publish -- --strict     # prints the verdict; changes nothing
```

### The operator sequence

1. **Reset the workspace to the reviewed branch.** There is no override flag for the
   preflight; the fix is always the checkout.

   ```bash
   git checkout main && git fetch origin && git reset --hard origin/main
   ```

   `git status` must now be empty and `git rev-parse HEAD` must equal
   `git rev-parse origin/main`. If `git status` still lists untracked files, decide
   each one — either commit it through a PR or delete it. Do not publish over it.

2. **Run the app once** (the Run button / `npm run dev`) and read the boot log. Two
   JSON lines must appear, in this order:

   - `"Migrations complete"` — with its `appliedCount` / `skippedCount`. On a normal
     republish `applied` is empty; a non-empty list means this publish is landing new
     migrations, which is when the CHECK / UNIQUE preflights below apply.
   - `Server started`.

   A `FATAL: Database migrations failed` line means **stop** — do not publish.

3. **Publish.** The build prints the preflight's own block first:

   ```
   publish-preflight (strict) — CLAUDE.md 'Branch and publish rule'
     branch          main
     HEAD            <40-char sha>
     origin/main     <the same sha>
     last migration  288_affiliate_attribution_links.sql
   ```

   If it prints `publish-preflight FAILED`, the build stops and nothing is deployed.
   Fix the checkout (step 1) and start again.

4. **Decline any SQL.** If the publish offers to run its own SQL — especially `DROP`
   or `ALTER` — choose **Cancel**, every time, no variant approved (`CLAUDE.md` §20).
   That prompt means the workspace checkout and the production database disagree, not
   that production needs the SQL. Fix by syncing the checkout, never by approving the
   diff. If destructive SQL still appears after a clean reset, decline and **STOP** —
   escalate.

5. **Confirm what actually booted.** Compare the deployment's own log against the two
   lines the preflight printed in step 3:

   - the `[build] commit <sha>` line (`GET /api/version` / `GET /api/health` report the
     same) must equal the `HEAD` above;
   - `"Migrations complete"` must name a count consistent with `last migration`.

   **The preflight cannot make this comparison** — it can see whether this checkout is
   publishable, not whether the deployed build came from it. That is why it prints the
   left-hand side, and why this step is a human one. See the script header's
   NEGATIVE SPACE section for the rest of what it does not cover.

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

## Maintaining the CHECK preflight

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
