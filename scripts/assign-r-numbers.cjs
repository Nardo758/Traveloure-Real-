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
 * POST-MERGE STAMPING (CI-1 Phase 1, decision-maker rulings Oct 12, 2026; file-per-ruling,
 * ledger `2026-10-21-ledger-one-file`). PRs merge with their rows still `R?` in
 * `docs/decisions/pending/`. `.github/workflows/ledger-stamp.yml` runs `--stamp` on main, which:
 *   · numbers every `R?` file in file order (sequenced placeholders first, then pending by filename) and
 *     moves it to `docs/decisions/<next-seq>-<id>.md`, so a placeholder never stays ahead of a higher number;
 *   · appends `; merged <sha7>` to each one's citation cell — the first-parent commit that added the row;
 *   · replaces `R?` with the number on any CLAUDE.md line that names that row's slug.
 * It never touches the preamble. The workflow refuses a commit outside `docs/decisions/` and CLAUDE.md.
 *
 * Usage:  node scripts/assign-r-numbers.cjs            # dry run: print the mapping
 *         node scripts/assign-r-numbers.cjs --write    # number pending files in the working tree
 *         node scripts/assign-r-numbers.cjs --stamp    # post-merge: move last, number, merged sha, CLAUDE.md
 *         node scripts/assign-r-numbers.cjs --self-test
 *
 * A row lives in its own file (`docs/decisions/pending/<id>.md` until numbered, then
 * `docs/decisions/<seq>-<id>.md`). This script rewrites those files and never the preamble.
 * Node built-ins only.
 */
const fs = require("fs");
const path = require("path");
const { lintRNumbers, rowCells, ROW_ID_PREFIX_RE, isPlaceholderRow } = require("./check-decision-guards.cjs");
const { loadEntries, sequencedRel } = require("./ledger-files.cjs");

/** Pure: every `R?` row moved after the last ledger row, in file order. No `R?` row ⇒ text unchanged. */
function moveUnassignedToEnd(ledgerText) {
  const lines = ledgerText.split("\n");
  const moving = [];
  const kept = [];
  for (const line of lines) (isPlaceholderRow(line) ? moving : kept).push(line);
  if (!moving.length) return ledgerText;
  let last = -1;
  kept.forEach((line, i) => {
    if (ROW_ID_PREFIX_RE.test(line)) last = i;
  });
  kept.splice(last + 1, 0, ...moving);
  return kept.join("\n");
}

/**
 * Pure: ledger text → { text, assigned: [{id, n}], refused: [id] }.
 * opts.mergedSha(id) → a short sha or null; when it answers, `; merged <sha>` is appended to that row's citation cell.
 */
function assign(ledgerText, opts = {}) {
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
    let tail = line.slice(at).replace(/^numeric citation R\?(?![\w])/, `numeric citation R${n}`);
    const sha = opts.mergedSha ? opts.mergedSha(p[1]) : null;
    if (sha) tail = tail.replace(/\s*\|\s*$/, `; merged ${sha} |`);
    return (line.slice(0, at).replace("**R? —", `**R${n} —`)) + tail;
  });
  return { text: lines.join("\n"), assigned, refused };
}

