#!/usr/bin/env node
/**
 * Spec-arming evidence guard (Trailhead lane C, guard C3).
 *
 * Closes the CONFABULATED-SPEC class named by ledger 2026-08-17-create-service-spec-doa:
 * a spec (`create-service-layout.spec.ts`) was WIRED into a gate
 * (`spec-coverage-gate.yml`) in one commit and merged, but it was BORN RED and
 * had never passed — so the gate was decorative on main for the whole window.
 * "Wired" was mistaken for "verified".
 *
 * THE RULE (mechanically checked). If a PR ARMS a spec — adds a new `*.spec.ts`
 * reference to any `.github/workflows/*.yml` (the shape of putting a spec into a
 * blocking gate) — the PR BODY must LINK A GREEN RUN of that spec. No evidence
 * link ⇒ this check FAILS, per spec. A pure relocation (the same spec name
 * removed and re-added within the workflow diff) is NOT arming and needs no
 * evidence.
 *
 * ACCEPTED EVIDENCE (either form, LINE-SCOPED so one stray URL cannot vouch for
 * an unrelated spec):
 *   1. An explicit marker line:  `spec-green: <spec-file> <url>`
 *      (the line names the spec's filename and carries any http(s) URL), or
 *   2. Any body line that contains BOTH the spec's filename AND a GitHub Actions
 *      run URL — `.../actions/runs/<digits>`.
 *
 * INPUT. `analyze({ diffText, prBody })` is pure. The CLI reads the workflow
 * diff from --diff <file> (or stdin) and the PR body from $PR_BODY (or
 * --body <file>). The workflow computes `git diff <base>...<head> --
 * .github/workflows/` and passes the PR body via env.
 *
 * --self-test (§18d): an arming-WITHOUT-evidence diff FAILS, an
 * arming-WITH-evidence diff (each accepted form) PASSES, and a no-arming /
 * pure-relocation diff PASSES — proven before the verdict on a real PR is
 * trusted. Node built-ins only — no npm ci needed.
 */
const fs = require("fs");

const SPEC_RE = /([A-Za-z0-9_.\-\/]+\.spec\.ts)\b/g;
const WORKFLOW_HEADER_RE = /^\+\+\+ b\/(\.github\/workflows\/[^\s]+\.ya?ml)\s*$/;
const RUN_URL_RE = /actions\/runs\/\d+/;

function basename(p) {
  return p.split("/").pop();
}

/**
 * Parse a unified diff (already scoped to workflow files by the caller, but we
 * re-verify the file header so a stray non-workflow hunk cannot arm/disarm).
 * Returns the set of spec basenames ADDED and REMOVED within workflow hunks.
 */
