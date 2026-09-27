#!/usr/bin/env node
/**
 * Decision-ledger guard lint (ruling 26, sharpened by ruling 27).
 *
 * Parses docs/DECISIONS.md for `[guarded: name, name2]` tags and verifies every
 * named guard actually RUNS IN CI — i.e. the guard name appears in at least one
 * .github/workflows/*.yml file. A script not wired into CI is not a guard
 * (ruling 27: "script-only = MISSING").
 *
 * `deferred:<lane>` inside the tag exempts the guard with a WARNING — the named
 * lane owes the guard; the tag must be expired (removed) in the wave that lane
 * merges (ruling 21). Everything else missing from CI FAILS the lint.
 *
 * Also enforces append-only shape minimally: numeric ruling IDs must be unique.
 *
 * R-NUMBER RULES (ledger `2026-09-27-r-number-lint`, R155) — run over the WHOLE ledger, not only
 * new rows:
 *   (a) a row whose ruling column opens with the R heading `**R<n> —` must carry the citation
 *       column `numeric citation R<n>` as its LAST cell, naming the SAME <n>;
 *   (b) every `numeric citation R<n>` number appears on exactly ONE row;
 *   (c) no cited R-number reuses a FROZEN numeric row id (the 1–122 series, ruling 25 —
 *       "never reused"). The frozen set is read from the ledger's own numeric rows.
 *   NEGATIVE SPACE: a lane-LOCAL R series that predates the global numbering (the partner-demand
 *   lane's R1–R38) is not a global R-id; its rows are exempted BY NAME in
 *   LANE_LOCAL_R_SERIES_ROWS and printed on every run (§18d — an exemption is never silent). An
 *   R-number mentioned in prose (not as the row's opening heading) is not checked.
 *
 * Node built-ins only — no npm ci needed. Self-test: --self-test
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LEDGER = path.join(ROOT, "docs", "DECISIONS.md");
const WORKFLOW_DIR = path.join(ROOT, ".github", "workflows");

/**
 * Extract ONLY `run:` command text from workflow YAML (inline scalars and
 * `run: |` / `run: >` block scalars). A guard name appearing in a comment,
 * job name, or prose must NOT count as "in CI" — only an actual command does.
 */
function extractRunCommands(yamlText) {
  const out = [];
  const lines = yamlText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(?:-\s+)?run:\s*(.*)$/);
    if (!m) continue;
    const [, indent, rest] = m;
    const stripped = rest.replace(/#.*$/, "").trim();
    if (stripped === "|" || stripped === ">" || stripped === "|-" || stripped === ">-" || stripped === "") {
      // block scalar: consume subsequent lines more indented than `run:`
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === "") continue;
        const lead = lines[j].match(/^(\s*)/)[1];
        if (lead.length <= indent.length) break;
        out.push(lines[j].trim());
      }
    } else {
      out.push(stripped);
    }
  }
  return out.join("\n");
}

function collectWorkflowText(dir) {
  if (!fs.existsSync(dir)) return "";
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => extractRunCommands(fs.readFileSync(path.join(dir, f), "utf8")))
    .join("\n");
}

/**
 * A ledger row id. NEW rows use a DATE-SLUG key (`2026-08-16-ledger-ids`) because the old
 * "claim the next free number" rule made a collision structural: two lanes opened on the same
 * day both take the next integer, and the loser has to renumber AND chase every cross-reference
 * that named the number. Three such collisions happened in one night (rows 120/121/122). The
 * numeric series stays valid forever — those ids are cited across the briefs and must not move.
 */
const ID_ALT = String.raw`\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*|\d+|R-[A-Z]`;
const ROW_ID_RE = new RegExp(String.raw`^\|\s*(${ID_ALT})\s*\|\s*[\d-]+\s*\|\s*(\[[^\]]+\])\s*\|`);
const ROW_ID_PREFIX_RE = new RegExp(String.raw`^\|\s*(${ID_ALT})\s*\|`);

