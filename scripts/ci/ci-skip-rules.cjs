#!/usr/bin/env node
/**
 * CI-1b (c)+(d): which PR pushes skip the heavy suites, stated ONCE.
 *
 * A pull_request run skips its heavy jobs when the PR is a DRAFT, or when every changed file is DOCS or
 * a workflow file other than the one being run. Every other event (push, schedule, dispatch) runs in full.
 *
 * Two mechanisms, one rule:
 *   - The 13 workflows that provide a required status check (ruleset 25019779, mirrored in
 *     .github/branch-protection.json) keep triggering on every PR. Their `changes` job runs `--decide`,
 *     and every heavy job carries `if: !cancelled() && needs.changes.outputs.run != 'false'` (plus
 *     `needs.<job>.result == 'success'` for any other job it needs). A job skipped by `if:` reports success,
 *     so every required context still appears on the merge head. It skips ONLY on an explicit "false": a
 *     `changes` job that fails or never answers leaves the output empty, and the suites run.
 *   - Every other PR-triggered workflow carries the trigger-level `paths:` list `canonicalPaths()` builds,
 *     plus a draft condition on each job. A workflow that does not trigger blocks nothing.
 *
 * FAILS OPEN: if the changed-file list cannot be read (API error, no token, a PR at the API's 3,000-file
 * cap), the suites run.
 *
 * CANNOT DETECT (§18d): a test that reads a .md file not named in DOCS_THAT_ARE_INPUTS, and a non-required
 * workflow that reads other workflow files but is not named in READS_WORKFLOWS. Both lists are by hand.
 *
 * Usage:
 *   node scripts/ci/ci-skip-rules.cjs --self-test
 *   node scripts/ci/ci-skip-rules.cjs --decide            (in a `changes` job; writes run=… to $GITHUB_OUTPUT)
 *   node scripts/ci/ci-skip-rules.cjs --check-workflows   (structure guard over .github/workflows)
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

/** Markdown files that code or tests read, so a change to them is NOT docs-only. */
const DOCS_THAT_ARE_INPUTS = [
  /^CLAUDE\.md$/, // server/__tests__/public-user-id.test.ts reads it
  /^generated\//, // scripts/mutation-auth/extractor.test.ts reads generated/security/*.md
  /^client\/public\/\.well-known\//, // server/__tests__/well-known-static.test.ts reads its README
];

/** Non-required workflows whose jobs read other workflow files: a workflow change must still run them. */
const READS_WORKFLOWS = ["scheduler-jobs-gate.yml", "spec-arming-gate.yml"];

/** Jobs in required workflows that run on every PR push, drafts and docs-only included (cheap static guards
 *  that read docs or workflow files). Every other job in a required workflow is gated. */
const ALWAYS_JOBS = {
  "build.yml": ["guard-batch", "test-file-reachability"],
  "ci-db-setup-lint.yml": ["composite-action-script-paths", "ci-db-setup-lint", "ci-db-setup-lint-self-test"],
};

const PR_TYPES = ["opened", "synchronize", "reopened", "ready_for_review"];

/** The gate every non-always job in a required workflow carries. Fails open: only an explicit "false" skips. */
const GATE = "!cancelled() && needs.changes.outputs.run != 'false'";

function isDocs(p) {
  return p.endsWith(".md") && !DOCS_THAT_ARE_INPUTS.some((re) => re.test(p));
}
function isWorkflow(p) {
  return p.startsWith(".github/workflows/");
}

/** The ONE decision. `files` null = unknown ⇒ run (fail open). */
function decide({ event, draft, files, workflowFile }) {
  // Merge queue (ledger `2026-10-18-merge-queue-triggers`): a merge_group run tests the PR on top of current
  // main and is ALWAYS a full run — never skipped as draft or docs-only.
  if (event === "merge_group") return { run: true, reason: "merge queue — full run" };
  if (event !== "pull_request") return { run: true, reason: `event ${event}` };
  if (draft) return { run: false, reason: "draft PR" };
  if (!Array.isArray(files) || files.length === 0) return { run: true, reason: "changed files unknown — running (fail open)" };
  const self = workflowFile ? `.github/workflows/${workflowFile}` : null;
  const code = files.filter((f) => !isDocs(f) && !isWorkflow(f));
  if (code.length) return { run: true, reason: `${code.length} non-docs file(s) changed, e.g. ${code[0]}` };
  if (self && files.includes(self)) return { run: true, reason: `this workflow (${workflowFile}) changed` };
  return { run: false, reason: "docs-only / other-workflow-only change" };
}

