#!/usr/bin/env node
/**
 * check-jobs-cron-roster.cjs — jobs-cron.yml must name every JOB_CADENCE route it's responsible
 * for, and it must carry exactly ONE cron schedule.
 *
 * Ledger `2026-09-20-jobs-cron-single-schedule`. Node built-ins only — no npm ci, no DB, so it
 * runs as a fast standalone CI job (wired into scheduler-jobs-gate.yml).
 *
 * WHY THIS EXISTS
 * ───────────────
 * jobs-cron.yml used to declare FIVE cron schedules, one per cadence bucket, each job gated by
 * `if: github.event.schedule == '<that cron>'`. GitHub dispatches a multi-schedule workflow's
 * matching schedule LATE and UNEVENLY under load — run 35487463992 (2026-09-20T03:46Z) fired the
 * six-hourly cron only, so the 15-minute, hourly, four-hourly and daily buckets were ALL `skipped`
 * that run, and production's /internal/jobs/health reported six stale MONEY/INTEGRITY jobs although
 * the secret was correct and every endpoint answered 200. The fix (this ledger row) collapses to
 * ONE fifteen-minute schedule; every dispatched run computes which cadence buckets are due BY WALL
 * CLOCK and posts all of them, so no bucket depends on GitHub choosing to fire its own specific
 * cron line. Over-posting is safe: `runBackgroundJob` skips an overlapping pass (§17 rule 2) and
 * every job here is idempotent by design (CLAUDE.md §15).
 *
 * server/routes/internal.routes.ts's own comment states the coupling ("⚠ COUPLED TO
 * .github/workflows/jobs-cron.yml … If a bucket's cron expression or route list changes, this map
 * changes in the SAME commit"). This guard is the machine half of that promise for the shape that
 * can drift silently: a route retired or renamed in the workflow while JOB_CADENCE still expects
 * it, or a second cron schedule creeping back in and reopening the exact multi-schedule dispatch
 * race this lane exists to close.
 *
 * THE RULES
 * ─────────
 *   1. jobs-cron.yml declares EXACTLY ONE `cron:` schedule under `on: schedule:`. A second one
 *      reopens the multi-schedule dispatch race this lane closes.
 *   2. Every job in JOB_CADENCE (server/routes/internal.routes.ts) whose bucket is fired BY THIS
 *      workflow — i.e. every bucket except `occasion-drafts-daily`, which is its own workflow
 *      (occasion-drafts-daily.yml) and is out of scope here — has its job name appear in some
 *      `ROUTES: "..."` line of jobs-cron.yml. A roster entry the workflow never posts is a job
 *      that silently stopped running; a workflow route the roster doesn't know about goes
 *      unmonitored by /internal/jobs/health.
 *
 * NEGATIVE SPACE — what this guard does NOT check (§18d: green means green-within-stated-bounds)
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 *   • It does NOT verify that GitHub Actions actually fires the schedule reliably — that is an
 *     operator-observed fact (the Actions tab, or a future external trigger), recorded as open in
 *     ledger `2026-09-20-jobs-cron-single-schedule`, not something a static parse can prove.
 *   • It does NOT evaluate the workflow's due-by-clock bash logic (which buckets post on which
 *     minute/hour) — only that every roster route is named SOMEWHERE in the file, and that there
 *     is exactly one schedule line. A bucket wired to fire never, or a `due_*` output that is
 *     always false, is invisible to it.
 *   • It does NOT check occasion-drafts-daily.yml or its own roster entry — that lane's coupling
 *     comment and workflow are unchanged by this ruling.
 *   • It reads JOB_CADENCE as TEXT (regex over the source file), not via ts-node/tsc — a roster
 *     entry hidden behind a runtime-computed spread or import would be invisible to it.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WORKFLOW = path.join(ROOT, ".github/workflows/jobs-cron.yml");
const ROSTER_FILE = path.join(ROOT, "server/routes/internal.routes.ts");
const OUT_OF_SCOPE_BUCKET = "occasion-drafts-daily";

/** Every {job, bucket} entry in the `JOB_CADENCE` array literal. */
function parseRoster(ts) {
  const m = ts.match(/JOB_CADENCE:\s*readonly JobCadence\[\]\s*=\s*\[([\s\S]*?)\n\];/);
  if (!m) return null;
  const body = m[1];
  const entries = [];
  for (const line of body.split("\n")) {
    const jm = line.match(/job:\s*"([^"]+)"/);
    const bm = line.match(/bucket:\s*"([^"]+)"/);
    if (jm && bm) entries.push({ job: jm[1], bucket: bm[1] });
  }
  return entries;
}

