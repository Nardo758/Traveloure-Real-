/**
 * Part 10 development evidence only. No live transport or application imports.
 * Reuses the retained isolated owner; it never opts into --deliver-qa.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { redact, parseTap, parseVitest } from "./automation-baseline-reporter.mjs";

const directory = "reports/automation-part10-evidence";
const sendOnly = process.argv.includes("--isolated-send-gates");
fs.mkdirSync(directory, { recursive: true });
if (!/^[a-f0-9]{32}$/.test(process.env.MESSAGING_DEV_FINGERPRINT ?? "")) {
  throw new Error("Independently verified development fingerprint required");
}
const records = [];
async function run(name, args, additions = {}) {
  const start = new Date().toISOString();
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env: { ...process.env, ...additions }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", value => { output += value; });
    child.stderr.on("data", value => { output += value; });
    child.once("error", reject);
    child.once("exit", code => resolve({ code, output: redact(output) }));
  });
  fs.writeFileSync(path.join(directory, `${name}.log`), result.output);
  const tests = parseTap(result.output);
  const vitest = parseVitest(result.output);
  const record = { name, startedAt: start, finishedAt: new Date().toISOString(),
    exitCode: result.code, passing: tests.filter(t => t.status === "PASS").length,
    failing: tests.filter(t => t.status !== "PASS").length,
    vitestPassing: vitest.filter(t => t.status === "PASS").length,
    vitestFailing: vitest.filter(t => t.status !== "PASS").length };
  records.push(record);
  fs.writeFileSync(path.join(directory, sendOnly ? "commands-send-corrected.json" : "commands.json"), JSON.stringify(records, null, 2));
  console.log(JSON.stringify(record));
  return result;
}
const retained = ["server/__tests__/cart-email-state.test.ts",
  "server/__tests__/cart-email-state.db.test.ts",
  "server/routes/__tests__/commerce-email-sweep.db.test.ts",
  "server/routes/__tests__/cart-reminders.db.test.ts",
  "server/routes/__tests__/cart-item-changes.db.test.ts"];
const sendChecks = ["server/routes/__tests__/commerce-verify-at-send.db.test.ts",
  "server/routes/__tests__/commerce-send-addendum.db.test.ts",
  "server/routes/__tests__/commerce-scenario-matrix.db.test.ts",
  "server/routes/__tests__/commerce-payment-handler-replay.db.test.ts",
  "server/__tests__/commerce-provider-idempotency.test.ts",
  "server/routes/__tests__/commerce-qa-proof-isolation.test.ts"];
if (!sendOnly) {
const tsc = await run("typecheck", ["node_modules/typescript/bin/tsc", "--noEmit"]);
const normalize = text => text.split(/\r?\n/).filter(line => /error TS\d+:/.test(line))
  .map(line => line.replace(/\(\d+,\d+\)/, "(line,column)")).sort();
const previous = normalize(fs.readFileSync("reports/automation-part9-evidence/typecheck-corrected.log", "utf8"));
const current = normalize(tsc.output);
const additions = current.filter(line => !previous.includes(line));
const removals = previous.filter(line => !current.includes(line));
fs.writeFileSync(path.join(directory, "typecheck-comparison.json"), JSON.stringify({
  baseline: 117, diagnosticCount: current.length, additions, removals,
  exactRetainedSet: JSON.stringify(previous) === JSON.stringify(current),
  globallyClean: false,
}, null, 2));
await run("mutation-auth-regenerate", ["node_modules/tsx/dist/cli.mjs", "scripts/generate-mutation-auth-manifest.ts"]);
await run("mutation-auth-check", ["node_modules/tsx/dist/cli.mjs", "scripts/generate-mutation-auth-manifest.ts", "--check"]);
await run("mutation-auth-coverage-regenerate", ["node_modules/tsx/dist/cli.mjs", "scripts/generate-mutation-auth-coverage.ts"]);
await run("mutation-auth-coverage-check", ["node_modules/tsx/dist/cli.mjs", "scripts/generate-mutation-auth-coverage.ts", "--check"]);
await run("guard-batch", ["scripts/check-automation-golden-baseline.cjs", "--guards-only"]);
await run("golden", ["scripts/check-automation-golden-baseline.cjs", "--isolated-db"]);
if (current.length !== 117 || additions.length > 0) process.exitCode = 1;
}
for (const loop of [1, 2]) {
  if (!sendOnly) {
  await run(`cart-parts2-5-loop-${loop}`, ["scripts/verification/run-messaging-gate.mjs",
    "--isolated-db", ...retained]);
  }
  await run(`send-parts6-9-${sendOnly ? "corrected-" : ""}loop-${loop}`, ["scripts/verification/run-messaging-gate.mjs",
    "--isolated-db", ...sendChecks]);
  // The drain tests count every due obligation, not only their own fixture.
  // Give them a separate owned schema, never leftover handler-created alerts.
  await run(`provider-failure-${sendOnly ? "corrected-" : ""}loop-${loop}`,
    ["scripts/verification/run-messaging-gate.mjs", "--isolated-db",
      "server/routes/__tests__/commerce-provider-failure.db.test.ts"]);
}
if (!sendOnly) {
await run("sdk-provider-free", ["node_modules/vitest/vitest.mjs", "run",
  "--config", "vitest.commerce-send-email-sdk.config.ts", "--reporter=json"]);
await run("vendor-proposal-provider-free", ["node_modules/vitest/vitest.mjs", "run",
  "--config", "vitest.vendor-bulk-proposal.config.ts", "--reporter=json"]);
await run("qa-dry-proof", ["scripts/verification/run-commerce-qa-delivery-proof.mjs",
  "--isolated-db", "--dry-run"], { NODE_ENV: "development", COMMERCE_QA_DELIVERY_PROOF: "1" });
}
if (records.some(row => row.name !== "typecheck" && row.exitCode !== 0)) process.exitCode = 1;