function specDelta(diffText) {
  const added = new Set();
  const removed = new Set();
  let inWorkflow = false;
  for (const line of (diffText || "").split("\n")) {
    if (line.startsWith("+++ ")) {
      inWorkflow = WORKFLOW_HEADER_RE.test(line);
      continue;
    }
    if (line.startsWith("--- ") || line.startsWith("diff --git")) {
      // A new file section begins; wait for its +++ header to decide scope.
      if (line.startsWith("diff --git")) inWorkflow = false;
      continue;
    }
    if (!inWorkflow) continue;
    const isAdd = line.startsWith("+") && !line.startsWith("+++");
    const isDel = line.startsWith("-") && !line.startsWith("---");
    if (!isAdd && !isDel) continue;
    // A spec named in a YAML comment (e.g. this guard's OWN exhibit reference in
    // spec-arming-gate.yml, or any doc line) is documentation, not wiring — it
    // neither arms nor disarms. Skip pure-comment lines. Applied to +/- alike so
    // a comment's removal never falsely "disarms" a real spec either.
    if (/^\s*#/.test(line.slice(1))) continue;
    let m;
    SPEC_RE.lastIndex = 0;
    while ((m = SPEC_RE.exec(line)) !== null) {
      (isAdd ? added : removed).add(basename(m[1]));
    }
  }
  return { added, removed };
}

/** Newly-armed specs = added-in-workflow minus those merely relocated (also removed). */
function armedSpecs(diffText) {
  const { added, removed } = specDelta(diffText);
  return [...added].filter((s) => !removed.has(s)).sort();
}

function hasEvidence(prBody, specBase) {
  for (const rawLine of (prBody || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.includes(specBase)) continue;
    // Form 2: a run URL on the same line as the spec name.
    if (RUN_URL_RE.test(line)) return true;
    // Form 1: an explicit spec-green marker line carrying any http(s) URL.
    if (/^spec-green:/i.test(line) && /https?:\/\/\S+/.test(line)) return true;
  }
  return false;
}

function analyze({ diffText, prBody }) {
  const armed = armedSpecs(diffText);
  const missing = armed.filter((s) => !hasEvidence(prBody, s));
  return { armed, missing };
}

function selfTest() {
  const armDiff = [
    "diff --git a/.github/workflows/spec-coverage-gate.yml b/.github/workflows/spec-coverage-gate.yml",
    "--- a/.github/workflows/spec-coverage-gate.yml",
    "+++ b/.github/workflows/spec-coverage-gate.yml",
    "@@",
    "+            playwright/tests/create-service-layout.spec.ts \\",
  ].join("\n");

  // A: arming, no evidence in the body → FAIL (the DOA shape).
  const A = analyze({ diffText: armDiff, prBody: "Re-anchors the spec. No run linked." });
  const okA = A.armed.includes("create-service-layout.spec.ts") && A.missing.includes("create-service-layout.spec.ts");

  // B: arming WITH a run-URL line naming the spec → PASS (form 2).
  const bodyB = "Verified green:\ncreate-service-layout.spec.ts passed — https://github.com/o/r/actions/runs/123456";
  const B = analyze({ diffText: armDiff, prBody: bodyB });
  const okB = B.armed.length === 1 && B.missing.length === 0;

  // C: arming WITH an explicit spec-green marker → PASS (form 1).
  const bodyC = "spec-green: create-service-layout.spec.ts https://ci.example/run/9";
  const C = analyze({ diffText: armDiff, prBody: bodyC });
  const okC = C.missing.length === 0;

  // D: no arming (a non-workflow file touches a spec path) → PASS.
  const nonWfDiff = [
    "diff --git a/playwright/tests/x.spec.ts b/playwright/tests/x.spec.ts",
    "--- a/playwright/tests/x.spec.ts",
    "+++ b/playwright/tests/x.spec.ts",
    "@@",
    "+  // edit inside create-service-layout.spec.ts is not arming",
    "+  test('added', () => {});",
  ].join("\n");
  const D = analyze({ diffText: nonWfDiff, prBody: "" });
  const okD = D.armed.length === 0 && D.missing.length === 0;

  // E: pure relocation (removed AND re-added in the workflow) → PASS, no evidence needed.
  const relocDiff = [
    "diff --git a/.github/workflows/spec-coverage-gate.yml b/.github/workflows/spec-coverage-gate.yml",
    "--- a/.github/workflows/spec-coverage-gate.yml",
    "+++ b/.github/workflows/spec-coverage-gate.yml",
    "@@",
    "-            playwright/tests/navbar-responsive.spec.ts \\",
    "+            playwright/tests/navbar-responsive.spec.ts \\",
  ].join("\n");
  const E = analyze({ diffText: relocDiff, prBody: "" });
  const okE = E.armed.length === 0 && E.missing.length === 0;

  // F: evidence line names a DIFFERENT spec → the armed spec is still missing (line-scoped).
  const bodyF = "other-thing.spec.ts https://github.com/o/r/actions/runs/999";
  const F = analyze({ diffText: armDiff, prBody: bodyF });
  const okF = F.missing.includes("create-service-layout.spec.ts");

  // G: a spec named only in an ADDED YAML COMMENT is documentation, not arming →
  // PASS with no evidence. This is the exact false-positive this guard's OWN PR
  // hit (spec-arming-gate.yml's header comment cites create-service-layout.spec.ts).
  const commentDiff = [
    "diff --git a/.github/workflows/spec-arming-gate.yml b/.github/workflows/spec-arming-gate.yml",
    "--- /dev/null",
    "+++ b/.github/workflows/spec-arming-gate.yml",
    "@@",
    "+# Closes the confabulated-spec class: create-service-layout.spec.ts was WIRED",
    "+#   into spec-coverage-gate.yml without a green run — that is what this guards.",
    "+name: Spec-Arming Gate",
  ].join("\n");
  const G = analyze({ diffText: commentDiff, prBody: "" });
  const okG = G.armed.length === 0 && G.missing.length === 0;

  const results = { okA, okB, okC, okD, okE, okF, okG };
  if (!Object.values(results).every(Boolean)) {
    console.error("SELF-TEST FAILED", results, { A, B, C, D, E, F, G });
    process.exit(1);
  }
  console.log("self-test OK (A arm-no-evidence FAILS; B run-URL + C spec-green PASS; D non-workflow + E relocation PASS; F wrong-spec evidence still FAILS; G added-comment mention is NOT arming)");
  process.exit(0);
}

function readArg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv.includes("--self-test")) selfTest();

const diffPath = readArg("--diff");
const bodyPath = readArg("--body");
const diffText = diffPath ? fs.readFileSync(diffPath, "utf8") : fs.readFileSync(0, "utf8");
const prBody = bodyPath ? fs.readFileSync(bodyPath, "utf8") : process.env.PR_BODY || "";

const { armed, missing } = analyze({ diffText, prBody });

if (armed.length === 0) {
  console.log("spec-arming guard OK (no spec newly wired into a workflow in this PR)");
  process.exit(0);
}
console.log(`Specs armed by this PR (added to a workflow): ${armed.join(", ")}`);
if (missing.length === 0) {
  console.log("spec-arming guard OK (every armed spec links a green run in the PR body)");
  process.exit(0);
}
console.error(
  "FAIL  A spec was wired into a CI gate WITHOUT linking a green run in the PR body.\n" +
    "      This is the confabulated-spec class (ledger 2026-08-17-create-service-spec-doa):\n" +
    "      a spec born red and armed anyway makes its gate decorative.\n" +
    "      Missing green-run evidence for: " +
    missing.join(", ") +
    "\n\n      Add ONE of these to the PR body, per spec:\n" +
    "        spec-green: <spec-file> <url-to-green-run>\n" +
    "        …or a line naming <spec-file> alongside a .../actions/runs/<id> URL."
);
process.exit(1);
