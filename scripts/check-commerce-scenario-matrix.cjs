#!/usr/bin/env node
/** Test orchestration only. The retained harness owns database creation/cleanup. */
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const CONTROL = "/tmp/commerce-part8-scenario-control.json";
const TEST = "server/routes/__tests__/commerce-scenario-matrix.db.test.ts";
const OUTPUT = "reports/automation-part8-evidence";
const validStatus = new Set(["PASS", "FAIL", "BLOCKED"]);

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--isolated-db") || args.some(arg =>
    arg !== "--isolated-db" && !/^--loop-limit=[2-6]$/.test(arg))) {
    throw new Error("Use --isolated-db [--loop-limit=2..6]");
  }
  if (!/^[a-f0-9]{32}$/.test(process.env.MESSAGING_DEV_FINGERPRINT ?? "")) {
    throw new Error("An independently approved development fingerprint is required");
  }
  const limit = Number(args.find(arg => arg.startsWith("--loop-limit="))?.split("=")[1] ?? 6);
  const { redact } = await import(pathToFileURL(path.resolve(
    "scripts/verification/automation-baseline-reporter.mjs")).href);
  fs.mkdirSync(OUTPUT, { recursive: true });
  // Exclusive control file prevents two runners from consuming each other's loop.
  const fd = fs.openSync(CONTROL, "wx", 0o600);
  fs.closeSync(fd);
  const state = new Map();
  const runId = randomUUID();
  const loops = [];
  try {
    for (let loop = 1; loop <= limit; loop++) {
      const active = loop === 1 ? null : [...state.values()].filter(row => row.streak < 2).map(row => row.id);
      if (active && !active.length) break;
      const scenario = randomUUID();
      fs.writeFileSync(CONTROL, JSON.stringify({ loop, scenario, active }), { mode: 0o600 });
      const child = spawnSync(process.execPath, [
        "scripts/verification/run-messaging-gate.mjs", "--isolated-db", TEST,
      ], { env: process.env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
      if (child.error) throw child.error;
      const sanitized = redact((child.stdout ?? "") + (child.stderr ?? ""));
      fs.writeFileSync(path.join(OUTPUT, `${runId}-loop-${loop}.log`), sanitized);
      const lines = sanitized.split(/\r?\n/).filter(line => /^(?:# )?COMMERCE_PART8_MATRIX=/.test(line));
      if (lines.length !== 1) throw new Error(`Loop ${loop}: missing or ambiguous matrix evidence`);
      const evidence = JSON.parse(lines[0].slice(lines[0].indexOf("COMMERCE_PART8_MATRIX=") + "COMMERCE_PART8_MATRIX=".length));
      if (evidence.loop !== loop || evidence.scenario !== scenario ||
          evidence.realEmails !== 0 || evidence.actualExternalPaymentCalls !== 0 ||
          !Array.isArray(evidence.outcomes) || !evidence.outcomes.length ||
          !sanitized.includes("ISOLATED_SCHEMA_REMOVED=true")) {
        throw new Error(`Loop ${loop}: invalid evidence or incomplete database cleanup`);
      }
      const seen = new Set();
      for (const row of evidence.outcomes) {
        if (typeof row.id !== "string" || seen.has(row.id) || !validStatus.has(row.status) ||
            !/^[a-f0-9-]{36}$/.test(row.scenario)) throw new Error("Malformed matrix row");
        seen.add(row.id);
        const prior = state.get(row.id) ?? { id: row.id, label: row.label, scope: row.scope,
          attemptedLoops: 0, cleanLoops: 0, streak: 0, observations: [] };
        prior.attemptedLoops++;
        if (row.status === "PASS") { prior.cleanLoops++; prior.streak++; }
        else prior.streak = 0;
        prior.observations.push({ loop, ...row });
        state.set(row.id, prior);
      }
      if (active && (active.length !== seen.size || active.some(id => !seen.has(id)))) {
        throw new Error("Requested matrix rows disappeared from evidence");
      }
      const failures = evidence.outcomes.filter(row => row.status === "FAIL").length;
      if (child.status !== (failures ? 1 : 0)) throw new Error("Harness exit disagrees with row assertions");
      loops.push({ loop, scenario, file: `${runId}-loop-${loop}.json`,
        executed: seen.size, failed: failures,
        blocked: evidence.outcomes.filter(row => row.status === "BLOCKED").length });
      fs.writeFileSync(path.join(OUTPUT, `${runId}-loop-${loop}.json`), JSON.stringify(evidence, null, 2));
      console.log(JSON.stringify({ loop, executed: seen.size, failed: failures,
        blocked: loops.at(-1).blocked, closed: [...state.values()].filter(row =>
          row.streak >= 2 && row.scope !== "accepted-residual-marketing-only").length }));
    }
  } finally { fs.unlinkSync(CONTROL); }
  const rows = [...state.values()].map(row => ({ ...row, status: row.streak >= 2
    ? row.scope === "accepted-residual-marketing-only"
      ? "STRUCTURAL_RISK_ACCEPTED_RESIDUAL" : "CLOSED_READABLE_SCOPE"
    : row.attemptedLoops >= 6 ? "STRUCTURAL_RISK"
      : row.observations.at(-1).status === "BLOCKED" ? "BLOCKED" : "OPEN" }));
  const report = { runId, loops, rows, closed: rows.filter(row => row.status === "CLOSED_READABLE_SCOPE").length,
    structuralRisks: rows.filter(row => row.status.startsWith("STRUCTURAL_RISK")).length,
    acceptedMeasuredResiduals: rows.filter(row => row.status === "STRUCTURAL_RISK_ACCEPTED_RESIDUAL").length,
    realEmails: 0, actualExternalPaymentCalls: 0, releaseBlocked: true };
  fs.writeFileSync(path.join(OUTPUT, "matrix-results.json"), JSON.stringify(report, null, 2));
  let markdown = `# Part 8 scenario proof and fault testing\n\nRun: ${runId}\n\n` +
    "Development-only, provider-free, fresh randomized scenarios in disposable schemas. " +
    "The existing database harness owns isolation and cleanup. No runtime, payment writer, " +
    "checkout, production, feature flag, sender or migration registration changed.\n\n" +
    "**Scope:** closed payment rows prove recorded birth-signal behavior for named readable " +
    "descriptors, not execution of authoritative payment writers or all-rail coverage. " +
    "Fail-closed UNKNOWN tests do not close the all-rail obligation. Actual-handler rows are " +
    "separate from recorded-signal simulations. Must-have delivery holds are preserved.\n\n" +
    "The idle boundary is inclusive at 60 minutes / 1 day / 3 days. A 15-minute scheduler " +
    "normally sends the first reminder at 60–75 minutes; no time compression is used. " +
    "Price equality means no change; ±1 integer cent is the existing rule, not a new threshold.\n\n" +
    "## Every matrix row\n\n| ID / rule | Scope | Attempted loops | Clean loops | Current streak | Status |\n" +
    "|---|---|---:|---:|---:|---|\n";
  for (const row of rows) markdown += `| ${row.id} — ${row.label} | ${row.scope} | ` +
    `${row.attemptedLoops} | ${row.cleanLoops} | ${row.streak} | ${row.status} |\n`;
  markdown += "\n## Open evidence and structural risks\n\n";
  for (const row of rows.filter(row => row.streak < 2)) {
    const last = row.observations.at(-1);
    markdown += `- **${row.id}** (${row.status}): ${last.error ?? last.observation?.blocked ?? "not closed"}; ` +
      `attempted ${row.attemptedLoops}, clean ${row.cleanLoops}. Evidence: ` +
      `automation-part8-evidence/${runId}-loop-${last.loop}.json.\n`;
  }
  markdown += "\n## Evidence and release boundary\n\n" +
    "Every row includes fresh scenario IDs and observed outcomes in matrix-results.json and " +
    "the per-loop JSON files. Assertion failures reset the clean streak. Closed rows are not " +
    "rerun to inflate counts; only unclosed rows continue. Six unclosed attempts are explicitly " +
    "STRUCTURAL_RISK, not a successful gate. No real delivery receipt is claimed.\n\n" +
    "**NOT RELEASE-CERTIFIED.** All existing UNKNOWN payment rails, must-have ordering holds, " +
    "normal commerce-send blocks and accepted Part 7 deferred cleanup remain. No Part 9 " +
    "activation is authorized by this report. Golden regression/typecheck results are " +
    "recorded separately after the completed test-only changes.\n";
  fs.writeFileSync("reports/automation-part8-verification.md", markdown);
  console.log(JSON.stringify({ result: "reports/automation-part8-evidence/matrix-results.json",
    rows: rows.length, closed: report.closed, structuralRisks: report.structuralRisks }));
  if (rows.some(row => row.streak < 2)) process.exitCode = 1;
}

main().catch(error => { console.error(`Part 8 verification infrastructure failed: ${error.message}`); process.exitCode = 1; });
