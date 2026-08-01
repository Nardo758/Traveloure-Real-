#!/usr/bin/env node
// scripts/journeys/run-all.mjs
//
// Runs every journey in the suite SEQUENTIALLY (never in parallel — see
// docs/EXECUTION_MAP.md L25 "Verification-integrity landmine": concurrent journeys sharing a
// port/DB round-robin silently) against the SAME booted app/DB, then prints one combined
// verdict table. This is the "Haiku re-runs it forever after" entry point per §4b — a single
// command that proves the whole Wave 1-5 surface at once.
//
// Usage (same flags every individual journey accepts — forwarded to each child):
//   node scripts/journeys/run-all.mjs \
//     --base-url http://localhost:5601 \
//     --db-url "postgresql://postgres@localhost:55442/expws?host=/var/tmp/expws-pg"
//
// `--only <name[,name...]>` restricts the run to a subset (comma-separated journey names, e.g.
// `--only plan-lifecycle,store-lifecycle`). `--out <dir>` is forwarded as each journey's own
// `--out` (a per-journey subdirectory is appended automatically so screenshots never collide).
//
// Exit code: 0 iff every journey exits 0. A single journey's non-zero exit does not stop the
// remaining journeys from running — the whole suite's verdicts always get printed (a real
// failure is more useful reported than hidden behind an early abort).

import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { argValue, hasFlag } from "./lib/journey-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const JOURNEYS = [
  { name: "expert-loop", file: "expert-loop.mjs" },
  { name: "plan-lifecycle", file: "plan-lifecycle.mjs" },
  { name: "workstation-build", file: "workstation-build.mjs" },
  { name: "store-lifecycle", file: "store-lifecycle.mjs" },
  { name: "traveler-comms", file: "traveler-comms.mjs" },
  { name: "partner-gate", file: "partner-gate.mjs" },
];

const only = argValue("--only", null);
const wanted = only ? new Set(only.split(",").map((s) => s.trim())) : null;
const journeysToRun = wanted ? JOURNEYS.filter((j) => wanted.has(j.name)) : JOURNEYS;

if (journeysToRun.length === 0) {
  console.error(`[run-all] --only matched nothing. Known journeys: ${JOURNEYS.map((j) => j.name).join(", ")}`);
  process.exit(1);
}

const baseUrl = argValue("--base-url", null);
const dbUrl = argValue("--db-url", null);
const outBase = argValue("--out", path.join(process.cwd(), "journey-out"));
const headed = hasFlag("--headed");
const skipExternal = hasFlag("--skip-external");

/** Extracts the JSON verdict object each journey prints between its ##JOURNEY_JSON_START##/
 *  ##JOURNEY_JSON_END## markers (journey-lib.mjs's printReport). Returns null if a journey
 *  crashed before ever reaching its report (fatal error, preflight failure) — run-all still
 *  reports that honestly rather than pretending a parse failure is zero steps. */
function extractVerdict(stdout) {
  const start = stdout.indexOf("##JOURNEY_JSON_START##");
  const end = stdout.indexOf("##JOURNEY_JSON_END##");
  if (start === -1 || end === -1 || end <= start) return null;
  const jsonText = stdout.slice(start + "##JOURNEY_JSON_START##".length, end).trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function countVerdicts(steps) {
  const c = { pass: 0, knownDefect: 0, external: 0, fail: 0 };
  for (const s of steps) {
    if (s.verdict === "PASS") c.pass += 1;
    else if (s.verdict === "KNOWN_DEFECT") c.knownDefect += 1;
    else if (s.verdict === "EXTERNAL") c.external += 1;
    else if (s.verdict === "FAIL") c.fail += 1;
  }
  return c;
}

console.log(`[run-all] running ${journeysToRun.length} journey(s) sequentially: ${journeysToRun.map((j) => j.name).join(", ")}\n`);

const results = [];

for (const journey of journeysToRun) {
  const journeyOut = path.join(outBase, journey.name);
  const args = [path.join(__dirname, journey.file)];
  if (baseUrl) args.push("--base-url", baseUrl);
  if (dbUrl) args.push("--db-url", dbUrl);
  args.push("--out", journeyOut);
  if (headed) args.push("--headed");
  if (skipExternal) args.push("--skip-external");

  console.log(`\n${"=".repeat(78)}`);
  console.log(`[run-all] >>> ${journey.name} (node ${args.join(" ")})`);
  console.log("=".repeat(78));

  const startedAt = Date.now();
  const proc = spawnSync(process.execPath, args, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  const durationMs = Date.now() - startedAt;

  // Stream the child's own output through — a human/model watching run-all live still sees
  // every journey's full per-step log, not just the final rollup.
  if (proc.stdout) process.stdout.write(proc.stdout);
  if (proc.stderr) process.stderr.write(proc.stderr);

  const verdict = extractVerdict(proc.stdout ?? "");
  if (verdict) {
    const counts = countVerdicts(verdict.steps ?? []);
    results.push({
      journey: journey.name, exitCode: proc.status, durationMs,
      steps: (verdict.steps ?? []).length, ...counts, crashed: false,
    });
  } else {
    results.push({
      journey: journey.name, exitCode: proc.status, durationMs,
      steps: 0, pass: 0, knownDefect: 0, external: 0, fail: 0, crashed: true,
    });
  }
}

// ── Combined verdict table ──
console.log(`\n${"=".repeat(78)}`);
console.log("[run-all] COMBINED VERDICT TABLE");
console.log("=".repeat(78));
console.log(
  "\nJourney".padEnd(20) + "Steps".padEnd(7) + "PASS".padEnd(6) + "KNOWN".padEnd(7) +
    "EXT".padEnd(5) + "FAIL".padEnd(6) + "Exit".padEnd(6) + "Time",
);
console.log("-".repeat(78));
for (const r of results) {
  const timeStr = `${(r.durationMs / 1000).toFixed(1)}s`;
  const label = r.crashed ? `${r.journey} (CRASHED — no report reached)` : r.journey;
  console.log(
    label.padEnd(20) + String(r.steps).padEnd(7) + String(r.pass).padEnd(6) + String(r.knownDefect).padEnd(7) +
      String(r.external).padEnd(5) + String(r.fail).padEnd(6) + String(r.exitCode).padEnd(6) + timeStr,
  );
}
console.log("-".repeat(78));

const totals = results.reduce(
  (acc, r) => ({
    steps: acc.steps + r.steps, pass: acc.pass + r.pass, knownDefect: acc.knownDefect + r.knownDefect,
    external: acc.external + r.external, fail: acc.fail + r.fail,
  }),
  { steps: 0, pass: 0, knownDefect: 0, external: 0, fail: 0 },
);
console.log(
  `TOTAL`.padEnd(20) + String(totals.steps).padEnd(7) + String(totals.pass).padEnd(6) +
    String(totals.knownDefect).padEnd(7) + String(totals.external).padEnd(5) + String(totals.fail).padEnd(6),
);

const anyFailure = results.some((r) => r.exitCode !== 0);
console.log(
  `\n${journeysToRun.length} journeys run. ${results.filter((r) => r.exitCode === 0).length} clean, ` +
    `${results.filter((r) => r.exitCode !== 0).length} with at least one FAIL${anyFailure ? " (or a crash)" : ""}.`,
);

process.exit(anyFailure ? 1 : 0);