/** The trigger-level `paths:` list for a non-required workflow. Later entries win for each file. */
function canonicalPaths(workflowFile) {
  const out = ["**", "!**/*.md", "CLAUDE.md", "generated/**", "client/public/.well-known/**"];
  if (!READS_WORKFLOWS.includes(workflowFile)) out.push("!.github/workflows/**", `.github/workflows/${workflowFile}`);
  return out;
}

/** GitHub's path-filter semantics for one file against an ordered list (last match wins). */
function globToRe(g) {
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*" && g[i + 1] === "*") { re += ".*"; i++; if (g[i + 1] === "/") i++; }
    else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}
function pathsMatch(list, file) {
  let hit = false;
  for (const p of list) {
    const neg = p.startsWith("!");
    if (globToRe(neg ? p.slice(1) : p).test(file)) hit = !neg;
  }
  return hit;
}

// ── --decide ─────────────────────────────────────────────────────────────────────────────────────
async function listPrFiles(repo, number, token) {
  const files = [];
  for (let page = 1; page <= 30; page++) {
    const r = await fetch(`https://api.github.com/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
    });
    if (!r.ok) throw new Error(`files API ${r.status}`);
    const batch = await r.json();
    files.push(...batch.map((f) => f.filename));
    if (batch.length < 100) return files;
  }
  return null; // at the API's 3,000-file cap: unknown
}
async function runDecide() {
  const event = process.env.GITHUB_EVENT_NAME;
  const workflowFile = (process.env.WORKFLOW_REF || "").replace(/@.*$/, "").split("/").pop() || null;
  let draft = false, files = null, note = "";
  try {
    const payload = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    draft = !!payload.pull_request?.draft;
    if (event === "pull_request" && !draft) {
      files = await listPrFiles(process.env.GITHUB_REPOSITORY, payload.pull_request.number, process.env.GITHUB_TOKEN);
    }
  } catch (e) {
    note = ` (${e.message})`;
    files = null;
  }
  const d = decide({ event, draft, files, workflowFile });
  console.log(`ci-skip-rules: run=${d.run} — ${d.reason}${note}${files ? `; ${files.length} file(s)` : ""}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `run=${d.run}\n`);
}

// ── --check-workflows (structure guard; text-based, no YAML library) ─────────────────────────────
function requiredContexts(root) {
  const bp = JSON.parse(fs.readFileSync(path.join(root, ".github/branch-protection.json"), "utf8"));
  const found = [];
  (function walk(o) {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === "object") {
      if (Array.isArray(o.contexts)) found.push(...o.contexts);
      if (Array.isArray(o.checks)) found.push(...o.checks.map((c) => c.context));
      Object.values(o).forEach(walk);
    }
  })(bp);
  return new Set(found);
}
function jobsOf(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  const jobs = [];
  if (start < 0) return jobs;
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^  ([A-Za-z0-9_-]+):\s*(#.*)?$/.exec(lines[i]);
    if (m) jobs.push({ id: m[1], start: i, body: [] });
    else if (/^\S/.test(lines[i])) break;
    else if (jobs.length) jobs[jobs.length - 1].body.push(lines[i]);
  }
  return jobs.map((j) => {
    const body = j.body.join("\n");
    const name = (/^    name:\s*(.+)$/m.exec(body) || [])[1];
    return { id: j.id, name: name ? name.trim().replace(/^['"]|['"]$/g, "") : j.id, body };
  });
}
function prBlock(text) {
  const m = /^  pull_request:\s*\n((?:    .*\n|\s*\n)*)/m.exec(text);
  return m ? m[1] : null;
}
function checkWorkflow(file, text, required) {
  const errs = [];
  const pr = prBlock(text);
  if (pr === null) return errs; // not PR-triggered
  if (!PR_TYPES.every((t) => new RegExp(`\\b${t}\\b`).test(pr))) errs.push(`${file}: pull_request.types must include ${PR_TYPES.join(", ")}`);
  const jobs = jobsOf(text);
  const providesRequired = jobs.some((j) => required.has(j.name));
  const always = ALWAYS_JOBS[file] || [];
  if (providesRequired) {
    if (/^    paths(-ignore)?:/m.test(pr)) errs.push(`${file}: provides a required check, so it may not filter its PR trigger by path (the check would go missing)`);
    if (!jobs.some((j) => j.id === "changes")) errs.push(`${file}: provides a required check but has no \`changes\` job`);
    for (const j of jobs) {
      if (j.id === "changes" || always.includes(j.id)) continue;
      if (!j.body.includes(GATE)) errs.push(`${file}: job ${j.id} is not gated with ${GATE}`);
    }
  } else {
    if (!/^    paths:/m.test(pr)) errs.push(`${file}: non-required PR workflow has no paths: filter`);
    else if (/'\*\*'/.test(pr)) {
      const listed = [...pr.matchAll(/^      - '(.*)'\s*$/gm)].map((m) => m[1]);
      const want = canonicalPaths(file);
      if (JSON.stringify(listed) !== JSON.stringify(want)) errs.push(`${file}: paths: must be exactly ${JSON.stringify(want)}`);
    }
    for (const j of jobs) {
      if (!j.body.includes("github.event.pull_request.draft")) errs.push(`${file}: job ${j.id} does not skip drafts`);
    }
    // CI-1b (e)1 (ledger `2026-10-17-ci1b-non-required-off-main-push`): a workflow that provides no
    // required check runs on the PR and not again on the merge push to main.
    const push = /^  push:\s*\n((?:    .*\n|\s*\n)*)/m.exec(text);
    if (push) {
      const br = /^    branches:\s*(.*)$/m.exec(push[1]);
      if (!br || /\bmain\b/.test(br[1])) errs.push(`${file}: provides no required check, so it may not run on push to main (it ran on the PR)`);
    }
  }
  return errs;
}
// Merge queue (ledger `2026-10-18-merge-queue-triggers`): a workflow that provides a required check must also
// run for the merge queue, or a queued PR waits forever for a check that never reports.
// NEGATIVE SPACE: this reads the trigger block only; it cannot see whether the ruleset has the queue on.
function checkMergeGroup(file, text, required) {
  if (prBlock(text) === null) return [];
  if (!jobsOf(text).some((j) => required.has(j.name))) return [];
  return /^  merge_group:/m.test(text) ? [] : [`${file}: provides a required check but has no merge_group: trigger (the merge queue would wait for it forever)`];
}

// Ready-for-review never cancels (ledger `2026-10-18-merge-queue-triggers`): marking a draft ready starts a new run in
// the same concurrency group, and a cancel-in-progress that is true for it cancels the run already in flight (that is
// how #1551 ended up with cancelled duplicates of required checks). Every cancel-in-progress is `false` or an
// expression that excludes `ready_for_review`. NEGATIVE SPACE: it reads the text; it does not evaluate the expression.
function checkReadyForReviewCancel(file, text) {
  const errs = [];
  for (const m of text.matchAll(/^\s*cancel-in-progress:\s*(.*?)\s*$/gm)) {
    if (m[1] !== "false" && !m[1].includes("github.event.action != 'ready_for_review'")) {
      errs.push(`${file}: cancel-in-progress must exclude ready_for_review (found ${m[1]})`);
    }
  }
  return errs;
}

// Runner selection (CI runner Phase 1). Every job's runner is this ONE expression: a self-hosted label
// from the repository variable CI_RUNNER, but ONLY when the event says the repository is private — a
// public repository runs fork PRs, and a fork's code must never reach a self-hosted machine. Unset
// variable, a public repository, or an event whose payload carries no repository (a schedule may not)
// all fall back to GitHub-hosted ubuntu-24.04: the failure mode is hosted minutes, never exposure.
// NEGATIVE SPACE: this reads the workflow text; it cannot see the variable's value or the runner group.
const RUNS_ON = "${{ github.event.repository.private && vars.CI_RUNNER || 'ubuntu-24.04' }}";
function checkRunsOn(file, text) {
  const errs = [];
  for (const m of text.matchAll(/^\s+runs-on:\s*(.*?)\s*$/gm)) {
    if (m[1] !== RUNS_ON) errs.push(`${file}: runs-on must be exactly ${RUNS_ON} (found ${m[1]})`);
  }
  return errs;
}

function runCheck(root = process.cwd()) {
  const dir = path.join(root, ".github/workflows");
  const required = requiredContexts(root);
  const errs = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".yml")).sort()) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    errs.push(...checkWorkflow(f, text, required), ...checkMergeGroup(f, text, required), ...checkRunsOn(f, text), ...checkReadyForReviewCancel(f, text));
  }
  if (errs.length) {
    errs.forEach((e) => console.error(`::error::${e}`));
    process.exit(1);
  }
  console.log("ci-skip-rules: every PR-triggered workflow follows the skip rules, and every job uses the one runner expression ✅");
}

