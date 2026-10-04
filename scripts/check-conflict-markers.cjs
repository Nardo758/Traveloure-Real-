#!/usr/bin/env node
/**
 * check-conflict-markers.cjs — no tracked file carries a git merge-conflict marker (R298, ledger
 * `2026-10-04-maps-billing-audit`).
 *
 * Why: on Oct 4, 2026 a merge of a squash-merged base into a stacked branch was committed and pushed
 * with conflict markers still in four files. tsc and the tests caught it one push later; this gate
 * catches it in the guard batch, before anything has to compile.
 *
 * The predicate, per tracked text file (`git ls-files`; a file containing a NUL byte is binary and
 * skipped):
 *   - a line that STARTS with `<<<<<<<` or `>>>>>>>` followed by a space or the end of the line fails;
 *   - a line that is exactly `=======` fails ONLY in a file that also has one of those two markers —
 *     a bare `=======` line is legitimate on its own (a Markdown setext heading underline).
 *
 * STATED NEGATIVE SPACE (§18d): this is a TEXT gate over tracked files at the checked-out commit.
 * It does not see untracked files, a conflict resolved WRONGLY (markers removed, the wrong side
 * kept), diff3's `|||||||` base marker on its own, or a marker indented away from column 0. A file
 * that must quote a marker at column 0 cannot be committed; quote it indented or inside a string.
 *
 * `--self-test` runs committed inline fixtures and exits nonzero if the predicate stops catching a
 * conflict or starts flagging a setext heading.
 */
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const SIDE_RE = /^(<{7}|>{7})( |$)/;
const MID_RE = /^={7}$/;

/** Pure. The offending line numbers (1-based) of one file's text. */
function conflictLines(text) {
  const lines = text.split(/\r?\n/);
  const sides = [];
  const mids = [];
  lines.forEach((l, i) => {
    if (SIDE_RE.test(l)) sides.push(i + 1);
    else if (MID_RE.test(l)) mids.push(i + 1);
  });
  return sides.length ? [...sides, ...mids].sort((a, b) => a - b) : [];
}

function selfTest() {
  const M = (c) => c.repeat(7);
  const cases = [
    { name: "a full conflict", text: ["a", `${M("<")} HEAD`, "x", M("="), "y", `${M(">")} other`, "b"].join("\n"), want: [2, 4, 6] },
    { name: "a bare start marker", text: ["a", M("<"), "b"].join("\n"), want: [2] },
    { name: "an orphan end marker", text: ["a", `${M(">")} branch`].join("\n"), want: [2] },
    { name: "a CRLF conflict", text: ["a", `${M("<")} HEAD`, M("="), `${M(">")} x`].join("\r\n"), want: [2, 3, 4] },
    { name: "a setext heading", text: ["Title", M("="), "", "body"].join("\n"), want: [] },
    { name: "an indented marker", text: ["  " + M("<") + " HEAD", "  " + M(">") + " x"].join("\n"), want: [] },
    { name: "eight chevrons", text: [M("<") + "<", "x"].join("\n"), want: [] },
    { name: "a marker inside a string", text: [`const s = "${M("<")} HEAD";`].join("\n"), want: [] },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = conflictLines(c.text);
    const ok = JSON.stringify(got) === JSON.stringify(c.want);
    console.log(`${ok ? "ok  " : "FAIL"} ${c.name}: ${JSON.stringify(got)}`);
    if (!ok) failed++;
  }
  if (failed) {
    console.error(`conflict-marker self-test: ${failed} fixture(s) failed`);
    process.exit(1);
  }
  console.log(`conflict-marker self-test: ${cases.length}/${cases.length} fixtures pass`);
}

function main() {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: REPO, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
    .split("\0")
    .filter(Boolean);
  const offenders = [];
  for (const rel of files) {
    const abs = path.join(REPO, rel);
    let buf;
    try {
      const st = fs.lstatSync(abs);
      if (!st.isFile()) continue;
      buf = fs.readFileSync(abs);
    } catch {
      continue;
    }
    if (buf.includes(0)) continue;
    const hits = conflictLines(buf.toString("utf8"));
    if (hits.length) offenders.push(`${rel}: line(s) ${hits.join(", ")}`);
  }
  if (offenders.length) {
    console.error(`Conflict markers in ${offenders.length} tracked file(s):`);
    for (const o of offenders) console.error(`  ${o}`);
    process.exit(1);
  }
  console.log(`conflict-marker guard: ${files.length} tracked files, no conflict markers`);
}

if (process.argv.includes("--self-test")) selfTest();
else main();

module.exports = { conflictLines };
