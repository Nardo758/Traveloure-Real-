#!/usr/bin/env node
/** New test infrastructure only; invokes retained suites without rewriting them. */
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { pathToFileURL } = require("node:url");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file.replaceAll("\\", "/")];
  });
}

function stages() {
  return [
    { name: "Itinerary outcome payload", files: ["server/services/__tests__/itinerary-outcome-email.test.ts"] },
    { name: "Itinerary follow-up payload", files: ["server/services/__tests__/itinerary-followup-email.test.ts"] },
    { name: "Generation authoritative-writer tests", db: true, config: "vitest.itinerary-outcomes.config.ts" },
    { name: "Three itinerary follow-up tests", db: true, config: "vitest.itinerary-followups.config.ts" },
    { name: "Signup welcome", db: true, files: ["server/__tests__/signup-welcome-outbox.db.test.ts"] },
    { name: "Verification and password-reset boundaries",
      files: ["server/automations/messaging/__tests__/producer-boundaries.test.ts"] },
    { name: "Booking confirmation duplicate and payment retry", db: true,
      files: ["server/__tests__/booking-confirm-payment-idempotency.test.ts"] },
    { name: "Booking durable delivery / retry", db: true,
      files: ["server/__tests__/booking-alert-outbox.db.test.ts"] },
    { name: "Outbox retry / leases / dedupe / cancellation",
      files: ["server/__tests__/email-outbox.test.ts"] },
    { name: "Retained registry contract suites",
      files: walk("server/automations").filter(file => /\/__tests__\/.*\.test\.ts$/.test(file)) },
    { name: "Registry IDs", command: ["node_modules/tsx/dist/cli.mjs", "scripts/check-automation-registry.ts"] },
    { name: "Cron roster", command: ["scripts/check-jobs-cron-roster.cjs"] },
    { name: "New harness safety tests",
      command: ["node_modules/tsx/dist/cli.mjs", "--test", "--test-force-exit",
        "scripts/verification/__tests__/automation-baseline-harness.test.ts"], tests: true },
  ];
}

function providerFreeEnvironment(source = process.env) {
  const env = {};
  for (const key of ["PATH", "HOME", "NIX_CFLAGS_COMPILE", "NIX_LDFLAGS", "NIX_PATH"]) {
    if (source[key]) env[key] = source[key];
  }
  Object.assign(env, { NODE_ENV: "test", ENVIRONMENT: "TEST",
    DATABASE_URL: "postgresql://skip:skip@127.0.0.1:1/skip",
    STRIPE_SECRET_KEY: "sk_test_automation_messaging_verification_only" });
  return env;
}

function guardCommands() {
  const workflow = fs.readFileSync(".github/workflows/build.yml", "utf8");
  const commands = [...workflow.matchAll(/^[ \t]*(?:run:[ \t]*)?node (scripts\/check-[\w-]+\.cjs)([^\r\n]*)$/gm)]
    .map(match => {
      // CI may append a success-only echo; execute the check, never a shell tail.
      const tail = match[2].trim().replace(/\s*&&\s*echo\s+"[^"]*"\s*$/, "");
      const args = tail.split(/\s+/).filter(Boolean);
      if (args.some(arg => !/^--[\w=-]+$/.test(arg))) throw new Error("Unrecognized CI guard arguments");
      return [match[1], ...args];
    });
  return [...new Map(commands.map(command => [command.join(" "), command])).values()];
}

async function runChild(args, env, timeoutMs = 240_000) {
  return new Promise(resolve => {
    let output = "";
    const child = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => { output += chunk; });
    const timer = timeoutMs > 0 ? setTimeout(() => {
      try { process.kill(-child.pid, "SIGKILL"); } catch {}
    }, timeoutMs) : null;
    child.once("error", () => { clearTimeout(timer); resolve({ code: 1, output: "CHILD_START_FAILURE" }); });
    child.once("close", code => { clearTimeout(timer); resolve({ code: code ?? 1, output }); });
  });
}

