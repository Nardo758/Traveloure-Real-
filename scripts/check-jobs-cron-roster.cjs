#!/usr/bin/env node
/**
 * check-jobs-cron-roster.cjs — jobs-cron.yml must carry exactly ONE cron schedule, must invoke
 * scripts/ci/post-internal-jobs.sh in `--due` mode, and every JOB_CADENCE route it's responsible
 * for must be posted by SOME bucket in that script's own bucket→routes table.
 *
 * Ledger `2026-09-20-jobs-cron-single-schedule`, amended by `2026-09-20-jobs-trigger-replit-scheduled`.
 * Node built-ins only — no npm ci, no DB, so it runs as a fast standalone CI job (wired into
 * scheduler-jobs-gate.yml).
 *
 * WHY THIS EXISTS
 * ───────────────
 * jobs-cron.yml used to declare FIVE cron schedules, one per cadence bucket, each job gated by
 * `if: github.event.schedule == '<that cron>'`. GitHub dispatches a multi-schedule workflow's
 * matching schedule LATE and UNEVENLY under load — run 35487463992 (2026-09-20T03:46Z) fired the
 * six-hourly cron only, so the 15-minute, hourly, four-hourly and daily buckets were ALL `skipped`
 * that run, and production's /internal/jobs/health reported six stale MONEY/INTEGRITY jobs although
 * the secret was correct and every endpoint answered 200. The first fix (ledger
 * `2026-09-20-jobs-cron-single-schedule`) collapsed to ONE fifteen-minute schedule with the due
 * computation inline in this workflow. GitHub's own schedule delivery then turned out to be
 * unreliable too — five deliveries in ten hours against that one fifteen-minute schedule — so ledger
 * `2026-09-20-jobs-trigger-replit-scheduled` made a Replit Scheduled Deployment the AUTHORITATIVE
 * trigger and moved the due-bucket computation OUT of this workflow and INTO
 * scripts/ci/post-internal-jobs.sh, so both triggers call the identical logic instead of each
 * carrying its own copy (§18 rule 1). This guard's job widened with it: it now also asserts the
 * workflow calls the script in `--due` mode (rather than restating the due arithmetic itself), and
 * it now sources the route roster from the SCRIPT's bucket→routes table instead of the workflow's
 * `ROUTES: "..."` lines, because that table — not this file — is the one that decides what gets
 * posted.
 *
 * server/routes/internal.routes.ts's own comment states the coupling ("⚠ COUPLED TO
 * .github/workflows/jobs-cron.yml … If a bucket's cron expression or route list changes, this map
 * changes in the SAME commit"). This guard is the machine half of that promise for the shape that
 * can drift silently: a route retired or renamed in the script's table while JOB_CADENCE still
 * expects it, a second cron schedule creeping back into the workflow (reopening the exact
 * multi-schedule dispatch race the first lane closed), or the workflow losing its `--due`
 * invocation (silently reverting to whatever ROUTES happens to be set, or failing outright).
 *
 * THE RULES
 * ─────────
 *   1. jobs-cron.yml declares EXACTLY ONE `cron:` schedule under `on: schedule:`. A second one
 *      reopens the multi-schedule dispatch race this lane closes.
 *   2. jobs-cron.yml invokes `scripts/ci/post-internal-jobs.sh` in `--due` mode (a `run:` line
 *      matching `post-internal-jobs.sh --due`). A workflow that stopped passing `--due` would
 *      silently fall back to whatever ROUTES happens to be set (or fail outright), reopening the
 *      exact "which bucket actually posted" ambiguity these two lanes exist to close.
 *   3. Every job in JOB_CADENCE (server/routes/internal.routes.ts) whose bucket is fired BY THIS
 *      workflow — i.e. every bucket except `occasion-drafts-daily`, which is its own workflow
 *      (occasion-drafts-daily.yml) and is out of scope here — has its job name appear in SOME
 *      bucket's route list inside scripts/ci/post-internal-jobs.sh's `BUCKET_ROUTES` table. A
 *      roster entry the table never posts is a job that silently stopped running; a table route
 *      the roster doesn't know about goes unmonitored by /internal/jobs/health.
 *
 * NEGATIVE SPACE — what this guard does NOT check (§18d: green means green-within-stated-bounds)
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 *   • It does NOT verify that GitHub Actions, or the Replit Scheduled Deployment, actually fires on
 *     schedule — that is an operator-observed fact (the Actions tab; the Replit deployment's run
 *     log and /internal/jobs/health, per docs/ops/REPLIT_SCHEDULED_JOBS.md), not something a static
 *     parse can prove. Recorded as open in ledger `2026-09-20-jobs-trigger-replit-scheduled`.
 *   • It does NOT evaluate the script's due-by-clock bash logic (which buckets post on which
 *     hour) — only that every roster route is named SOMEWHERE in the table, that there is exactly
 *     one schedule line, and that the workflow calls the script with `--due`. A bucket wired to
 *     fire never, or a due condition that is always false, is invisible to it; that arithmetic is
 *     proven instead by scripts/ci/post-internal-jobs.test.sh's T6–T10.
 *   • It does NOT check occasion-drafts-daily.yml or its own roster entry — that lane's coupling
 *     comment and workflow are unchanged by this ruling.
 *   • It reads JOB_CADENCE as TEXT (regex over the source file), not via ts-node/tsc — a roster
 *     entry hidden behind a runtime-computed spread or import would be invisible to it. Likewise
 *     the script's BUCKET_ROUTES table is read as TEXT between two marker comments, not by
 *     executing bash — a table assembled some other way (a loop, a sourced file) would be invisible
 *     to it; the script's own header states this as the PARSE CONTRACT the table must keep.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WORKFLOW = path.join(ROOT, ".github/workflows/jobs-cron.yml");
const ROSTER_FILE = path.join(ROOT, "server/routes/internal.routes.ts");
const SCRIPT_FILE = path.join(ROOT, "scripts/ci/post-internal-jobs.sh");
const OUT_OF_SCOPE_BUCKET = "occasion-drafts-daily";

const TABLE_BEGIN_MARKER = "# BUCKET_ROUTES_TABLE_BEGIN";
const TABLE_END_MARKER = "# BUCKET_ROUTES_TABLE_END";

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

/** True iff some `run:` line in the workflow invokes the script with `--due`. */
function callsScriptInDueMode(yaml) {
  return /post-internal-jobs\.sh\s+--due\b/.test(yaml);
}

