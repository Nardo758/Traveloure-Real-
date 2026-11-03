import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { serializeEvidence, redact } from "../automation-baseline-reporter.mjs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const runner = require("../../automation/golden-baseline.cjs");

// Exercise the exact pure planner without importing the CLI's database entry.
const ts = require("typescript");
const gateSource = fs.readFileSync("scripts/verification/run-messaging-gate.mjs", "utf8");
const gateAst = ts.createSourceFile("gate.mjs", gateSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const planner = gateAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "keyConstraintRenames");
assert.ok(planner);
const renameKeys = vm.runInNewContext(`(${planner.getText(gateAst)})`, {
  q: (name) => `"${name.replaceAll('"', '""')}"`,
});
const ownedSchema = "automation_msg_0123456789abcdef";
const key = (name, definition = "UNIQUE (email)") => ({ table_name: "users", name, kind: "u", definition });

test("copied unique keys regain source names in two collision-safe phases", () => {
  const sql = renameKeys([key("users_email_unique")], [key("users_email_key")], ownedSchema);
  assert.equal(sql.length, 2);
  assert.match(sql[0], /"users_email_key" TO "msg_key_0123456789abcdef_0"$/);
  assert.match(sql[1], /"msg_key_0123456789abcdef_0" TO "users_email_unique"$/);
  assert.ok(sql.every((statement) => statement.startsWith(`ALTER TABLE "${ownedSchema}"."users" RENAME CONSTRAINT `)));
});

test("key restoration fails closed on changed or extra uniqueness and unowned schema", () => {
  assert.throws(() => renameKeys([key("expected")], [key("copy", "UNIQUE (handle)")], ownedSchema), /differs/);
  assert.throws(() => renameKeys([], [key("extra")], ownedSchema), /Unexpected/);
  assert.throws(() => renameKeys([key("expected")], [], ownedSchema), /differs/);
  assert.throws(() => renameKeys([], [], "public"), /Owned/);
});

test("primary keys, duplicate definitions and quoted names remain one-to-one", () => {
  const source = [{ ...key('a"b', "PRIMARY KEY (id)"), kind: "p" }, key("first"), key("second")];
  const copied = [{ ...key("users_pkey", "PRIMARY KEY (id)"), kind: "p" }, key("users_email_key"), key("users_email_key1")];
  const sql = renameKeys(source, copied, ownedSchema);
  assert.equal(sql.length, 6);
  assert.match(sql[3], /TO "a""b"$/);
  assert.equal(sql.filter((s) => /TO "first"$/.test(s)).length, 1);
  assert.equal(sql.filter((s) => /TO "second"$/.test(s)).length, 1);
  assert.doesNotMatch(sql.join(";"), /DROP|ADD CONSTRAINT|DISABLE|public\./);
});

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
      path.resolve("scripts/automation/golden-baseline.cjs"), "--live-proof",
    ], { env: runner.providerFreeEnvironment(), encoding: "utf8", cwd: scratch });
    assert.equal(child.status, 1);
    assert.equal(child.stdout, "");
    assert.match(child.stderr, /Golden baseline infrastructure failed/);
    assert.deepEqual(fs.readdirSync(scratch), []);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("without DATABASE_URL the runner prints the skip notice, exits 0 and creates no files", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "automation-skip-"));
  try {
    const env = runner.providerFreeEnvironment();
    delete env.DATABASE_URL;
    const child = spawnSync(process.execPath, [path.resolve("scripts/automation/golden-baseline.cjs")],
      { env, encoding: "utf8", cwd: scratch });
    assert.equal(child.status, 0);
    assert.match(child.stdout, /Golden baseline skipped: DATABASE_URL is not set/);
    assert.deepEqual(fs.readdirSync(scratch), []);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