async function main() {
  const reporter = await import(pathToFileURL(path.resolve("scripts/verification/automation-baseline-reporter.mjs")).href);
  const isolated = process.argv.includes("--isolated-db");
  const loop = process.argv.find(arg => /^--loop=[12]$/.test(arg))?.split("=")[1] ?? "1";
  if (isolated && !/^[a-f0-9]{32}$/.test(process.env.MESSAGING_DEV_FINGERPRINT ?? "")) {
    throw new Error("Isolated DB requires an independently verified development fingerprint");
  }
  const runId = randomUUID();
  const directory = `reports/automation-part1-evidence/golden-${loop}-${runId}`;
  fs.mkdirSync(directory, { recursive: true });
  const results = [];
  const selected = process.argv.includes("--guards-only")
    ? guardCommands().map(command => ({ name: command.join(" "), command })) : stages();
  if (!selected.length) throw new Error("No baseline commands found");
  for (const [index, stage] of selected.entries()) {
    const startedAt = new Date().toISOString(), start = performance.now();
    let child;
    if (stage.db && !isolated) {
      child = { code: 1, output: "ISOLATED_TEST_DATABASE_AUTHORIZATION_REQUIRED: no public fixture writes attempted" };
    } else {
      let args, env;
      if (stage.command) {
        args = stage.command; env = providerFreeEnvironment();
      } else {
        const placeholders = stage.files ?? ["server/services/__tests__/itinerary-outcome-email.test.ts"];
        args = ["scripts/verification/run-messaging-gate.mjs", ...(stage.db ? ["--isolated-db"] : []), ...placeholders];
        env = stage.db ? { ...process.env, AUTOMATION_BASELINE_ADAPTER: "1",
          AUTOMATION_BASELINE_VITEST_CONFIG: stage.config ?? "" } : providerFreeEnvironment();
        if (stage.db) args.unshift("--import", path.resolve("scripts/verification/automation-baseline-reporter.mjs"));
      }
      // The retained DB owner enforces its child deadline and finally-cleanup.
      // An outer SIGKILL would prevent that owner's DROP SCHEMA cleanup.
      child = await runChild(args, env, stage.db ? 0 : 240_000);
    }
    const clean = reporter.redact(child.output);
    fs.writeFileSync(`${directory}/${String(index + 1).padStart(2, "0")}.log`, clean);
    const details = stage.config ? reporter.parseVitest(clean) : reporter.parseTap(clean);
    if (stage.command && !stage.tests && child.code === 0) {
      details.push({ name: stage.name, status: "PASS", durationMs: performance.now() - start, reason: null });
    }
    if (!details.length || (child.code !== 0 && !details.some(row => row.status === "FAIL"))) {
      details.push({ name: stage.name, status: "FAIL", durationMs: performance.now() - start,
        reason: stage.db && !isolated ? "ISOLATED_TEST_DATABASE_AUTHORIZATION_REQUIRED" : "NO_TESTS_OR_FRAMEWORK_FAILURE" });
    }
    results.push({ stage: stage.name, startedAt, exitCode: child.code, durationMs: performance.now() - start, tests: details });
  }
  const flat = results.flatMap(stage => stage.tests);
  const document = { runId, loop, checkedAt: new Date().toISOString(), isolated, results,
    passing: flat.filter(row => row.status === "PASS").length,
    failing: flat.filter(row => row.status === "FAIL").length };
  fs.writeFileSync(`${directory}/results.json`, JSON.stringify(document, null, 2));
  console.log("| Test | Pass / fail | Time (ms) |");
  console.log("|---|---|---:|");
  for (const row of flat) console.log(`| ${reporter.redact(row.name).replaceAll("|", "\\|")} | ${row.status}${row.reason ? ` — ${row.reason}` : ""} | ${row.durationMs.toFixed(1)} |`);
  console.log(`Evidence: ${directory}/results.json`);
  process.exitCode = document.failing > 0 || results.some(stage => stage.exitCode !== 0) ? 1 : 0;
}

module.exports = { providerFreeEnvironment, stages, guardCommands };
if (require.main === module) main().catch(() => {
  console.error("Golden baseline infrastructure failed; no raw exception printed.");
  process.exitCode = 1;
});
