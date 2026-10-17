#!/usr/bin/env node
/**
 * Spec-arming evidence guard (Trailhead lane C, guard C3; VERIFIED by ledger `2026-10-11-spec-arming-verified`).
 *
 * Closes the CONFABULATED-SPEC class named by ledger 2026-08-17-create-service-spec-doa:
 * a spec (`create-service-layout.spec.ts`) was WIRED into a gate
 * (`spec-coverage-gate.yml`) in one commit and merged, but it was BORN RED and
 * had never passed — so the gate was decorative on main for the whole window.
 * "Wired" was mistaken for "verified".
 *
 * THE RULE. If a PR ARMS a spec — adds a new `*.spec.ts` reference to a
 * `.github/workflows/*.yml` — the workflow that now runs it must have a run that
 * CONCLUDED `success` on THIS PR's head commit. A pure relocation (the same spec
 * removed and re-added within the workflow diff) is not arming.
 *
 * WHY NOT A LINK (decision-maker, Oct 11, 2026: "Fix the gate, don't drop it"). The first version accepted a
 * URL typed into the PR body. A link in a text field is an assertion, not a verification: a session could
 * satisfy it by typing. The verdict now comes ONLY from the GitHub Actions API:
 *   1. the gate looks up the runs of the arming workflow (by its file path) on the PR head SHA and WAITS for
 *      one to complete (poll, bounded by SPEC_ARMING_WAIT_MINUTES, default 50);
 *   2. a run id named in the body (`.../actions/runs/<id>` on a line naming the spec) is a POINTER the gate
 *      fetches and checks the same way — never evidence by itself.
 * A run counts only if: it is in THIS repository, its `path` is the arming workflow, its `head_sha` is the PR
 * head, it is `completed`, and its `conclusion` is `success`. No token ⇒ FAIL (cannot verify ⇒ not verified).
 *
 * ARMED BUT SKIPPED IS NOT GREEN (decision-maker, Oct 11, 2026: "read the Playwright JSON report and refuse an
 * armed spec that was skipped"). A run concludes `success` when a spec skips itself, so the run alone cannot tell
 * pass from skip. For the green run, the gate downloads that run's `playwright-json*` artifact(s) (the JSON
 * reporter's output — `playwright.config.ts` writes `playwright-json/results.json` under CI) and requires:
 * at least one test of the spec in the report, and EVERY one `expected` or `flaky`. A skipped test FAILS and the
 * FAIL quotes the spec's own skip reason, so "skipped because the sandbox priced every hotel below SSP" reads as
 * exactly that. No report artifact ⇒ FAIL ("cannot tell pass from skip") — the workflow must upload it.
 *
 * NEGATIVE SPACE (§18d — green means green-within-stated-bounds):
 *   • It reads TEST outcomes, not assertions: a test that reaches its end without asserting anything is `expected`.
 *   • A spec is matched in the report by FILE BASENAME; two specs with the same basename in one report are merged.
 *   • A workflow that arms several specs is verified as ONE run; which job ran which spec is not mapped.
 *   • A workflow that never runs on the PR head (schedule / dispatch only) has no automatic run: the pointer
 *     form must name a run dispatched on that head SHA.
 *
 * INPUT. The pure parts are `analyze({ diffText })` (which specs are armed, by which workflow),
 * `verifyRun(run, ctx)` / `evaluatePointers` (does a run count) and `verdictFromReport` (did the spec's tests run). The CLI reads the workflow diff from --diff <file> (or
 * stdin; empty ⇒ nothing armed), the PR body from $PR_BODY, and GITHUB_TOKEN / GITHUB_REPOSITORY / HEAD_SHA
 * from the environment. --self-test (§18d) proves the pure parts before any verdict is trusted.
 */
const fs = require("fs");

