#!/usr/bin/env node
/**
 * Ledger union-merge guard (Trailhead lane C, guard C1).
 *
 * Two enforcement facts, one script:
 *
 *   MAIN MODE (default) — asserts `.gitattributes` declares the union merge
 *   driver for docs/DECISIONS.md (`docs/DECISIONS.md merge=union`). This is the
 *   config that makes parallel ledger appends AUTO-UNION instead of producing a
 *   textual merge conflict on the shared table tail (a class that has hit every
 *   parallel-pair ~3x). If the line is deleted or the path drifts, this fails.
 *
 *   --self-test (§18d precedent) — proves the PAIR that makes union-merge safe:
 *     (A) git's union driver actually keeps BOTH parallel-appended rows with NO
 *         conflict markers (exercised in a throwaway temp git repo), and
 *     (B) the ONE bad merge union can produce — two lanes claiming the SAME row
 *         id — is a DUPLICATE that the dup-slug lint
 *         (scripts/check-decision-guards.cjs) is built to catch. Part B both
 *         (i) shows a duplicate id physically results from a same-id union, and
 *         (ii) runs the real dup-slug lint's own --self-test (its ok2/ok7 dupe
 *         fixtures) to confirm the safety-net predicate still fails on a dup.
 *
 * Node built-ins only — no npm ci needed. The temp-repo steps shell out to the
 * `git` already on PATH in CI.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GITATTRIBUTES = path.join(ROOT, ".gitattributes");
const LEDGER_REL = "docs/DECISIONS.md";
const UNION_LINE_RE = /^\s*docs\/DECISIONS\.md\s+merge=union\s*$/m;

// The row-id regex from check-decision-guards.cjs (kept in sync deliberately —
// this script's Part B only needs to recognise that a duplicate id physically
// exists in a merged file; the authoritative dup detection is that script's).
const ID_ALT = String.raw`\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*|\d+|R-[A-Z]`;
const ROW_ID_PREFIX_RE = new RegExp(String.raw`^\|\s*(${ID_ALT})\s*\|`);

function extractIds(text) {
  const ids = [];
  for (const line of text.split("\n")) {
    const m = line.match(ROW_ID_PREFIX_RE);
    if (m) ids.push(m[1]);
  }
  return ids;
}

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  });
}

/**
 * Build a throwaway repo whose `.gitattributes` unions a ledger file, then
 * merge two branches that each appended one row. Returns the merged file text
 * and whether the merge exited cleanly (no conflict). `sameId` makes both
 * branches append the SAME id, to demonstrate the duplicate union can produce.
 */
function simulateUnionMerge({ sameId }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-union-"));
  try {
    git(dir, ["init", "-q", "-b", "main"]);
    fs.writeFileSync(path.join(dir, ".gitattributes"), "ledger.md merge=union\n");
    const header = ["| # | Date | Tag |", "|---|------|-----|", "| 1 | d | [advisory] |", ""].join("\n");
    fs.writeFileSync(path.join(dir, "ledger.md"), header);
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-qm", "base"]);

    // Branch B: append one row.
    git(dir, ["checkout", "-q", "-b", "laneB"]);
    const idB = sameId ? "2026-08-21-shared" : "2026-08-21-lane-b";
    fs.appendFileSync(path.join(dir, "ledger.md"), `| ${idB} | d | [advisory] | B |\n`);
    git(dir, ["commit", "-qam", "laneB row"]);

    // main: append a different row.
    git(dir, ["checkout", "-q", "main"]);
    const idA = sameId ? "2026-08-21-shared" : "2026-08-21-lane-a";
    fs.appendFileSync(path.join(dir, "ledger.md"), `| ${idA} | d | [advisory] | A |\n`);
    git(dir, ["commit", "-qam", "main row"]);

    let clean = true;
    try {
      git(dir, ["merge", "-q", "--no-edit", "laneB"]);
    } catch (_e) {
      clean = false; // conflict
    }
    const merged = fs.readFileSync(path.join(dir, "ledger.md"), "utf8");
    return { merged, clean, idA, idB };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function selfTest() {
  const problems = [];

  // (A) Distinct parallel appends: union keeps BOTH rows, no conflict markers.
  const a = simulateUnionMerge({ sameId: false });
  if (!a.clean) problems.push("A: union merge conflicted on distinct parallel appends (expected clean)");
  if (a.merged.includes("<<<<<<<")) problems.push("A: conflict markers present after union merge");
  if (!a.merged.includes(a.idA) || !a.merged.includes(a.idB)) {
    problems.push("A: union merge dropped a row (both parallel appends must survive)");
  }

  // (B)(i) Same-id parallel appends: union still merges clean, and the result
  //        now contains a DUPLICATE id — the one bad merge union can produce.
  const b = simulateUnionMerge({ sameId: true });
  if (!b.clean) problems.push("B(i): same-id union unexpectedly conflicted (union should still combine lines)");
  const ids = extractIds(b.merged);
  const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (!dupes.includes("2026-08-21-shared")) {
    problems.push("B(i): expected a duplicate id in the same-id union result (the failure mode the lint catches)");
  }

  // (B)(ii) The safety-net lint's dup detection still fires. Run the real
  //         check-decision-guards self-test (its ok2/ok7 duplicate fixtures).
  try {
    execFileSync("node", [path.join(ROOT, "scripts", "check-decision-guards.cjs"), "--self-test"], {
      stdio: "pipe",
    });
  } catch (e) {
    problems.push("B(ii): scripts/check-decision-guards.cjs --self-test failed — the dup-slug safety net is broken");
  }

  if (problems.length) {
    console.error("SELF-TEST FAILED");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(
    "self-test OK (A: union keeps both parallel rows, no conflict; " +
      "B(i): same-id union yields a duplicate id; B(ii): dup-slug lint still catches it)"
  );
  process.exit(0);
}

if (process.argv.includes("--self-test")) selfTest();

// Main mode: the .gitattributes union declaration must be present.
if (!fs.existsSync(GITATTRIBUTES)) {
  console.error(`FAIL  .gitattributes is missing — it must declare "${LEDGER_REL} merge=union".`);
  process.exit(1);
}
const attrs = fs.readFileSync(GITATTRIBUTES, "utf8");
if (!UNION_LINE_RE.test(attrs)) {
  console.error(
    `FAIL  .gitattributes does not declare the union merge driver for the ledger.\n` +
      `      Expected a line: ${LEDGER_REL} merge=union\n` +
      `      Without it, parallel ledger appends conflict on the table tail (Trailhead C1).`
  );
  process.exit(1);
}
console.log(`ledger-union-merge OK (${LEDGER_REL} merge=union declared in .gitattributes)`);