/** Pure: replace `R?` with the assigned number on CLAUDE.md lines that name the row's slug. Other lines untouched. */
function stampClaudeMd(text, assigned) {
  return text
    .split("\n")
    .map((line) => {
      for (const { id, n } of assigned) {
        if (line.includes(id)) line = line.replace(/\bR\?(?![\w])/g, `R${n}`);
      }
      return line;
    })
    .join("\n");
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
  // A6 (CI-1): an R? row a concurrent merge left above a numbered row is moved to the end, then numbered; the result
  // is ascending and lints clean.
  const mixed = [
    "| 2026-01-02-a | 2026-01-02 | [advisory] | **R5 — A.** | numeric citation R5 |",
    "| 2026-01-03-late | 2026-01-03 | [advisory] | **R? — Late.** | numeric citation R?; refs |",
    "| 2026-01-04-b | 2026-01-04 | [advisory] | **R6 — B.** | numeric citation R6 |",
    "",
    "trailing prose",
  ].join("\n");
  const moved = assign(moveUnassignedToEnd(mixed), { mergedSha: (id) => (id === "2026-01-03-late" ? "abc1234" : null) });
  const movedLines = moved.text.split("\n");
  const ok6 = movedLines[2] === "| 2026-01-03-late | 2026-01-03 | [advisory] | **R7 — Late.** | numeric citation R7; refs; merged abc1234 |"
    && movedLines[3] === "" && movedLines[4] === "trailing prose"
    && lintRNumbers(moved.text, {}).failures.length === 0;
  // A7: no R? row ⇒ the move is a no-op and the merged-sha option writes nothing.
  const ok7 = moveUnassignedToEnd(a.text) === a.text && assign(a.text, { mergedSha: () => "fff0000" }).text === a.text;
  // A8: CLAUDE.md — R? becomes the number only on a line naming the slug.
  const md = stampClaudeMd("x (ledger `2026-01-03-late`, R?)\ny R? elsewhere", [{ id: "2026-01-03-late", n: 7 }]);
  const ok8 = md === "x (ledger `2026-01-03-late`, R7)\ny R? elsewhere";
  if (!(ok1 && ok2 && ok3 && ok4 && ok5 && ok6 && ok7 && ok8)) {
    console.error("SELF-TEST FAILED", { ok1, ok2, ok3, ok4, ok5, ok6, ok7, ok8, assigned: a.assigned, failures: after.failures, moved: moved.text });
    process.exit(1);
  }
  // A9: file-per-ruling. A pending R? becomes the next seq file; a second pass writes nothing.
  // A placeholder sitting between numbered files moves to a new seq at the end.
  const os = require("os");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-stamp-"));
  const seqDir = path.join(dir, "docs", "decisions");
  const pendDir = path.join(seqDir, "pending");
  fs.mkdirSync(pendDir, { recursive: true });
  const row = (id, head, cite) => `| ${id} | 2026-01-02 | [advisory] | ${head} | ${cite} |\n`;
  fs.writeFileSync(path.join(seqDir, "00001-2026-01-02-a.md"), row("2026-01-02-a", "**R5 — A.**", "numeric citation R5"));
  fs.writeFileSync(path.join(pendDir, "2026-01-03-late.md"), row("2026-01-03-late", "**R? — Late.**", "numeric citation R?"));
  fs.writeFileSync(path.join(dir, "docs", "DECISIONS.md"), "# preamble\n\nNo rows here.\n");
  const first = planStamp(loadEntries(dir), { mergedSha: () => "abc1234" });
  applyPlan(dir, first);
  const stamped = fs.readFileSync(path.join(seqDir, "00002-2026-01-03-late.md"), "utf8");
  const ok9 = first.refused.length === 0
    && first.writes.length === 1
    && first.writes[0].toRel === "docs/decisions/00002-2026-01-03-late.md"
    && stamped === row("2026-01-03-late", "**R6 — Late.**", "numeric citation R6; merged abc1234")
    && !fs.existsSync(path.join(pendDir, "2026-01-03-late.md"))
    && planStamp(loadEntries(dir)).writes.length === 0
    && fs.readFileSync(path.join(seqDir, "00001-2026-01-02-a.md"), "utf8") === row("2026-01-02-a", "**R5 — A.**", "numeric citation R5");
  fs.writeFileSync(path.join(seqDir, "00002-2026-01-03-mid.md"), row("2026-01-03-mid", "**R? — Mid.**", "numeric citation R?"));
  fs.writeFileSync(path.join(seqDir, "00003-2026-01-04-b.md"), row("2026-01-04-b", "**R6 — B.**", "numeric citation R6"));
  const movedFiles = planStamp(loadEntries(dir), { mergedSha: () => "def5678" });
  applyPlan(dir, movedFiles);
  const ok10 = movedFiles.writes.length === 1
    && movedFiles.writes[0].toRel === "docs/decisions/00004-2026-01-03-mid.md"
    && !fs.existsSync(path.join(seqDir, "00002-2026-01-03-mid.md"))
    && fs.readFileSync(path.join(seqDir, "00004-2026-01-03-mid.md"), "utf8").includes("**R7 — Mid.**")
    && fs.readFileSync(path.join(seqDir, "00004-2026-01-03-mid.md"), "utf8").includes("merged def5678")
    && fs.readFileSync(path.join(seqDir, "00003-2026-01-04-b.md"), "utf8").includes("**R6 — B.**");
  fs.rmSync(dir, { recursive: true, force: true });
  if (!(ok1 && ok2 && ok3 && ok4 && ok5 && ok6 && ok7 && ok8 && ok9 && ok10)) {
    console.error("SELF-TEST FAILED", { ok1, ok2, ok3, ok4, ok5, ok6, ok7, ok8, ok9, ok10, assigned: a.assigned, failures: after.failures, moved: moved.text, first, movedFiles });
    process.exit(1);
  }
  console.log("self-test OK (next past highest cited, file order, frozen skipped, half-placeholder refused, quoted placeholder in prose untouched, idempotent, R? moved last + merged sha, no-op without R?, CLAUDE.md slug lines only, pending file numbered into the next seq, mid-list placeholder moved to the end)");
  process.exit(0);
}