const SPEC_RE = /([A-Za-z0-9_.\-\/]+\.spec\.ts)\b/g;
const WORKFLOW_HEADER_RE = /^\+\+\+ b\/(\.github\/workflows\/[^\s]+\.ya?ml)\s*$/;
// A DELETED workflow's diff names it only on the `--- a/<path>` line (its `+++` is /dev/null), and
// every line it held is a `-` line: those are removals, so a spec moved out of a deleted workflow into
// another one is a relocation, never an arming (CI-1b (e)2 consolidated seven gates exactly this way).
const WORKFLOW_MINUS_RE = /^--- a\/(\.github\/workflows\/[^\s]+\.ya?ml)\s*$/;
const RUN_ID_RE = /actions\/runs\/(\d+)/g;

function basename(p) {
  return p.split("/").pop();
}

/** Pure: per workflow file, the spec basenames ADDED and REMOVED in its hunks (comments ignored). */
function specDeltaByWorkflow(diffText) {
  const byWf = new Map();
  let wf = null;
  let minusWf = null;
  for (const line of (diffText || "").split("\n")) {
    if (line.startsWith("--- ") && !wf) {
      const m = WORKFLOW_MINUS_RE.exec(line);
      minusWf = m ? m[1] : null;
      continue;
    }
    if (line.startsWith("+++ ")) {
      const m = WORKFLOW_HEADER_RE.exec(line);
      wf = m ? m[1] : /^\+\+\+ \/dev\/null\s*$/.test(line) ? minusWf : null;
      minusWf = null;
      if (wf && !byWf.has(wf)) byWf.set(wf, { added: new Set(), removed: new Set() });
      continue;
    }
    if (line.startsWith("diff --git")) {
      wf = null;
      minusWf = null;
      continue;
    }
    if (line.startsWith("--- ") || !wf) continue;
    const isAdd = line.startsWith("+");
    const isDel = line.startsWith("-");
    if (!isAdd && !isDel) continue;
    // A spec named in a YAML comment is documentation, not wiring — it neither arms nor disarms.
    if (/^\s*#/.test(line.slice(1))) continue;
    let m;
    SPEC_RE.lastIndex = 0;
    while ((m = SPEC_RE.exec(line)) !== null) (isAdd ? byWf.get(wf).added : byWf.get(wf).removed).add(basename(m[1]));
  }
  return byWf;
}

/** Pure: [{ spec, workflow }] newly armed (added in a workflow and not merely relocated within the diff). */
function analyze({ diffText }) {
  const byWf = specDeltaByWorkflow(diffText);
  const removedAnywhere = new Set();
  for (const d of byWf.values()) for (const s of d.removed) removedAnywhere.add(s);
  const armed = [];
  for (const [workflow, d] of byWf) for (const spec of d.added) if (!removedAnywhere.has(spec)) armed.push({ spec, workflow });
  return armed.sort((a, b) => (a.spec + a.workflow).localeCompare(b.spec + b.workflow));
}

/** Pure: does this Actions run count as green evidence? → "ok" | "pending" | a refusal reason. */
function verifyRun(run, ctx) {
  if (!run || typeof run !== "object") return "no_run";
  if (run.repository && run.repository.full_name && run.repository.full_name !== ctx.repo) return "other_repo";
  if (run.path !== ctx.workflow) return "other_workflow";
  if (run.head_sha !== ctx.headSha) return "other_commit";
  if (run.status !== "completed") return "pending";
  if (run.conclusion !== "success") return `conclusion_${run.conclusion}`;
  return "ok";
}

/** Pure: run ids the body names on a line that also names the spec (pointers only). */
function pointerRunIds(prBody, spec) {
  const ids = [];
  for (const line of (prBody || "").split(/\r?\n/)) {
    if (!line.includes(spec)) continue;
    let m;
    RUN_ID_RE.lastIndex = 0;
    while ((m = RUN_ID_RE.exec(line)) !== null) ids.push(m[1]);
  }
  return ids;
}

/** Pure: every test of `spec` (basename) in a Playwright JSON report → { ok, why?, counts }. */
function verdictFromReport(report, spec) {
  const tests = [];
  const walk = (suite) => {
    if (!suite || typeof suite !== "object") return;
    for (const sp of suite.specs || []) {
      const file = sp.file || suite.file || "";
      if (basename(file) !== spec) continue;
      for (const t of sp.tests || []) tests.push({ title: sp.title, t });
    }
    for (const child of suite.suites || []) walk(child);
  };
  for (const s of (report && report.suites) || []) walk(s);
  if (!tests.length) return { ok: false, why: `the run's report holds no test from ${spec} — the run did not execute it` };
  const skipped = tests.filter(({ t }) => t.status === "skipped");
  const bad = tests.filter(({ t }) => t.status !== "expected" && t.status !== "flaky" && t.status !== "skipped");
  if (bad.length) return { ok: false, why: `${bad.length} test(s) in ${spec} did not pass: ${bad.map(({ title, t }) => `"${title}" ${t.status}`).join(", ")}` };
  if (skipped.length) {
    const reasons = [];
    for (const { t } of skipped) {
      const notes = [...(t.annotations || []), ...((t.results || []).flatMap((r) => r.annotations || []))];
      for (const a of notes) if (a && a.type === "skip" && a.description && !reasons.includes(a.description)) reasons.push(a.description);
    }
    const reason = reasons.length ? reasons.map((r) => `"${r}"`).join("; ") : "the spec gave no reason (test.skip with no description)";
    return {
      ok: false,
      why: `ARMED BUT SKIPPED — ${skipped.length} of ${tests.length} test(s) in ${spec} did not run, so the run's success proves nothing about them. Reason given by the spec: ${reason}`,
    };
  }
  return { ok: true, counts: tests.length };
}

/** Pure: the verdict on every run the body points at for `spec`, given those runs (fetched by the caller). */
function evaluatePointers(prBody, spec, runsById, ctx) {
  return pointerRunIds(prBody, spec).map((id) => ({ id, verdict: runsById[id] ? verifyRun(runsById[id], ctx) : "no_run" }));
}

function selfTest() {
  const results = {};
  const armDiff = [
    "diff --git a/.github/workflows/spec-coverage-gate.yml b/.github/workflows/spec-coverage-gate.yml",
    "--- a/.github/workflows/spec-coverage-gate.yml",
    "+++ b/.github/workflows/spec-coverage-gate.yml",
    "@@",
    "+            playwright/tests/create-service-layout.spec.ts \\",
  ].join("\n");
  const A = analyze({ diffText: armDiff });
  results.A_arming_found = A.length === 1 && A[0].spec === "create-service-layout.spec.ts" && A[0].workflow === ".github/workflows/spec-coverage-gate.yml";
  const nonWf = ["diff --git a/x.spec.ts b/x.spec.ts", "--- a/x.spec.ts", "+++ b/playwright/tests/x.spec.ts", "@@", "+ // create-service-layout.spec.ts"].join("\n");
  results.B_non_workflow_not_arming = analyze({ diffText: nonWf }).length === 0;
  const reloc = [
    "diff --git a/.github/workflows/a.yml b/.github/workflows/a.yml",
    "--- a/.github/workflows/a.yml",
    "+++ b/.github/workflows/a.yml",
    "@@",
    "-  playwright/tests/navbar-responsive.spec.ts",
    "+  playwright/tests/navbar-responsive.spec.ts",
  ].join("\n");
  results.C_relocation_not_arming = analyze({ diffText: reloc }).length === 0;
  const comment = ["diff --git a/.github/workflows/g.yml b/.github/workflows/g.yml", "--- /dev/null", "+++ b/.github/workflows/g.yml", "@@", "+# cites create-service-layout.spec.ts", "+name: G"].join("\n");
  results.D_comment_not_arming = analyze({ diffText: comment }).length === 0;
  results.E_empty_diff = analyze({ diffText: "" }).length === 0;
  // A spec moved out of a DELETED workflow (`+++ /dev/null`) into another file is a relocation.
  const deletedMove = [
    "diff --git a/.github/workflows/new.yml b/.github/workflows/new.yml",
    "--- /dev/null",
    "+++ b/.github/workflows/new.yml",
    "@@",
    "+  playwright/tests/paris-surfacing.spec.ts",
    "diff --git a/.github/workflows/old.yml b/.github/workflows/old.yml",
    "--- a/.github/workflows/old.yml",
    "+++ /dev/null",
    "@@",
    "-  playwright/tests/paris-surfacing.spec.ts",
  ].join("\n");
  results.E2_deleted_workflow_move_not_arming = analyze({ diffText: deletedMove }).length === 0;
  // Deleting a non-workflow file does not donate removals, and a spec added with no removal still arms.
  const deletedOther = [
    "diff --git a/docs/x.yml b/docs/x.yml",
    "--- a/docs/x.yml",
    "+++ /dev/null",
    "@@",
    "-  playwright/tests/paris-surfacing.spec.ts",
    "diff --git a/.github/workflows/new.yml b/.github/workflows/new.yml",
    "--- /dev/null",
    "+++ b/.github/workflows/new.yml",
    "@@",
    "+  playwright/tests/paris-surfacing.spec.ts",
  ].join("\n");
  const E3 = analyze({ diffText: deletedOther });
  results.E3_deleted_non_workflow_still_arms = E3.length === 1 && E3[0].spec === "paris-surfacing.spec.ts";

  const ctx = { repo: "o/r", workflow: ".github/workflows/spec-coverage-gate.yml", headSha: "abc" };
  const good = { repository: { full_name: "o/r" }, path: ctx.workflow, head_sha: "abc", status: "completed", conclusion: "success" };
  results.F_green_run_ok = verifyRun(good, ctx) === "ok";
  results.G_failed_run_refused = verifyRun({ ...good, conclusion: "failure" }, ctx) === "conclusion_failure";
  results.H_other_commit_refused = verifyRun({ ...good, head_sha: "old" }, ctx) === "other_commit";
  results.I_other_workflow_refused = verifyRun({ ...good, path: ".github/workflows/other.yml" }, ctx) === "other_workflow";
  results.J_other_repo_refused = verifyRun({ ...good, repository: { full_name: "x/y" } }, ctx) === "other_repo";
  results.K_in_progress_pending = verifyRun({ ...good, status: "in_progress", conclusion: null }, ctx) === "pending";
  results.L_skipped_refused = verifyRun({ ...good, conclusion: "skipped" }, ctx) === "conclusion_skipped";
  results.M_pointer_scoped_to_spec =
    pointerRunIds("create-service-layout.spec.ts https://github.com/o/r/actions/runs/123\nother.spec.ts https://github.com/o/r/actions/runs/9", "create-service-layout.spec.ts").join() === "123";
  // The typed form is no longer evidence: a marker line with a URL yields no run id and verifies nothing.
  results.N_typed_marker_not_evidence = pointerRunIds("spec-green: create-service-layout.spec.ts https://ci.example/run/9", "create-service-layout.spec.ts").length === 0;
  // The old gate's hole, end to end: a `spec-green:` line linking a REAL green run of the right workflow in the right
  // repo — but on ANOTHER commit. The pointer is followed, and the run is refused for its commit.
  const stale = evaluatePointers(
    "spec-green: create-service-layout.spec.ts https://github.com/o/r/actions/runs/777",
    "create-service-layout.spec.ts",
    { 777: { ...good, id: 777, head_sha: "old" } },
    ctx,
  );
  results.O_green_link_other_commit_refused = stale.length === 1 && stale[0].id === "777" && stale[0].verdict === "other_commit";

  const rep = (tests, file = "journeys/j-stay-book-sandbox.spec.ts") => ({ suites: [{ file, specs: [], suites: [{ file, specs: [{ file, title: "books and cancels", tests }] }] }] });
  const SPEC = "j-stay-book-sandbox.spec.ts";
  results.P_report_passed_ok = verdictFromReport(rep([{ status: "expected", annotations: [] }]), SPEC).ok === true;
  results.Q_report_flaky_ok = verdictFromReport(rep([{ status: "flaky", annotations: [] }]), SPEC).ok === true;
  const skip = verdictFromReport(
    rep([{ status: "skipped", annotations: [{ type: "skip", description: "BOOK AND CANCEL NOT EXERCISED: every sandbox hotel tried was below its suggested selling price" }] }]),
    SPEC,
  );
  results.R_skipped_refused_with_reason = skip.ok === false && /ARMED BUT SKIPPED/.test(skip.why) && /below its suggested selling price/.test(skip.why);
  const skipInResult = verdictFromReport(rep([{ status: "skipped", annotations: [], results: [{ annotations: [{ type: "skip", description: "no key" }] }] }]), SPEC);
  results.S_skip_reason_from_result_annotations = skipInResult.ok === false && /"no key"/.test(skipInResult.why);
  const skipNoReason = verdictFromReport(rep([{ status: "skipped" }]), SPEC);
  results.T_skip_without_reason_still_refused = skipNoReason.ok === false && /gave no reason/.test(skipNoReason.why);
  results.U_spec_absent_refused = verdictFromReport(rep([{ status: "expected" }], "other.spec.ts"), SPEC).ok === false;
  results.V_unexpected_refused = /did not pass/.test(verdictFromReport(rep([{ status: "unexpected" }]), SPEC).why || "");
  results.W_one_skip_among_passes_refused = verdictFromReport(rep([{ status: "expected" }, { status: "skipped" }]), SPEC).ok === false;

  const failed = Object.entries(results).filter(([, v]) => !v);
  if (failed.length) {
    console.error("SELF-TEST FAILED", failed.map(([k]) => k));
    process.exit(1);
  }
  console.log(`spec-arming self-test OK (${Object.keys(results).length} cases: arming detection; runs verified by repo, workflow, head SHA and conclusion — a typed link, or a green link on another commit, is not evidence; and the run's Playwright report refuses a skipped spec, naming its reason)`);
  process.exit(0);
}

async function gh(path, token) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} on ${path}`);
  return res.json();
}

/** The green run's Playwright JSON report(s): artifacts named `playwright-json*`, downloaded and unzipped. */
async function reportVerdict(runId, spec, env, how) {
  const { execFileSync } = require("child_process");
  const os = require("os");
  const path = require("path");
  const arts = ((await gh(`/repos/${env.repo}/actions/runs/${runId}/artifacts?per_page=100`, env.token)).artifacts || []).filter(
    (a) => a.name.startsWith("playwright-json") && !a.expired,
  );
  if (!arts.length)
    return {
      ok: false,
      why: `${how}, but it uploaded no \`playwright-json*\` artifact — the gate cannot tell pass from skip. Upload playwright-json/ (the JSON reporter's output) from the job that runs ${spec}.`,
    };
  const suites = [];
  for (const a of arts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spec-arming-"));
    const res = await fetch(a.archive_download_url, { headers: { Authorization: `Bearer ${env.token}`, Accept: "application/vnd.github+json" } });
    if (!res.ok) return { ok: false, why: `${how}, but its artifact ${a.name} could not be downloaded (${res.status})` };
    fs.writeFileSync(path.join(dir, "a.zip"), Buffer.from(await res.arrayBuffer()));
    execFileSync("unzip", ["-q", "-o", path.join(dir, "a.zip"), "-d", path.join(dir, "out")]);
    for (const f of fs.readdirSync(path.join(dir, "out"), { recursive: true })) {
      if (!String(f).endsWith(".json")) continue;
      try {
        suites.push(...(JSON.parse(fs.readFileSync(path.join(dir, "out", String(f)), "utf8")).suites || []));
      } catch {
        /* not a Playwright report */
      }
    }
  }
  const v = verdictFromReport({ suites }, spec);
  return v.ok ? { ok: true, how: `${how}; its report shows ${v.counts} test(s) of ${spec} run, none skipped` } : { ok: false, why: `${how}, but ${v.why}` };
}

