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

function parseLedger(text) {
  const entries = [];
  const ids = [];
  const malformed = [];
  for (const line of text.split("\n")) {
    // Table rows: | <id> | <date> | [tag] | ...
    const row = line.match(/^\|\s*(\d+|R-[A-Z])\s*\|\s*[\d-]+\s*\|\s*(\[[^\]]+\])\s*\|/);
    if (!row) {
      // A table-ish line mentioning guarded/advisory that failed to parse is a
      // malformed ledger row — reject loudly rather than silently skipping it.
      if (/^\|\s*(\d+|R-[A-Z])\s*\|/.test(line) && /\[(guarded|advisory)/i.test(line) === false && /guarded|advisory/i.test(line)) {
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

function lint({ ledgerText, workflowText }) {
  const failures = [];
  const warnings = [];
  const { entries, ids, malformed } = parseLedger(ledgerText);

  for (const m of malformed) failures.push(`Malformed ledger row (unparseable tag — fix, don't skip): ${m}`);

  const numeric = ids.filter((i) => /^\d+$/.test(i));
  const dupes = numeric.filter((v, i) => numeric.indexOf(v) !== i);
  if (dupes.length) failures.push(`Duplicate numeric ruling ids (append-only violated): ${[...new Set(dupes)].join(", ")}`);

  if (entries.length === 0) failures.push("No [guarded: ...] entries parsed from the ledger — tag format drifted?");

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
  if (!ok || !ok2 || !ok3 || !ok4 || !ok5) {
    console.error("SELF-TEST FAILED", { ok, ok2, ok3, ok4, ok5, failures, warnings, dupe: dupe.failures, bad: bad.failures });
    process.exit(1);
  }
  console.log("self-test OK (incl. comment/job-name negatives, block scalars, malformed-row rejection)");
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
console.log(`decision-guards lint OK (${warnings.length} deferred warning(s))`);
