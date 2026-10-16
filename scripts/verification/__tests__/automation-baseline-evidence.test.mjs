import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { serializeEvidence, redact } from "../automation-baseline-reporter.mjs";

const require = createRequire(import.meta.url);
const runner = require("../../check-automation-golden-baseline.cjs");

test("structured evidence retains nested rows, timestamps, counts and types", () => {
  const document = {
    runId: "12345678-1234-1234-1234-123456789abc", checkedAt: "2026-10-13T00:00:00.000Z",
    isolated: false, passing: 1, failing: 1,
    results: [{ stage: "payload", startedAt: "2026-10-13T00:00:00.000Z", exitCode: 1,
      durationMs: 2.5, tests: [
        { name: 'quoted "name" } brace', status: "PASS", durationMs: 1, reason: null },
        { name: "refused", status: "FAIL", durationMs: 0, reason: "ISOLATED_TEST_DATABASE_AUTHORIZATION_REQUIRED" },
      ] }],
  };
  const text = serializeEvidence(document);
  assert.deepEqual(JSON.parse(text), document);
  assert.notEqual(text, redact(document));
  assert.doesNotMatch(text, /\[object Object\]/);
});

test("structured redaction removes synthetic sensitive text without losing structure", () => {
  const document = { password: "private", token: "private", secret: "private", apiKey: "private",
    tests: [{ name: "synthetic@example.test", reason: "Bearer private" }],
    url: "postgresql://user:private@host/database",
    reset: "https://example.test/reset?token=private",
    key: "sk_live_abcdefghijklmnop", count: 2, enabled: false, value: null };
  const text = serializeEvidence(document);
  assert.doesNotMatch(text, /private|synthetic@example\.test|sk_live_/);
  const clean = JSON.parse(text);
  assert.equal(clean.count, 2);
  assert.equal(clean.enabled, false);
  assert.equal(clean.value, null);
  assert.equal(clean.tests.length, 1);
  assert.equal(clean.password, "[redacted]");
});

test("non-JSON and cyclic evidence fails explicitly", () => {
  assert.throws(() => serializeEvidence(undefined));
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => serializeEvidence(cyclic));
});

test("all five DB stages and seven retained safety tests remain in the full runner", () => {
  const stages = runner.stages();
  assert.deepEqual(stages.filter(stage => stage.db).map(stage => stage.name), [
    "Generation authoritative-writer tests", "Three itinerary follow-up tests", "Signup welcome",
    "Booking confirmation duplicate and payment retry", "Booking durable delivery / retry",
  ]);
  assert.equal(stages.length, 13);
  assert.equal(stages.at(-1).tests, true);
  for (const stage of stages) {
    if (stage.config) assert.ok(fs.existsSync(stage.config));
    for (const file of stage.files ?? []) assert.ok(fs.existsSync(file));
  }
});

test("unsupported email mode refuses before any child or evidence directory", () => {
  // Own the scratch directory so a simultaneous legitimate golden run cannot
  // cause a false refusal-test failure by creating its own evidence directory.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "automation-refusal-"));
  try {
    const child = spawnSync(process.execPath, [
      path.resolve("scripts/check-automation-golden-baseline.cjs"), "--live-proof",
    ], { env: runner.providerFreeEnvironment(), encoding: "utf8", cwd: scratch });
    assert.equal(child.status, 1);
    assert.equal(child.stdout, "");
    assert.match(child.stderr, /Golden baseline infrastructure failed/);
    assert.deepEqual(fs.readdirSync(scratch), []);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