async function verifyArmed({ spec, workflow }, env) {
  const ctx = { repo: env.repo, workflow, headSha: env.headSha };
  const waitMs = env.waitMinutes * 60_000;
  const started = Date.now();
  let last = "no run of the arming workflow on the head commit yet";
  for (;;) {
    // Pointers first: a run named in the body, fetched and checked like any other.
    for (const id of pointerRunIds(env.prBody, spec)) {
      try {
        const v = verifyRun(await gh(`/repos/${env.repo}/actions/runs/${id}`, env.token), ctx);
        if (v === "ok") return reportVerdict(id, spec, env, `run ${id} (named in the body, verified)`);
        last = `run ${id}: ${v}`;
      } catch (err) {
        last = `run ${id}: ${err.message}`;
      }
    }
    const list = await gh(`/repos/${env.repo}/actions/runs?head_sha=${env.headSha}&per_page=100`, env.token);
    const runs = (list.workflow_runs || []).filter((r) => r.path === workflow);
    const verdicts = runs.map((r) => [r, verifyRun(r, ctx)]);
    const green = verdicts.find(([, v]) => v === "ok");
    if (green) return reportVerdict(green[0].id, spec, env, `run ${green[0].id} on ${env.headSha.slice(0, 9)} concluded success`);
    const pending = verdicts.some(([, v]) => v === "pending");
    if (runs.length && !pending) return { ok: false, why: `every run of ${workflow} on the head commit finished without success: ${verdicts.map(([r, v]) => `${r.id} ${v}`).join(", ")}` };
    if (runs.length) last = `run(s) of ${workflow} still in progress`;
    if (Date.now() - started > waitMs) return { ok: false, why: `${last} after ${env.waitMinutes} min` };
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

async function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const i = process.argv.indexOf("--diff");
  const diffText = i >= 0 ? fs.readFileSync(process.argv[i + 1], "utf8") : fs.readFileSync(0, "utf8");
  const armed = analyze({ diffText });
  if (!armed.length) {
    console.log("spec-arming guard OK (no spec newly wired into a workflow in this PR)");
    return;
  }
  console.log(`Specs armed by this PR: ${armed.map((a) => `${a.spec} (${a.workflow})`).join(", ")}`);
  const env = {
    token: process.env.GITHUB_TOKEN || "",
    repo: process.env.GITHUB_REPOSITORY || "",
    headSha: process.env.HEAD_SHA || "",
    prBody: process.env.PR_BODY || "",
    waitMinutes: Number(process.env.SPEC_ARMING_WAIT_MINUTES) > 0 ? Number(process.env.SPEC_ARMING_WAIT_MINUTES) : 50,
  };
  if (!env.token || !env.repo || !env.headSha) {
    console.error("FAIL  cannot verify: GITHUB_TOKEN, GITHUB_REPOSITORY and HEAD_SHA are required — unverified is not verified.");
    process.exit(1);
  }
  let failed = 0;
  for (const a of armed) {
    const r = await verifyArmed(a, env);
    if (r.ok) console.log(`  OK    ${a.spec}: ${r.how}`);
    else {
      failed++;
      console.error(`  FAIL  ${a.spec}: ${r.why}`);
    }
  }
  if (failed) {
    console.error(
      "\nA spec was wired into a CI workflow without a GREEN RUN of that workflow on this commit (ledger\n" +
        "2026-08-17-create-service-spec-doa; verified since 2026-10-11-spec-arming-verified), or the run's\n" +
        "Playwright report shows the spec SKIPPED. Make the run green with every test executed, or, for a\n" +
        "dispatch-only workflow, dispatch it on this head SHA and name its run on a line with the spec.",
    );
    process.exit(1);
  }
  console.log("spec-arming guard OK (every armed spec has a verified green run on the head commit, and its report shows it ran)");
}

main().catch((err) => {
  console.error(`FAIL  spec-arming guard error: ${err.message}`);
  process.exit(1);
});
