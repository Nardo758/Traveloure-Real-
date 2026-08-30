import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("coverage report has exact strict totals and a disposition for every unique manifest endpoint", () => {
  const root = process.cwd();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "generated/security/mutation-auth-manifest.json"), "utf8"));
  const coverage = JSON.parse(fs.readFileSync(path.join(root, "generated/security/mutation-auth-coverage.json"), "utf8"));
  const manifestKeys = new Set(manifest.mutations.map((item: any) => `${item.method} ${item.effectivePath}`));
  assert.equal(manifestKeys.size, 546);
  assert.equal(coverage.endpoints.length, manifestKeys.size);
  assert.equal(new Set(coverage.endpoints.map((item: any) => item.key)).size, coverage.endpoints.length);
  assert.deepEqual(new Set(coverage.endpoints.map((item: any) => item.key)), manifestKeys);
  assert.ok(coverage.endpoints.every((item: any) => typeof item.tested === "boolean" && item.reason));
  assert.equal(coverage.totals.tested, coverage.endpoints.filter((item: any) => item.tested).length);
  assert.equal(coverage.totals.remaining, 546 - coverage.totals.tested);
  assert.equal(coverage.endpoints.filter((item: any) => item.reason.startsWith("Explicitly excluded")).length, 30);
});

function generateWithEvidence(evidence: unknown, missing = false) {
  const root = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mutation-auth-coverage-"));
  const evidencePath = path.join(dir, "evidence.json");
  if (!missing) fs.writeFileSync(evidencePath, JSON.stringify(evidence));
  const result = spawnSync("npx", ["tsx", "scripts/generate-mutation-auth-coverage.ts"], {
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