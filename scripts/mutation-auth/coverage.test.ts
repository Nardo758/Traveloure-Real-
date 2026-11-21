import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { uniqueEndpointKeys } from "./endpoint-key";

test("coverage report has exact strict totals and a disposition for every unique manifest endpoint", () => {
  const root = process.cwd();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "generated/security/mutation-auth-manifest.json"), "utf8"));
  const coverage = JSON.parse(fs.readFileSync(path.join(root, "generated/security/mutation-auth-coverage.json"), "utf8"));
  // Derived from the manifest's own rows through the one key module — never a literal count
  // (ledger `2026-09-16-ci-manifest-pin-role-auth-mock`).
  const manifestKeys = uniqueEndpointKeys(manifest.mutations);
  assert.equal(manifestKeys.size, manifest.uniqueMethodNormalizedPathCount);
  assert.equal(coverage.endpoints.length, manifestKeys.size);
  assert.equal(new Set(coverage.endpoints.map((item: any) => item.key)).size, coverage.endpoints.length);
  assert.deepEqual(new Set(coverage.endpoints.map((item: any) => item.key)), manifestKeys);
  assert.ok(coverage.endpoints.every((item: any) => typeof item.tested === "boolean" && item.reason));
  assert.equal(coverage.totals.tested, coverage.endpoints.filter((item: any) => item.tested).length);
  assert.equal(coverage.totals.remaining, manifestKeys.size - coverage.totals.tested);
  assert.equal(coverage.endpoints.filter((item: any) => item.reason.startsWith("Explicitly excluded")).length, 29);
});

function generateWithEvidence(evidence: unknown, missing = false) {
  const root = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mutation-auth-coverage-"));
  const evidencePath = path.join(dir, "evidence.json");
  if (!missing) fs.writeFileSync(evidencePath, JSON.stringify(evidence));
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/generate-mutation-auth-coverage.ts"], {
    cwd: root,
    env: { ...process.env, MUTATION_AUTH_EVIDENCE_PATH: evidencePath, MUTATION_AUTH_COVERAGE_OUTPUT_DIR: dir },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(fs.readFileSync(path.join(dir, "mutation-auth-coverage.json"), "utf8"));
}

test("missing evidence marks every endpoint untested/not-run", () => {
  const coverage = generateWithEvidence({}, true);
  assert.equal(coverage.totals.tested, 0);
  assert.ok(coverage.endpoints.filter((item: any) => !item.tested).some((item: any) => item.reason.startsWith("Not run:")));
  assert.equal(coverage.evidence.state, "evidence artifact is missing");
});

test("stale manifest hash prevents all evidence promotion", () => {
  const coverage = generateWithEvidence({ schemaVersion: 1, manifestSha256: "stale", timestamp: "2025-01-01T00:00:00.000Z", suites: [] });
  assert.equal(coverage.totals.tested, 0);
  assert.equal(coverage.evidence.state, "evidence manifest SHA-256 is stale");
});

test("a skipped suite does not promote its endpoint keys", () => {
  const manifest = fs.readFileSync(path.join(process.cwd(), "generated/security/mutation-auth-manifest.json"));
  const manifestSha256 = crypto.createHash("sha256").update(manifest).digest("hex");
  const coverage = generateWithEvidence({
    schemaVersion: 1, manifestSha256, timestamp: "2025-01-01T00:00:00.000Z",
    suites: [{ id: "admin", context: "admin", passed: true, skipped: true, endpointKeys: ["POST /api/admin/catalog/ingest"] }],
  });
  assert.equal(coverage.totals.tested, 0);
  assert.equal(coverage.endpoints.find((item: any) => item.key === "POST /api/admin/catalog/ingest").tested, false);
});

