import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runH5DataInvariants } from "../runtime-health.service";

test("a failing invariant CLI is reported without terminating the web process", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nightly-qa-h5-"));
  const script = join(directory, "invariants.cjs");
  try {
    await writeFile(script, [
      'console.log("[invariants] checked against postgresql://user:secret@host/db");',
      'console.log("[VIOLATED] paid-service-bookings-have-payment-intent");',
      'console.log("14 invariants: 12 OK, 0 KNOWN-OPEN, 2 VIOLATED/ERROR");',
      "process.exit(1);",
    ].join("\n"));

    const result = await runH5DataInvariants(script);
    assert.equal(result.H5.pass, false);
    assert.match(result.H5.detail, /12 OK, 0 KNOWN-OPEN, 2 VIOLATED\/ERROR/);
    assert.match(result.H5.detail, /paid-service-bookings-have-payment-intent/);
    assert.doesNotMatch(result.H5.detail, /secret|postgresql/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a clean invariant CLI earns a pass", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nightly-qa-h5-"));
  const script = join(directory, "invariants.cjs");
  try {
    await writeFile(script, 'console.log("14 invariants: 14 OK, 0 KNOWN-OPEN, 0 VIOLATED/ERROR");');
    const result = await runH5DataInvariants(script);
    assert.equal(result.H5.pass, true);
    assert.match(result.H5.detail, /14 OK/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});