function parseLedger(text) {
  const entries = [];
  const ids = [];
  const malformed = [];
  for (const line of text.split("\n")) {
    // Table rows: | <id> | <date> | [tag] | ...
    // IDs come in three shapes: the DATE-SLUG key new rows use (2026-08-16-some-lane),
    // the frozen numeric series (1..122), and the closed Console Realign letters (R-A).
    // The slug alternative is listed FIRST so `\d+` cannot half-match a date-slug's year.
    const row = line.match(ROW_ID_RE);
    if (!row) {
      // A table-ish line mentioning guarded/advisory that failed to parse is a
      // malformed ledger row — reject loudly rather than silently skipping it.
      if (ROW_ID_PREFIX_RE.test(line) && /\[(guarded|advisory)/i.test(line) === false && /guarded|advisory/i.test(line)) {
        malformed.push(line.trim().slice(0, 120));
      }
      continue;
    }
    const [, id, tag] = row;
    if (!/^\[(guarded:\s*[^\]]+|advisory)\]$/i.test(tag)) {
      malformed.push(line.trim().slice(0, 120));
      continue;
    }
    ids.push(id);
    const guarded = tag.match(/^\[guarded:\s*([^\]]+)\]$/i);
    if (guarded) {
      const parts = guarded[1].split(",").map((s) => s.trim()).filter(Boolean);
      const deferred = parts.find((p) => p.toLowerCase().startsWith("deferred:"));
      const guards = parts.filter((p) => !p.toLowerCase().startsWith("deferred:"));
      entries.push({ id, guards, deferred: deferred ? deferred.slice("deferred:".length) : null });
    }
  }
  return { entries, ids, malformed };
}

/**
 * Rows whose opening `**R<n> —` heading belongs to a LANE-LOCAL series that predates the global
 * R numbering. They are exempt from rule (a) by name and printed on every run.
 */
const LANE_LOCAL_R_SERIES_ROWS = {
  "2026-08-18-supersession-stamp": "partner-demand lane R28",
  "2026-08-20-partner-demand-floor-class": "partner-demand lane R29",
  "2026-08-20-partner-demand-onepager-floor": "partner-demand lane R30",
  "2026-08-20-partner-demand-onepager-variant": "partner-demand lane R31",
  "2026-08-20-partner-demand-onepager-lifecycle": "partner-demand lane R32",
  "2026-08-20-partner-demand-onepager-spotlight": "partner-demand lane R33",
  "2026-08-20-partner-demand-onepager-trend-lock": "partner-demand lane R34",
  "2026-08-20-partner-demand-onepager-gap-pairing": "partner-demand lane R35",
  "2026-08-20-partner-demand-onepager-context-map": "partner-demand lane R36",
  "2026-08-20-partner-demand-onepager-map-position": "partner-demand lane R37",
  "2026-08-20-partner-demand-r38-provenance": "partner-demand lane R38",
};

/** The cells of one ledger table row (outer pipes stripped). */
function rowCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split(" | ").map((c) => c.trim());
}

function lintRNumbers(ledgerText, exempt = LANE_LOCAL_R_SERIES_ROWS) {
  const failures = [];
  const exempted = [];
  const frozen = new Set();
  const cited = new Map(); // n -> [row ids]
  for (const line of ledgerText.split("\n")) {
    const prefix = line.match(ROW_ID_PREFIX_RE);
    if (!prefix) continue;
    const id = prefix[1];
    if (/^\d+$/.test(id)) frozen.add(Number(id));
    const cells = rowCells(line);
    const body = cells[3] ?? "";
    const last = cells[cells.length - 1] ?? "";
    const head = body.match(/^\*\*R(\d+) —/);
    const cite = last.match(/^numeric citation R(\d+)\b/);
    if (head) {
      if (id in exempt) {
        exempted.push(`${id} (${exempt[id]})`);
      } else if (!cite) {
        failures.push(`Ruling ${id}: opens with R${head[1]} but its last column is not "numeric citation R${head[1]}" (R-rows require the citation column).`);
      } else if (cite[1] !== head[1]) {
        failures.push(`Ruling ${id}: heading says R${head[1]} but the citation column says R${cite[1]}.`);
      }
    }
    if (cite) {
      const n = Number(cite[1]);
      cited.set(n, [...(cited.get(n) ?? []), id]);
    }
  }
  for (const [n, ids] of cited) {
    if (ids.length > 1) failures.push(`Duplicate R-number R${n} cited by ${ids.length} rows: ${ids.join(", ")}.`);
    if (frozen.has(n)) failures.push(`R${n} (row ${ids.join(", ")}) reuses frozen numeric row id ${n} (ruling 25: never reused).`);
  }
  return { failures, exempted };
}