/**
 * Number every placeholder entry and move it to the next seq after the files that are already numbered.
 * Does not touch the disk. `opts.mergedSha(id)` is forwarded to `assign`.
 */
function planStamp(entries, opts = {}) {
  const bad = entries.filter((e) => !e.ok || !e.id);
  if (bad.length) {
    return { assigned: [], refused: [], writes: [], error: bad.map((e) => `${e.rel}: ${e.reason || "no row id"}`).join("; ") };
  }
  const placeholders = entries.filter((e) => isPlaceholderRow(e.line));
  const kept = entries.filter((e) => !isPlaceholderRow(e.line));
  const ordered = [...kept, ...placeholders];
  const joined = ordered.map((e) => e.line).join("\n");
  const result = assign(joined, opts);
  const outLines = ordered.length ? result.text.split("\n") : [];
  if (outLines.length !== ordered.length) {
    return { assigned: result.assigned, refused: result.refused, writes: [], error: `line count ${outLines.length} != ${ordered.length}` };
  }
  let seq = entries.reduce((m, e) => Math.max(m, e.seq || 0), 0);
  const refused = new Set(result.refused);
  const writes = [];
  ordered.forEach((e, i) => {
    if (!placeholders.includes(e) || refused.has(e.id)) return;
    seq += 1;
    writes.push({ fromRel: e.rel, toRel: sequencedRel(seq, e.id), line: outLines[i] });
  });
  return { assigned: result.assigned, refused: result.refused, writes, error: null };
}

function applyPlan(root, plan) {
  if (plan.error) throw new Error(plan.error);
  for (const w of plan.writes) {
    const to = path.join(root, w.toRel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    const body = w.line.endsWith("\n") ? w.line : `${w.line}\n`;
    fs.writeFileSync(to, body);
    const from = path.join(root, w.fromRel);
    if (path.resolve(from) !== path.resolve(to) && fs.existsSync(from)) fs.unlinkSync(from);
  }
}

/** The oldest first-parent commit that added the row under docs/decisions/, or null. */
function mergedShaFromGit(id) {
  const { execFileSync } = require("child_process");
  try {
    const out = execFileSync("git", ["log", "--first-parent", "--format=%h", "--abbrev=7", "-S", `| ${id} |`, "--", "docs/decisions"], {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
    }).trim().split("\n").filter(Boolean);
    return out.length ? out[out.length - 1] : null;
  } catch {
    return null;
  }
}

module.exports = { assign, moveUnassignedToEnd, stampClaudeMd, planStamp, applyPlan };
if (require.main !== module) return;

if (process.argv.includes("--self-test")) selfTest();

const root = path.resolve(__dirname, "..");
const stamp = process.argv.includes("--stamp");
const plan = planStamp(loadEntries(root), stamp ? { mergedSha: mergedShaFromGit } : {});
if (plan.error) {
  console.error(plan.error);
  process.exit(1);
}
for (const id of plan.refused) console.error(`REFUSED ${id}: heading and citation disagree on R? — fix the row by hand.`);
for (const { id, n } of plan.assigned) console.log(`R${n}  ${id}`);
if (!plan.assigned.length && !plan.refused.length) console.log("no R? rows to number");
if (plan.refused.length) process.exit(1);
if ((process.argv.includes("--write") || stamp) && plan.writes.length) {
  applyPlan(root, plan);
  console.log(`wrote ${plan.writes.length} number(s) under docs/decisions/`);
}
if (stamp && plan.assigned.length) {
  for (const { id } of plan.assigned) {
    if (!mergedShaFromGit(id)) console.error(`WARNING ${id}: no first-parent commit on this branch adds the row; no merged sha written.`);
  }
  const CLAUDE_MD = path.join(root, "CLAUDE.md");
  const md = fs.readFileSync(CLAUDE_MD, "utf8");
  const mdOut = stampClaudeMd(md, plan.assigned);
  if (mdOut !== md) {
    fs.writeFileSync(CLAUDE_MD, mdOut);
    console.log("stamped CLAUDE.md lines naming the numbered slugs");
  }
}
