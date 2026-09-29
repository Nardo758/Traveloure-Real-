#!/usr/bin/env node
/**
 * NUMBER THE LEDGER'S `R?` ROWS AT MERGE TIME (ledger `2026-09-29-r-number-at-merge`).
 *
 * Why: an R-number is a global convenience citation beside a row's date-slug id (ruling 25). When
 * two open PRs each take "the next free number" from main at authoring time, the second to merge
 * collides — three renumbers in two days (R203, R208, R209). A row authored as `**R? —` with
 * `numeric citation R?` cannot collide; this script gives it its number as the LAST step before
 * merge, after main has been brought in, so the number is taken from the ledger that is actually
 * about to land.
 *
 * Rules:
 *   · the next number is one past the highest CITED R-number (lane-local exempt rows are not
 *     cited and do not count), skipping any frozen numeric row id (ruling 25: never reused);
 *   · `R?` rows are numbered in FILE ORDER, heading and citation together on the same line;
 *   · a half-placeholder (one side `R?`, the other numbered) is refused, never guessed;
 *   · prose elsewhere is never rewritten — code cites ledger SLUGS, not R-numbers, so nothing
 *     outside the row needs the number.
 *
 * Last step before merge: run it, then `node scripts/check-decision-guards.cjs --require-assigned` and
 * check its EXIT CODE (never through a pipe that hides it), commit, and let CI re-run on that head.
 *
 * Usage:  node scripts/assign-r-numbers.cjs            # dry run: print the mapping
 *         node scripts/assign-r-numbers.cjs --write    # rewrite docs/DECISIONS.md
 *         node scripts/assign-r-numbers.cjs --self-test
 * Node built-ins only.
 */
const fs = require("fs");
const path = require("path");
const { lintRNumbers, rowCells, ROW_ID_PREFIX_RE } = require("./check-decision-guards.cjs");

const LEDGER = path.resolve(__dirname, "..", "docs", "DECISIONS.md");

/** Pure: ledger text → { text, assigned: [{id, n}], refused: [id] }. */
function assign(ledgerText) {
  const r = lintRNumbers(ledgerText);
  const frozen = new Set();
  for (const line of ledgerText.split("\n")) {
    const p = line.match(ROW_ID_PREFIX_RE);
    if (p && /^\d+$/.test(p[1])) frozen.add(Number(p[1]));
  }
  let next = Math.max(0, ...r.cited.keys()) + 1;
  const assigned = [];
  const refused = [];
  const lines = ledgerText.split("\n").map((line) => {
    const p = line.match(ROW_ID_PREFIX_RE);
    if (!p) return line;
    const cells = rowCells(line);
    const headQ = /^\*\*R\? —/.test(cells[3] ?? "");
    const citeQ = /^numeric citation R\?(?![\w])/.test(cells[cells.length - 1] ?? "");
    if (!headQ && !citeQ) return line;
    if (headQ !== citeQ) {
      refused.push(p[1]);
      return line;
    }
    while (frozen.has(next)) next++;
    const n = next++;
    assigned.push({ id: p[1], n });
    // The heading is the first "**R? —" (cells 0–2 are id, date and tag, which never carry it); the
    // citation is the LAST cell. Prose inside the row may quote the placeholder itself, so the
    // citation is rewritten only at the start of the last cell — never at its first occurrence.
    const at = line.lastIndexOf(cells[cells.length - 1]);
    const tail = line.slice(at).replace(/^numeric citation R\?(?![\w])/, `numeric citation R${n}`);
    return (line.slice(0, at).replace("**R? —", `**R${n} —`)) + tail;
  });
  return { text: lines.join("\n"), assigned, refused };
}

function selfTest() {
  const base = [
    "| 7 | 2026-01-01 | [advisory] | frozen | refs |",
    "| 2026-01-02-a | 2026-01-02 | [advisory] | **R5 — A.** | numeric citation R5 |",
    "| 2026-01-03-q1 | 2026-01-03 | [advisory] | **R? — Q1.** | numeric citation R?; refs |",
    "| 2026-01-04-q2 | 2026-01-04 | [advisory] | **R? — Q2.** | numeric citation R? |",
  ].join("\n");
  const a = assign(base);
  // A1: numbered one past the highest cited, in file order, skipping the frozen id 7.
  const ok1 = JSON.stringify(a.assigned) === JSON.stringify([{ id: "2026-01-03-q1", n: 6 }, { id: "2026-01-04-q2", n: 8 }]);
  // A2: the result lints clean with no unassigned rows left.
  const after = lintRNumbers(a.text, {});
  const ok2 = after.failures.length === 0 && after.unassigned.length === 0 && a.text.includes("**R8 — Q2.** | numeric citation R8 |");
  // A3: a half-placeholder is refused and left as it was.
  const half = assign("| 2026-01-05-h | 2026-01-05 | [advisory] | **R? — H.** | numeric citation R300 |");
  const ok3 = half.refused.length === 1 && half.assigned.length === 0 && half.text.includes("**R? — H.**");
  // A5: prose inside the row that quotes the placeholder is left alone; only the last cell moves.
  const prose = assign("| 2026-01-06-p | 2026-01-06 | [advisory] | **R? — P.** written as `**R? —` with `numeric citation R?` | numeric citation R?; refs |");
  const ok5 = prose.text === "| 2026-01-06-p | 2026-01-06 | [advisory] | **R1 — P.** written as `**R? —` with `numeric citation R?` | numeric citation R1; refs |"
    && lintRNumbers(prose.text, {}).failures.length === 0;
  // A4: idempotent — a second run assigns nothing.
  const ok4 = assign(a.text).assigned.length === 0;
  if (!(ok1 && ok2 && ok3 && ok4 && ok5)) {
    console.error("SELF-TEST FAILED", { ok1, ok2, ok3, ok4, ok5, assigned: a.assigned, failures: after.failures });
    process.exit(1);
  }
  console.log("self-test OK (next past highest cited, file order, frozen skipped, half-placeholder refused, quoted placeholder in prose untouched, idempotent)");
  process.exit(0);
}

if (process.argv.includes("--self-test")) selfTest();

const text = fs.readFileSync(LEDGER, "utf8");
const { text: out, assigned, refused } = assign(text);
for (const id of refused) console.error(`REFUSED ${id}: heading and citation disagree on R? — fix the row by hand.`);
for (const { id, n } of assigned) console.log(`R${n}  ${id}`);
if (!assigned.length && !refused.length) console.log("no R? rows to number");
if (refused.length) process.exit(1);
if (process.argv.includes("--write") && assigned.length) {
  fs.writeFileSync(LEDGER, out);
  console.log(`wrote ${assigned.length} number(s) to docs/DECISIONS.md`);
}
