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

function collectWorkflowText(dir) {
  if (!fs.existsSync(dir)) return "";
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
    .join("\n");
}

function parseLedger(text) {
  const entries = [];
  const ids = [];
  for (const line of text.split("\n")) {
    // Table rows: | <id> | <date> | [tag] | ...
    const row = line.match(/^\|\s*(\d+|R-[A-Z])\s*\|\s*[\d-]+\s*\|\s*(\[[^\]]+\])\s*\|/);
    if (!row) continue;
    const [, id, tag] = row;
    ids.push(id);
    const guarded = tag.match(/^\[guarded:\s*([^\]]+)\]$/i);
    if (guarded) {
      const parts = guarded[1].split(",").map((s) => s.trim()).filter(Boolean);
      const deferred = parts.find((p) => p.toLowerCase().startsWith("deferred:"));
      const guards = parts.filter((p) => !p.toLowerCase().startsWith("deferred:"));
      entries.push({ id, guards, deferred: deferred ? deferred.slice("deferred:".length) : null });
    }
  }
  return { entries, ids };
}

function lint({ ledgerText, workflowText }) {
  const failures = [];
  const warnings = [];
  const { entries, ids } = parseLedger(ledgerText);

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
  if (!ok || !ok2) {
    console.error("SELF-TEST FAILED", { failures, warnings, dupe: dupe.failures });
    process.exit(1);
  }
  console.log("self-test OK");
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
