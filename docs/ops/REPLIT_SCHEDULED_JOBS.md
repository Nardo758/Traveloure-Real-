# Replit Scheduled Deployment — the authoritative jobs-cron trigger

**Ledger:** `2026-09-20-jobs-trigger-replit-scheduled`
**Status:** operator setup required — the deployment is not created by this repo; this doc is the
recipe an operator follows once.

## Why this exists

`.github/workflows/jobs-cron.yml` calls `scripts/ci/post-internal-jobs.sh --due` on a `*/15 * * * *`
schedule and is meant to be the reliable external trigger for the MONEY/INTEGRITY background jobs
(`/internal/jobs/*`) — production's Autoscale in-process timers are only best-effort (they only fire
while an instance happens to be warm). Collapsing that workflow to one schedule (ledger
`2026-09-20-jobs-cron-single-schedule`) fixed an internal bug — five separate cron schedules racing
each other inside one workflow — but did not fix GitHub Actions' own schedule *delivery*, which is
independently unreliable: on 2026-09-20 the `*/15` schedule was dispatched only **5 times in 10
hours**, with gaps as long as 5 hours between runs. A launch is a bad time to discover that jobs like
`earnings-release` or `booking-auto-completion` went unrun for hours.

The fix is a **second, independent trigger that does not depend on GitHub Actions' scheduler at
all**: a Replit **Scheduled Deployment**, running the exact same script directly against production,
on its own 15-minute cadence. GitHub's workflow stays wired up as a **backup** — a second signal that
does not hurt (every job here is idempotent; a GitHub-triggered pass racing a Replit-triggered one
just no-ops via overlap dedupe), but is no longer the thing a launch should rely on.

## Operator setup

1. In the Replit dashboard for the production app: **Deployments → Scheduled → New Scheduled
   Deployment**.
2. **Command:**
   ```
   bash scripts/ci/post-internal-jobs.sh --due
   ```
   Run it from the repository root (the deployment's working directory should already be the app
   checkout — the script is at `scripts/ci/post-internal-jobs.sh` relative to that root).
3. **Schedule:** `*/15 * * * *` (every 15 minutes, matching `jobs-cron.yml`'s own cadence — the two
   triggers should run at roughly the same frequency, though they do not need to be phase-aligned;
   over-posting a due bucket is safe by design).
4. **Environment variables**, set on the Scheduled Deployment (not inherited from the app's own env
   unless the Replit UI does so automatically — verify):
   - `BASE_URL=https://www.traveloure.com`
   - `INTERNAL_JOB_SECRET` — the **production** value of this secret (the same one
     `server/routes/internal.routes.ts`'s `requireInternalSecret` checks). This is required; the
     script refuses to run without it.
   - `WARMUP_MAX_SECONDS` (optional) — how long to wait for `/api/ready` before failing. Default
     `120`. Raise this if the production instance is observed taking longer than 2 minutes to cold
     boot.
   - `POST_RETRIES` (optional) — how many times a 404/503 route response is retried. Default `3`.
     Leave at the default unless the cold-start retry budget (see the script's own header comment,
     ledger `2026-09-20-jobs-cron-cold-start-retry`) is observed to be insufficient.
5. Save and enable the Scheduled Deployment.

Do **not** set `ROUTES` or `FORCE_BUCKET` on the recurring deployment — `--due` is what makes it
compute the due buckets itself, matching `jobs-cron.yml`'s own behavior. `FORCE_BUCKET=<bucket>` is
for a one-off manual run of a specific bucket (e.g. to backfill a bucket you know was missed); it is
not a schedule-time setting.

## How to verify it is actually firing

Two independent checks, both should be done after setup and periodically thereafter (see
`docs/MARKET_LAUNCH_CHECKLIST.md` item 8):

1. **`GET /internal/jobs/health`** (with the `x-internal-secret` header set to the production
   secret) should report `staleCount: 0` within about 20 minutes of enabling the deployment — long
   enough for at least one 15-minute cycle plus the cold-start warm-up window. A nonzero
   `staleCount` that persists across more than one cycle means a job's bucket is not actually being
   posted; check which job is stale and cross-reference `JOB_CADENCE` in
   `server/routes/internal.routes.ts` against the bucket→routes table in
   `scripts/ci/post-internal-jobs.sh` (the `BUCKET_ROUTES` block) to see which bucket owns it.
2. **The Scheduled Deployment's own run log**, in the Replit dashboard, should show the script's
   `Due this run (...)` line on each firing (or `Forced bucket: ...` if you triggered a manual
   `FORCE_BUCKET` run), naming the buckets it computed as due and the routes it posted — the same
   line `jobs-cron.yml`'s Actions run log would show.

## Reading a failure in the log

The script's own header comment (`scripts/ci/post-internal-jobs.sh`) is the authoritative reference
for its health contract and retry behavior; the short version, for the operator reading a run log:

- **401** on a route — `INTERNAL_JOB_SECRET` set on the Scheduled Deployment does not match
  production's. Never retried by the script (a wrong secret is not transient); fix the env var.
- **404** or **503**, retried and then still failing after the retry budget — either a genuinely
  dead/renamed route (check the deployed sha actually carries it), or an outage longer than
  `WARMUP_MAX_SECONDS` plus the retry backoff window. The script cannot tell these apart beyond
  exhausting its retry budget by design (see its "NEGATIVE SPACE" comment) — a route that is
  actually dead reads red exactly the same as a route that never came back up.
- **500** on a route — the job ran on the server and failed. The script never retries a 500 (retrying
  risks double-running a job that already ran); the diagnosis is in the server log, not this one
  (the script deliberately does not echo response bodies — see its "LOG HYGIENE" comment).
- The warm-up step failing outright (`Instance never became ready`) before any route is attempted —
  `/api/ready` never reported `ready:true` within `WARMUP_MAX_SECONDS`. Treat this as a real outage,
  not a boot race.

## What this does not prove

Neither the roster guard (`scripts/check-jobs-cron-roster.cjs`) nor
`scripts/ci/post-internal-jobs.test.sh` can prove that the Replit Scheduled Deployment — or
GitHub's own schedule — is actually configured and firing in production. They prove the WORKFLOW's
static shape (one cron schedule, `--due` invoked, every in-scope `JOB_CADENCE` route posted by some
bucket in the script's table) and the SCRIPT's due-bucket arithmetic and retry logic against a local
stub, respectively. Whether either trigger fires on schedule in the real environment is exactly what
the "How to verify" section above checks — that gap is why this doc, and that section, exist.

## GitHub `jobs-cron.yml` remains as backup

`.github/workflows/jobs-cron.yml` is unchanged in cadence (`*/15 * * * *`) and still calls the same
script in `--due` mode. It stays wired up deliberately — it is a second, independent path that costs
nothing extra when both triggers land close together (over-posting a due bucket is safe), and gives
some coverage even if the Replit Scheduled Deployment is ever paused or misconfigured. It should not
be relied on as the sole trigger; see the evidence in that workflow's own header comment and in
`docs/findings/SCHEDULER_RELIABILITY_PHASE0.md`.