/**
 * Parse the BUCKET_ROUTES table out of scripts/ci/post-internal-jobs.sh — the PARSE CONTRACT the
 * script's own header comment states: everything between the BEGIN/END marker comments, one
 * `["<bucket>"]="<space-separated routes>"` line per bucket. Returns null when the markers (or any
 * matching line inside them) are missing, so the caller can fail loudly rather than pass vacuously.
 */
function parseBucketRoutesTable(sh) {
  // The marker must be its OWN line (trailing whitespace only) — the script's header prose also
  // names these markers in a sentence while explaining the parse contract, and that mention must
  // never be mistaken for the real, standalone marker that brackets the table itself.
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const beginMatch = sh.match(new RegExp(`^${escape(TABLE_BEGIN_MARKER)}\\s*$`, "m"));
  const endMatch = sh.match(new RegExp(`^${escape(TABLE_END_MARKER)}\\s*$`, "m"));
  if (!beginMatch || !endMatch) return null;
  const beginIdx = beginMatch.index;
  const endIdx = endMatch.index;
  if (endIdx <= beginIdx) return null;
  const block = sh.slice(beginIdx, endIdx);
  const buckets = {};
  const routes = new Set();
  const re = /\[["']([a-z0-9-]+)["']\]="([^"]*)"/g;
  let m;
  while ((m = re.exec(block))) {
    const bucket = m[1];
    const list = m[2].trim().split(/\s+/).filter(Boolean);
    buckets[bucket] = list;
    for (const r of list) routes.add(r);
  }
  if (Object.keys(buckets).length === 0) return null;
  return { buckets, routes };
}

function check(rosterTs, workflowYaml, scriptSh) {
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

  // Rule 2: the workflow calls the script in --due mode.
  if (!callsScriptInDueMode(workflowYaml)) {
    errors.push(
      "jobs-cron.yml does not invoke `scripts/ci/post-internal-jobs.sh --due` anywhere. The due-bucket computation lives in the script (ledger 2026-09-20-jobs-trigger-replit-scheduled) — a workflow that doesn't call it in --due mode either restates that logic itself (the drift §18 rule 1 forbids) or silently stops posting the due buckets at all."
    );
  }

  // Rule 3: every in-scope roster job is posted by some bucket in the script's route table.
  const table = parseBucketRoutesTable(scriptSh);
  if (table === null) {
    errors.push(
      `Could not parse a BUCKET_ROUTES table from scripts/ci/post-internal-jobs.sh between the ${TABLE_BEGIN_MARKER} / ${TABLE_END_MARKER} markers. The parser is broken, or the table's shape drifted from the script's own PARSE CONTRACT. Refusing to pass vacuously.`
    );
    return errors;
  }
  if (table.routes.size === 0) {
    errors.push(
      "Parsed ZERO routes from the script's BUCKET_ROUTES table — the parser is broken, or every bucket lost its route list. Refusing to pass vacuously."
    );
    return errors;
  }
  for (const { job, bucket } of roster) {
    if (bucket === OUT_OF_SCOPE_BUCKET) continue;
    if (!table.routes.has(job)) {
      errors.push(
        `JOB_CADENCE names "${job}" (bucket "${bucket}"), which no bucket in scripts/ci/post-internal-jobs.sh's BUCKET_ROUTES table posts. That job silently stopped being fired by the external trigger.`
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
      - name: due
        env:
          INTERNAL_JOB_SECRET: \${{ secrets.INTERNAL_JOB_SECRET }}
        run: ./scripts/ci/post-internal-jobs.sh --due
`;

const OK_SCRIPT = `
# some header text
# BUCKET_ROUTES_TABLE_BEGIN
declare -A BUCKET_ROUTES=(
  ["backstops"]="checkout-sweep itinerary-generation-sweep email-outbox"
  ["hourly"]="earnings-release booking-auto-completion score-neighborhood-claims"
  ["four-hourly"]="booking-expiry"
)
# BUCKET_ROUTES_TABLE_END
# more script text
`;

function selfTest() {
  const cases = [
    ["clean case passes", () => check(OK_ROSTER, OK_WORKFLOW, OK_SCRIPT).length === 0],
    [
      "a second cron schedule is caught (rule 1)",
      () =>
        check(
          OK_ROSTER,
          OK_WORKFLOW.replace('- cron: "*/15 * * * *"', '- cron: "*/15 * * * *"\n    - cron: "0 * * * *"'),
          OK_SCRIPT
        ).some((e) => e.includes("2 cron schedule")),
    ],
    [
      "zero cron schedules is caught (rule 1)",
      () =>
        check(OK_ROSTER, OK_WORKFLOW.replace('    - cron: "*/15 * * * *"\n', ""), OK_SCRIPT).some((e) =>
          e.includes("0 cron schedule")
        ),
    ],
    [
      "a workflow that does not call --due is caught (rule 2)",
      () =>
        check(
          OK_ROSTER,
          OK_WORKFLOW.replace("./scripts/ci/post-internal-jobs.sh --due", "./scripts/ci/post-internal-jobs.sh"),
          OK_SCRIPT
        ).some((e) => e.includes("--due")),
    ],
    [
      "a --due call with extra flags around it still passes (rule 2)",
      () =>
        check(
          OK_ROSTER,
          OK_WORKFLOW.replace(
            "./scripts/ci/post-internal-jobs.sh --due",
            "bash ./scripts/ci/post-internal-jobs.sh --due --verbose"
          ),
          OK_SCRIPT
        ).every((e) => !e.includes("--due")),
    ],
    [
      "a roster job the script's table never posts is caught (rule 3)",
      () =>
        check(
          OK_ROSTER.replace(
            'bucket: "backstops" },',
            'bucket: "backstops" },\n  { job: "phantom-job", expectedIntervalSec: 60, bucket: "hourly" },'
          ),
          OK_WORKFLOW,
          OK_SCRIPT
        ).some((e) => e.includes("phantom-job") && e.includes("silently stopped")),
    ],
    [
      "a route missing from the table fails, not just an added one (rule 3)",
      () =>
        check(
          OK_ROSTER,
          OK_WORKFLOW,
          OK_SCRIPT.replace('["hourly"]="earnings-release booking-auto-completion score-neighborhood-claims"', '["hourly"]="booking-auto-completion score-neighborhood-claims"')
        ).some((e) => e.includes("earnings-release") && e.includes("silently stopped")),
    ],
    [
      "occasion-drafts-daily bucket is out of scope and never flagged",
      () => check(OK_ROSTER, OK_WORKFLOW, OK_SCRIPT).every((e) => !e.includes("run-occasion-drafts")),
    ],
    [
      "a job satisfied by ANY bucket in the table passes, not just the first",
      () =>
        check(
          OK_ROSTER,
          OK_WORKFLOW,
          OK_SCRIPT.replace(
            '["four-hourly"]="booking-expiry"',
            '["four-hourly"]="booking-expiry"\n  ["daily"]="run-occasion-drafts"'
          )
        ).length === 0,
    ],
    ["missing JOB_CADENCE declaration is caught", () => check("// no roster here", OK_WORKFLOW, OK_SCRIPT).some((e) => e.includes("Could not find"))],
    [
      "broken roster parse fails loudly, not vacuously",
      () => check("export const JOB_CADENCE: readonly JobCadence[] = [\n];", OK_WORKFLOW, OK_SCRIPT).some((e) => e.includes("ZERO JOB_CADENCE")),
    ],
    [
      "a script with no BUCKET_ROUTES markers fails loudly, not vacuously",
      () => check(OK_ROSTER, OK_WORKFLOW, "#!/usr/bin/env bash\necho hi\n").some((e) => e.includes("Could not parse a BUCKET_ROUTES table")),
    ],
    [
      "a script with markers but zero table lines fails loudly, not vacuously",
      () =>
        check(OK_ROSTER, OK_WORKFLOW, `${TABLE_BEGIN_MARKER}\n${TABLE_END_MARKER}\n`).some((e) =>
          e.includes("Could not parse a BUCKET_ROUTES table")
        ),
    ],
    [
      "a PROSE mention of the marker text is never mistaken for the real, standalone marker",
      () => {
        // A script that only ever NAMES the marker mid-sentence (as the real script's own header
        // does, while explaining the parse contract) must parse exactly as if that sentence were
        // absent — never as a false BEGIN that swallows everything up to the real END.
        const withProseMention =
          `# See the \`${TABLE_BEGIN_MARKER}\` and \`${TABLE_END_MARKER}\` markers below.\n` + OK_SCRIPT;
        const t = parseBucketRoutesTable(withProseMention);
        return t !== null && t.buckets.backstops.length === 3 && t.routes.has("booking-expiry");
      },
    ],
    [
      "table two-arg parser reads bucket and its route list together",
      () => {
        const t = parseBucketRoutesTable(OK_SCRIPT);
        return (
          t.buckets.backstops.length === 3 &&
          t.buckets.backstops[0] === "checkout-sweep" &&
          t.routes.has("booking-expiry") &&
          !t.routes.has("stripe-reconciliation")
        );
      },
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

  for (const f of [WORKFLOW, ROSTER_FILE, SCRIPT_FILE]) {
    if (!fs.existsSync(f)) {
      console.error(`jobs-cron-roster guard: required file missing — ${path.relative(ROOT, f)}`);
      process.exit(1);
    }
  }

  const errors = check(
    fs.readFileSync(ROSTER_FILE, "utf8"),
    fs.readFileSync(WORKFLOW, "utf8"),
    fs.readFileSync(SCRIPT_FILE, "utf8")
  );
  if (errors.length > 0) {
    console.error("jobs-cron-roster guard FAILED:\n");
    for (const e of errors) console.error(`  • ${e}`);
    console.error("\njobs-cron.yml must carry exactly one cron schedule, call the script in --due mode, and every in-scope JOB_CADENCE route must be posted by some bucket in the script's route table.");
    console.error("See CLAUDE.md §17 rule 2 / §18d and ledger 2026-09-20-jobs-trigger-replit-scheduled.");
    process.exit(1);
  }
  console.log(
    "jobs-cron-roster guard: OK — one cron schedule, --due mode invoked, every in-scope JOB_CADENCE route posted somewhere in the script's bucket→routes table."
  );
}

main();