/** Count of `- cron: "..."` lines anywhere in the workflow (jobs-cron.yml has one `on:` block). */
function scheduleCount(yaml) {
  return (yaml.match(/^\s*-\s*cron:\s*"/gm) || []).length;
}

/** Union of every route NAME posted by some `ROUTES: "..."` line in the workflow. */
function postedRoutes(yaml) {
  const routes = new Set();
  for (const m of yaml.matchAll(/ROUTES:\s*"([^"]*)"/g)) {
    for (const r of m[1].trim().split(/\s+/).filter(Boolean)) routes.add(r);
  }
  return routes;
}

function check(rosterTs, workflowYaml) {
  const errors = [];

  const roster = parseRoster(rosterTs);
  if (roster === null) {
    errors.push(
      "Could not find `export const JOB_CADENCE: readonly JobCadence[] = [...]` in server/routes/internal.routes.ts."
    );
    return errors;
  }
  if (roster.length === 0) {
    errors.push("Parsed ZERO JOB_CADENCE entries — the parser is broken, not the roster. Refusing to pass vacuously.");
    return errors;
  }

  // Rule 1: exactly one cron schedule.
  const schedules = scheduleCount(workflowYaml);
  if (schedules !== 1) {
    errors.push(
      `jobs-cron.yml declares ${schedules} cron schedule(s), expected exactly 1. A second schedule reopens the multi-schedule dispatch race this lane closes (GitHub fires only the matching one per run, unevenly).`
    );
  }

  // Rule 2: every in-scope roster job is posted somewhere in the workflow.
  const posted = postedRoutes(workflowYaml);
  if (posted.size === 0) {
    errors.push(
      'Parsed ZERO `ROUTES: "..."` lines from jobs-cron.yml — the parser is broken, or every bucket lost its ROUTES line. Refusing to pass vacuously.'
    );
    return errors;
  }
  for (const { job, bucket } of roster) {
    if (bucket === OUT_OF_SCOPE_BUCKET) continue;
    if (!posted.has(job)) {
      errors.push(
        `JOB_CADENCE names "${job}" (bucket "${bucket}"), which no ROUTES line in jobs-cron.yml posts. That job silently stopped being fired by the external trigger.`
      );
    }
  }

  return errors;
}

// ── committed self-test fixtures (§18d: a predicate change ships with fixtures) ─────────────────
const OK_ROSTER = `
export const JOB_CADENCE: readonly JobCadence[] = [
  { job: "checkout-sweep", expectedIntervalSec: 15 * 60, bucket: "backstops" },
  { job: "earnings-release", expectedIntervalSec: 60 * 60, bucket: "hourly" },
  { job: "booking-expiry", expectedIntervalSec: 4 * 60 * 60, bucket: "four-hourly" },
  { job: "run-occasion-drafts", expectedIntervalSec: 24 * 60 * 60, bucket: "occasion-drafts-daily" },
];
`;

const OK_WORKFLOW = `
on:
  schedule:
    - cron: "*/15 * * * *"
  workflow_dispatch:

jobs:
  post-due-buckets:
    steps:
      - name: backstops
        env:
          ROUTES: "checkout-sweep itinerary-generation-sweep email-outbox"
        run: ./scripts/ci/post-internal-jobs.sh
      - name: hourly
        env:
          ROUTES: "earnings-release booking-auto-completion score-neighborhood-claims"
        run: ./scripts/ci/post-internal-jobs.sh
      - name: four-hourly
        env:
          ROUTES: "booking-expiry"
        run: ./scripts/ci/post-internal-jobs.sh
`;

function selfTest() {
  const cases = [
    ["clean case passes", () => check(OK_ROSTER, OK_WORKFLOW).length === 0],
    [
      "a second cron schedule is caught (rule 1)",
      () =>
        check(
          OK_ROSTER,
          OK_WORKFLOW.replace('- cron: "*/15 * * * *"', '- cron: "*/15 * * * *"\n    - cron: "0 * * * *"')
        ).some((e) => e.includes("2 cron schedule")),
    ],
    [
      "zero cron schedules is caught (rule 1)",
      () => check(OK_ROSTER, OK_WORKFLOW.replace('    - cron: "*/15 * * * *"\n', "")).some((e) => e.includes("0 cron schedule")),
    ],
    [
      "a roster job the workflow never posts is caught (rule 2)",
      () =>
        check(
          OK_ROSTER.replace(
            'bucket: "backstops" },',
            'bucket: "backstops" },\n  { job: "phantom-job", expectedIntervalSec: 60, bucket: "hourly" },'
          ),
          OK_WORKFLOW
        ).some((e) => e.includes("phantom-job") && e.includes("silently stopped")),
    ],
    [
      "occasion-drafts-daily bucket is out of scope and never flagged",
      () => check(OK_ROSTER, OK_WORKFLOW).every((e) => !e.includes("run-occasion-drafts")),
    ],
    [
      "a job satisfied by ANY ROUTES line passes, not just the first",
      () =>
        check(
          OK_ROSTER,
          OK_WORKFLOW + '\n      - name: extra\n        env:\n          ROUTES: "run-occasion-drafts"\n        run: ./x.sh\n'
        ).length === 0,
    ],
    ["missing JOB_CADENCE declaration is caught", () => check("// no roster here", OK_WORKFLOW).some((e) => e.includes("Could not find"))],
    [
      "broken roster parse fails loudly, not vacuously",
      () => check("export const JOB_CADENCE: readonly JobCadence[] = [\n];", OK_WORKFLOW).some((e) => e.includes("ZERO JOB_CADENCE")),
    ],
    [
      "a workflow with no ROUTES lines fails loudly, not vacuously",
      () => check(OK_ROSTER, 'on:\n  schedule:\n    - cron: "*/15 * * * *"\n').some((e) => e.includes("ZERO")),
    ],
    [
      "parser reads bucket alongside job name",
      () => {
        const p = parseRoster(OK_ROSTER);
        return p.length === 4 && p[0].job === "checkout-sweep" && p[0].bucket === "backstops";
      },
    ],
  ];

  let failed = 0;
  for (const [name, fn] of cases) {
    let ok = false;
    try {
      ok = fn();
    } catch (e) {
      ok = false;
    }
    console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}`);
    if (!ok) failed++;
  }
  if (failed > 0) {
    console.error(
      `\njobs-cron-roster guard SELF-TEST FAILED — ${failed} fixture case(s). The predicate is wrong; fix it before trusting a green run.`
    );
    process.exit(1);
  }
  console.log(`\njobs-cron-roster guard self-test: ${cases.length}/${cases.length} fixture cases pass.`);
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  if (!fs.existsSync(WORKFLOW)) {
    console.error(`jobs-cron-roster guard: required file missing — ${path.relative(ROOT, WORKFLOW)}`);
    process.exit(1);
  }
  if (!fs.existsSync(ROSTER_FILE)) {
    console.error(`jobs-cron-roster guard: required file missing — ${path.relative(ROOT, ROSTER_FILE)}`);
    process.exit(1);
  }

  const errors = check(fs.readFileSync(ROSTER_FILE, "utf8"), fs.readFileSync(WORKFLOW, "utf8"));
  if (errors.length > 0) {
    console.error("jobs-cron-roster guard FAILED:\n");
    for (const e of errors) console.error(`  • ${e}`);
    console.error("\njobs-cron.yml must carry exactly one cron schedule and post every in-scope JOB_CADENCE route.");
    console.error("See CLAUDE.md §17 rule 2 / §18d and ledger 2026-09-20-jobs-cron-single-schedule.");
    process.exit(1);
  }
  console.log(
    "jobs-cron-roster guard: OK — one cron schedule, every in-scope JOB_CADENCE route posted somewhere in jobs-cron.yml."
  );
}

main();