function lint({ ledgerText, workflowText }) {
  const failures = [];
  const warnings = [];
  const { entries, ids, malformed } = parseLedger(ledgerText);

  for (const m of malformed) failures.push(`Malformed ledger row (unparseable tag — fix, don't skip): ${m}`);

  // Every id shape, not just numeric: a duplicated date-slug is the same append-only violation,
  // and catching it HERE is the point of the scheme — CI fails instead of a human renumbering.
  const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (dupes.length) failures.push(`Duplicate ruling ids (append-only violated): ${[...new Set(dupes)].join(", ")}`);

  if (entries.length === 0) failures.push("No [guarded: ...] entries parsed from the ledger — tag format drifted?");

  const r = lintRNumbers(ledgerText);
  failures.push(...r.failures);
  for (const e of r.exempted) warnings.push(`Lane-local R series (exempt by name, not a global R-id): ${e}`);

  for (const e of entries) {
    for (const g of e.guards) {
      const inCI = workflowText.includes(g);
      if (inCI) continue;
      if (e.deferred) {
        warnings.push(`Ruling ${e.id}: guard "${g}" not in CI — DEFERRED to lane "${e.deferred}" (must expire when that lane merges).`);
      } else {
        failures.push(`Ruling ${e.id}: guard "${g}" is [guarded] but does not run in CI (no .github/workflows/*.yml mentions it). Script-only = MISSING (ruling 27).`);
      }
    }
  }
  return { failures, warnings };
}