// ── --self-test ──────────────────────────────────────────────────────────────────────────────────
function selfTest() {
  const assert = require("node:assert/strict");
  const pr = (files, extra = {}) => decide({ event: "pull_request", draft: false, files, workflowFile: "build.yml", ...extra });
  // decide()
  assert.equal(decide({ event: "push", files: ["docs/a.md"] }).run, true, "push always runs");
  assert.equal(pr(["server/x.ts"], { draft: true }).run, false, "draft skips");
  assert.equal(pr(["docs/a.md", "README.md"]).run, false, "docs-only skips");
  assert.equal(pr(["CLAUDE.md"]).run, true, "CLAUDE.md is a test input");
  assert.equal(pr(["generated/security/inv.md"]).run, true, "generated md is a test input");
  assert.equal(pr(["client/public/.well-known/README.md"]).run, true, "well-known README is a test input");
  assert.equal(pr(["docs/audits/harness/build.mjs"]).run, true, "a script under docs/ is code");
  assert.equal(pr([".github/workflows/other.yml"]).run, false, "another workflow only skips");
  assert.equal(pr([".github/workflows/build.yml"]).run, true, "own workflow runs");
  assert.equal(pr([".github/actions/start-postgres/action.yml"]).run, true, "a composite action is code");
  assert.equal(pr(null).run, true, "unknown files fail open");
  assert.equal(pr([]).run, true, "empty list fails open");
  assert.equal(decide({ event: "merge_group", draft: true, files: ["docs/a.md"] }).run, true, "a merge_group run is always full");
  // canonicalPaths + GitHub semantics
  const p = canonicalPaths("home-gate.yml");
  assert.equal(pathsMatch(p, "docs/x.md"), false);
  assert.equal(pathsMatch(p, "server/a.ts"), true);
  assert.equal(pathsMatch(p, "CLAUDE.md"), true);
  assert.equal(pathsMatch(p, ".github/workflows/build.yml"), false);
  assert.equal(pathsMatch(p, ".github/workflows/home-gate.yml"), true);
  assert.equal(pathsMatch(p, ".github/actions/ci-db-setup/action.yml"), true);
  assert.equal(pathsMatch(canonicalPaths("spec-arming-gate.yml"), ".github/workflows/build.yml"), true, "a workflow reader runs on workflow changes");
  // the decision and the paths list agree for a non-required workflow
  for (const files of [["docs/a.md"], ["server/a.ts"], [".github/workflows/x.yml"], ["CLAUDE.md"], ["docs/a.md", ".github/workflows/home-gate.yml"]]) {
    const viaDecide = decide({ event: "pull_request", draft: false, files, workflowFile: "home-gate.yml" }).run;
    assert.equal(files.some((f) => pathsMatch(p, f)), viaDecide, `paths list and decide() agree on ${files}`);
  }
  // checkWorkflow()
  const req = new Set(["build (vite + esbuild bundle)"]);
  const types = "    types: [opened, synchronize, reopened, ready_for_review]\n";
  const reqOk = `on:\n  pull_request:\n    branches: [main]\n${types}jobs:\n  changes:\n    runs-on: x\n  build:\n    name: build (vite + esbuild bundle)\n    needs: [changes]\n    if: \${{ !cancelled() && needs.changes.outputs.run != 'false' }}\n`;
  assert.deepEqual(checkWorkflow("build.yml", reqOk, req), []);
  assert.equal(checkWorkflow("build.yml", reqOk.replace("    if: \${{ !cancelled() && needs.changes.outputs.run != 'false' }}\n", ""), req).length, 1, "ungated required-workflow job fails");
  assert.equal(checkWorkflow("build.yml", reqOk.replace(types, `${types}    paths:\n      - 'server/**'\n`), req).length, 1, "a path filter on a required workflow fails");
  assert.equal(checkWorkflow("build.yml", reqOk.replace(types, ""), req).length, 1, "missing ready_for_review fails");
  const nonReqPaths = canonicalPaths("home-gate.yml").map((x) => `      - '${x}'\n`).join("");
  const nonOk = `on:\n  pull_request:\n    branches: [main]\n${types}    paths:\n${nonReqPaths}jobs:\n  home:\n    if: github.event_name != 'pull_request' || github.event.pull_request.draft == false\n`;
  assert.deepEqual(checkWorkflow("home-gate.yml", nonOk, req), []);
  assert.equal(checkWorkflow("home-gate.yml", nonOk.replace("github.event.pull_request.draft == false", "true"), req).length, 1, "a job without the draft skip fails");
  assert.equal(checkWorkflow("home-gate.yml", nonOk.replace("      - 'CLAUDE.md'\n", ""), req).length, 1, "a drifted paths list fails");
  assert.equal(checkWorkflow("home-gate.yml", nonOk.replace("on:\n", "on:\n  push:\n    branches: [main]\n"), req).length, 1, "a non-required workflow on push to main fails");
  assert.equal(checkWorkflow("home-gate.yml", nonOk.replace("on:\n", "on:\n  push:\n"), req).length, 1, "a non-required workflow on every push fails");
  assert.deepEqual(checkWorkflow("home-gate.yml", nonOk.replace("on:\n", "on:\n  push:\n    branches: [lane/x]\n"), req), [], "a push trigger on another branch is accepted");
  assert.deepEqual(checkWorkflow("build.yml", reqOk.replace("on:\n", "on:\n  push:\n    branches: [main]\n"), req), [], "a required workflow keeps its push to main");
  const narrow = `on:\n  pull_request:\n${types}    paths:\n      - 'server/x.ts'\njobs:\n  a:\n    if: github.event.pull_request.draft == false\n`;
  assert.deepEqual(checkWorkflow("narrow.yml", narrow, req), [], "a pre-existing narrow paths list is accepted");
  assert.equal(checkMergeGroup("build.yml", reqOk, req).length, 1, "a required workflow without merge_group fails");
  assert.deepEqual(checkMergeGroup("build.yml", reqOk.replace("on:\n", "on:\n  merge_group:\n    types: [checks_requested]\n"), req), [], "a required workflow with merge_group passes");
  assert.deepEqual(checkMergeGroup("home-gate.yml", nonOk, req), [], "a non-required workflow needs no merge_group");
  assert.equal(checkReadyForReviewCancel("x.yml", "concurrency:\n  cancel-in-progress: true\n").length, 1, "an unconditional cancel fails");
  assert.equal(checkReadyForReviewCancel("x.yml", "concurrency:\n  cancel-in-progress: ${{ github.event_name == 'pull_request' }}\n").length, 1, "a PR-only cancel that still fires on ready_for_review fails");
  assert.deepEqual(checkReadyForReviewCancel("x.yml", "concurrency:\n  cancel-in-progress: ${{ github.event_name == 'pull_request' && github.event.action != 'ready_for_review' }}\n"), [], "excluding ready_for_review passes");
  assert.deepEqual(checkReadyForReviewCancel("x.yml", "concurrency:\n  cancel-in-progress: false\n"), [], "false passes");
  assert.deepEqual(checkRunsOn("a.yml", `jobs:\n  a:\n    runs-on: ${RUNS_ON}\n`), [], "the one runner expression passes");
  assert.equal(checkRunsOn("a.yml", "jobs:\n  a:\n    runs-on: ubuntu-latest\n").length, 1, "a hard-coded hosted label fails");
  assert.equal(checkRunsOn("a.yml", "jobs:\n  a:\n    runs-on: self-hosted\n").length, 1, "a hard-coded self-hosted label fails");
  assert.equal(checkRunsOn("a.yml", "jobs:\n  a:\n    runs-on: ${{ vars.CI_RUNNER || 'ubuntu-latest' }}\n").length, 1, "the variable without the private-repository condition fails");
  console.log("ci-skip-rules self-test: all fixtures pass ✅");
}

module.exports = { RUNS_ON, checkRunsOn, checkMergeGroup, GATE, decide, canonicalPaths, pathsMatch, isDocs, checkWorkflow, ALWAYS_JOBS, READS_WORKFLOWS, PR_TYPES };

if (require.main === module) {
  const arg = process.argv[2];
  if (arg === "--self-test") selfTest();
  else if (arg === "--decide") runDecide().catch((e) => { console.log(`ci-skip-rules: run=true — decide crashed (${e.message}), failing open`); if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, "run=true\n"); });
  else if (arg === "--check-workflows") runCheck();
  else { console.error("usage: ci-skip-rules.cjs --self-test | --decide | --check-workflows"); process.exit(2); }
}