test("ready-made authoring is promoted only by fresh author/non-author fixture evidence", () => {
  const manifest = fs.readFileSync(path.join(process.cwd(), "generated/security/mutation-auth-manifest.json"));
  const manifestSha256 = crypto.createHash("sha256").update(manifest).digest("hex");
  const endpoint = "POST /api/expert/ready-made/:id/submit";
  const coverage = generateWithEvidence({
    schemaVersion: 1,
    manifestSha256,
    timestamp: "2026-09-23T00:00:00.000Z",
    suites: [{
      id: "expert-provider-wrong-role",
      context: "wrong-role",
      passed: true,
      skipped: false,
      endpointKeys: [endpoint],
    }],
  });
  const row = coverage.endpoints.find((item: any) => item.key === endpoint);
  assert.equal(row.tested, true);
  assert.match(row.reason, /ready-made author\/non-author fixture evidence/);
});
/**
 * F4's gate: `--check` must FAIL when the evidence artifact's manifest hash differs from the manifest's own.
 *
 * The fixture is the same shape the generator itself writes, with a hash that is not this manifest's - the exact
 * condition the report used to describe in prose ("evidence manifest SHA-256 is stale") while the CI check passed.
 */
function runCheckWithEvidence(evidence: unknown) {
  const root = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mutation-auth-gate-"));
  const evidencePath = path.join(dir, "evidence.json");
  fs.writeFileSync(evidencePath, JSON.stringify(evidence));
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/generate-mutation-auth-coverage.ts", "--check"], {
    cwd: root,
    env: { ...process.env, MUTATION_AUTH_EVIDENCE_PATH: evidencePath, MUTATION_AUTH_COVERAGE_OUTPUT_DIR: dir },
    encoding: "utf8",
  });
  return result;
}

test("F4: a stale evidence hash FAILS the coverage check", () => {
  const result = runCheckWithEvidence({
    schemaVersion: 1,
    manifestSha256: "0".repeat(64),
    timestamp: "2025-01-01T00:00:00.000Z",
    suites: [{ id: "payments", context: "payments-resource-owner", passed: true, skipped: false, endpointKeys: [] }],
  });
  assert.notEqual(result.status, 0, "the check must not pass on stale evidence");
  assert.match(`${result.stderr}${result.stdout}`, /evidence manifest SHA-256 is stale/);
  assert.match(`${result.stderr}${result.stdout}`, /run:mutation-auth-live-audit/);
});

test("F4: a matching hash does not trip the gate (it can still fail on file freshness only)", () => {
  const manifest = fs.readFileSync(path.join(process.cwd(), "generated/security/mutation-auth-manifest.json"));
  const manifestSha256 = crypto.createHash("sha256").update(manifest).digest("hex");
  const result = runCheckWithEvidence({
    schemaVersion: 1,
    manifestSha256,
    timestamp: "2026-11-18T00:00:00.000Z",
    suites: [{ id: "payments", context: "payments-resource-owner", passed: true, skipped: false, endpointKeys: [] }],
  });
  const text = `${result.stderr}${result.stdout}`;
  assert.doesNotMatch(text, /evidence manifest SHA-256 is stale/, "a fresh hash must not be blamed");
});


/**
 * Q-30 (Leon, Nov 19 2026): the report is committed and byte-compared, so it must not carry an OS-separator path.
 * The committed file once said `generated\security\...` while CI produced `generated/security/...`, and the check
 * failed only on the runner. This is the fixture that fails if a Windows separator ever gets written again.
 */
test("F4/Q-30: the generated report carries no backslash path", () => {
  const manifest = fs.readFileSync(path.join(process.cwd(), "generated/security/mutation-auth-manifest.json"));
  const manifestSha256 = crypto.createHash("sha256").update(manifest).digest("hex");
  const coverage = generateWithEvidence({
    schemaVersion: 1,
    manifestSha256,
    timestamp: "2026-11-19T00:00:00.000Z",
    suites: [],
  });
  const json = JSON.stringify(coverage);
  assert.ok(!json.includes("\\"), "the report must not contain a backslash");
  assert.equal(coverage.evidence.path.split("/").length > 1, true, "the evidence path is forward-slashed");
  assert.doesNotMatch(coverage.evidence.path, /\\/);
});