function selfTest() {
  const ledgerText = [
    "| 1 | 2026-01-01 | [guarded: real-guard] | x | y |",
    "| 2 | 2026-01-01 | [guarded: ghost-guard] | x | y |",
    "| 3 | 2026-01-01 | [guarded: matrix-lint, deferred:some-lane] | x | y |",
    "| 4 | 2026-01-01 | [advisory] | x | y |",
    "| R-A | 2026-01-01 | [advisory] | x |",
    // The date-slug key new rows use — must parse exactly like the numeric series.
    "| 2026-01-01-some-lane | 2026-01-01 | [guarded: real-guard] | x | y |",
  ].join("\n");
  const workflowText = "run: node scripts/real-guard.cjs";
  const { failures, warnings } = lint({ ledgerText, workflowText });
  const ok =
    failures.length === 1 &&
    failures[0].includes("ghost-guard") &&
    warnings.length === 1 &&
    warnings[0].includes("matrix-lint");
  const dupe = lint({ ledgerText: ledgerText + "\n| 2 | 2026-01-01 | [advisory] | x | y |", workflowText });
  const ok2 = dupe.failures.some((f) => f.includes("Duplicate"));
  // §18d fixtures for the date-slug key (the whole point of the scheme).
  // (a) a slug row's [guarded] tag is linted like any other — a ghost guard on it still fails.
  const slugGhost = lint({
    ledgerText: "| 2026-01-01-slug-lane | 2026-01-01 | [guarded: ghost-guard] | x | y |",
    workflowText,
  });
  const ok6 = slugGhost.failures.some((f) => f.includes("2026-01-01-slug-lane") && f.includes("ghost-guard"));
  // (b) a DUPLICATED slug fails, exactly as a duplicated number does. This is the collision the
  //     scheme exists to make impossible-by-construction and CI-caught if it happens anyway.
  const slugDupe = lint({
    ledgerText: ledgerText + "\n| 2026-01-01-some-lane | 2026-01-01 | [advisory] | x | y |",
    workflowText,
  });
  const ok7 = slugDupe.failures.some((f) => f.includes("Duplicate") && f.includes("2026-01-01-some-lane"));
  // (c) a malformed slug row is REJECTED, not silently skipped — same posture as the numeric one.
  const slugBad = lint({
    ledgerText: ledgerText + "\n| 2026-01-01-bad-lane | 2026-01-01 | guarded: naked-tag | x | y |",
    workflowText,
  });
  const ok8 = slugBad.failures.some((f) => f.includes("Malformed"));
  // Negative: guard name only in a comment / job name must NOT count as in-CI.
  const yamlCommentOnly = [
    "jobs:",
    "  real-guard:",
    "    name: real-guard (prose mention of comment-guard)",
    "    steps:",
    "      # comment-guard is mentioned here but never run",
    "      - run: echo hello",
  ].join("\n");
  const runsOnly = require("module") && extractRunCommands(yamlCommentOnly);
  const ok3 = runsOnly.includes("echo hello") && !runsOnly.includes("comment-guard") && !runsOnly.includes("real-guard");
  // Block scalar extraction.
  const yamlBlock = ["      - run: |", "          node scripts/block-guard.cjs", "          echo done", "      - name: after"].join("\n");
  const ok4 = extractRunCommands(yamlBlock).includes("block-guard");
  // Malformed guarded row must FAIL, not be skipped.
  const bad = lint({
    ledgerText: ledgerText + "\n| 9 | 2026-01-01 | guarded: naked-tag | x | y |",
    workflowText,
  });
  const ok5 = bad.failures.some((f) => f.includes("Malformed"));
  // R-number rules (R155). (d) an R-row missing its citation column fails.
  const rNoCite = lintRNumbers("| 2026-01-01-r-lane | 2026-01-01 | [advisory] | **R200 — X.** body | some refs |", {});
  const ok9 = rNoCite.failures.some((f) => f.includes("R200") && f.includes("citation"));
  // (e) a mismatched heading/citation fails.
  const rMismatch = lintRNumbers("| 2026-01-01-r-lane | 2026-01-01 | [advisory] | **R200 — X.** body | numeric citation R201; refs |", {});
  const ok10 = rMismatch.failures.some((f) => f.includes("R200") && f.includes("R201"));
  // (f) the same R-number on two rows fails.
  const rDupe = lintRNumbers([
    "| 2026-01-01-a | 2026-01-01 | [advisory] | **R200 — A.** | numeric citation R200 |",
    "| 2026-01-02-b | 2026-01-02 | [advisory] | **R200 — B.** | numeric citation R200 |",
  ].join("\n"), {});
  const ok11 = rDupe.failures.some((f) => f.includes("Duplicate R-number R200"));
  // (g) an R-number reusing a frozen numeric row id fails.
  const rFrozen = lintRNumbers([
    "| 7 | 2026-01-01 | [advisory] | frozen row | refs |",
    "| 2026-01-02-b | 2026-01-02 | [advisory] | **R7 — B.** | numeric citation R7 |",
  ].join("\n"), {});
  const ok12 = rFrozen.failures.some((f) => f.includes("frozen numeric row id 7"));
  // (h) a well-formed R-row passes; an exempt lane-local row is reported, not failed.
  const rGood = lintRNumbers([
    "| 2026-01-01-a | 2026-01-01 | [advisory] | **R200 — A.** | numeric citation R200; refs |",
    "| 2026-01-02-local | 2026-01-02 | [advisory] | **R3 — LOCAL.** | lane refs |",
  ].join("\n"), { "2026-01-02-local": "some lane R3" });
  const ok13 = rGood.failures.length === 0 && rGood.exempted.length === 1;
  if (!ok || !ok2 || !ok3 || !ok4 || !ok5 || !ok6 || !ok7 || !ok8 || !ok9 || !ok10 || !ok11 || !ok12 || !ok13) {
    console.error("SELF-TEST FAILED", {
      ok, ok2, ok3, ok4, ok5, ok6, ok7, ok8, ok9, ok10, ok11, ok12, ok13,
      failures, warnings, dupe: dupe.failures, bad: bad.failures,
      slugGhost: slugGhost.failures, slugDupe: slugDupe.failures, slugBad: slugBad.failures,
    });
    process.exit(1);
  }
  console.log("self-test OK (comment/job-name negatives, block scalars, malformed rows, date-slug ids incl. duplicate + malformed, R-number citation/duplicate/frozen-reuse)");
  process.exit(0);
}

if (process.argv.includes("--self-test")) selfTest();

const ledgerText = fs.readFileSync(LEDGER, "utf8");
const workflowText = collectWorkflowText(WORKFLOW_DIR);
const { failures, warnings } = lint({ ledgerText, workflowText });

for (const w of warnings) console.warn(`WARN  ${w}`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL  ${f}`);
  process.exit(1);
}
const laneLocal = warnings.filter((w) => w.startsWith("Lane-local R series")).length;
console.log(`decision-guards lint OK (${warnings.length - laneLocal} deferred warning(s), ${laneLocal} lane-local R row(s) exempt by name)`);
