import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
const runner = require(resolve("scripts/check-automation-golden-baseline.cjs"));
const reporterUrl = pathToFileURL(resolve("scripts/verification/automation-baseline-reporter.mjs")).href;

test("provider-free environment drops all live transports and production URLs", () => {
  const env = runner.providerFreeEnvironment({
    PATH: "/bin", RESEND_API_KEY: "must-not-survive", STRIPE_SECRET_KEY: "must-not-survive",
    PROD_DATABASE_URL: "must-not-survive", SIGNUP_QA_TEST_INBOX: "must-not-survive",
    ITINERARY_OUTCOME_TEST_EMAIL: "must-not-survive", INTERNAL_JOB_SECRET: "must-not-survive",
  });
  assert.equal(env.NODE_ENV, "test");
  assert.match(env.STRIPE_SECRET_KEY, /^sk_test_/);
  assert.match(env.DATABASE_URL, /127\.0\.0\.1:1/);
  for (const key of ["RESEND_API_KEY", "PROD_DATABASE_URL", "SIGNUP_QA_TEST_INBOX",
    "ITINERARY_OUTCOME_TEST_EMAIL", "INTERNAL_JOB_SECRET"]) assert.equal(env[key], undefined);
});

test("retained suites precede registry / roster; no live verification suites run implicitly", () => {
  const stages = runner.stages();
  assert.equal(stages[0].name, "Itinerary outcome payload");
  assert.ok(stages.findIndex((stage: { name: string }) => stage.name === "Signup welcome") <
    stages.findIndex((stage: { name: string }) => stage.name === "Registry IDs"));
  assert.doesNotMatch(JSON.stringify(stages), /followups-live/);
});

test("randomized TAP parsing: skipped and TODO cases fail rather than certify", async () => {
  const { parseTap } = await import(reporterUrl);
  const nonce = randomUUID();
  const rows = parseTap(`ok 1 - ${nonce}\n  ---\n  duration_ms: 2.5\n  ...\nok 2 - missing # SKIP\nok 3 - future # TODO\nnot ok 4 - defect`);
  assert.deepEqual(rows.map((row: { status: string }) => row.status), ["PASS", "FAIL", "FAIL", "FAIL"]);
  assert.equal(rows[0].durationMs, 2.5);
});

test("five hostile reporter cases: empty, malformed, keys, recipients, token URLs", async () => {
  const { parseTap, parseVitest, redact } = await import(reporterUrl);
  assert.deepEqual(parseTap("nothing ran"), []);
  assert.deepEqual(parseVitest('{"numTotalTestSuites":BROKEN'), []);
  assert.equal(redact("sk_live_abcdefghijklmnop"), "[key-redacted]");
  assert.equal(redact(`${randomUUID()}@example.test`), "[address-redacted]");
  assert.equal(redact("https://example.test/reset?token=private"), "https://example.test/reset?token=[redacted]");
});

test("provider receipt UUIDs remain reportable without exposing credentials", async () => {
  const { redact } = await import(reporterUrl);
  const receipt = randomUUID();
  assert.equal(redact(receipt), receipt);
  assert.doesNotMatch(redact("postgresql://user:private@host/database"), /user:private/);
});

test("Vitest report survives retained cleanup output without certifying skipped assertions", async () => {
  const { parseVitest } = await import(reporterUrl);
  const document = { numTotalTestSuites: 1, testResults: [{ assertionResults: [
    { fullName: `${randomUUID()} quoted } brace`, status: "passed", duration: 3 },
    { fullName: "required pending case", status: "pending", duration: 0 },
  ] }] };
  const rows = parseVitest(`prefix\n${JSON.stringify(document)}\nISOLATED_SCHEMA_REMOVED=true\n`);
  assert.deepEqual(rows.map((row: { status: string }) => row.status), ["PASS", "FAIL"]);
  assert.deepEqual(parseVitest(JSON.stringify(document).slice(0, -1)), []);
  // Reviewed main already carries 78 guards; keep the exact inventory assertion.
  assert.equal(runner.guardCommands().length, 78);
  assert.ok(runner.guardCommands().some((args: string[]) => args[0] === "scripts/check-coverage-matrix.cjs"));
  assert.ok(runner.guardCommands().every((args: string[]) => args.every(arg => !arg.includes("&&"))));
});

test("HTTP transport bridge refuses preview, production, credentials and unisolated fixtures", async () => {
  const { isolatedHttpTarget } = await import(reporterUrl);
  const schema = "automation_msg_0123456789abcdef";
  assert.equal(isolatedHttpTarget("http://127.0.0.1:43123", schema).origin, "http://127.0.0.1:43123");
  for (const target of ["https://www.traveloure.com", "http://localhost:43123",
    "http://user:private@127.0.0.1:43123", "http://127.0.0.1:80", "http://127.0.0.1:43123/path"]) {
    assert.throws(() => isolatedHttpTarget(target, schema));
  }
  assert.throws(() => isolatedHttpTarget("http://127.0.0.1:43123", "public"));
});
