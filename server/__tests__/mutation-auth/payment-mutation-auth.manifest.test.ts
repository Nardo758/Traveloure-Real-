/**
 * Task #1675 — inventory guard for the payment mutation authorization audit.
 *
 * This test intentionally does not claim HTTP authorization coverage.  It prevents silent scope
 * loss while the real User A/User B route harness is being built: every listed route must still be
 * present in its source file, and every unexercised row must say why it is unexercised.  It is safe
 * to run without a database or Stripe key and makes no network calls.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  knownAuthorizationReviewFindings,
  paymentMutationAuthorizationManifest,
} from "./payment-mutation-auth.manifest";

test("#1675 payment mutation audit manifest is complete, honest, and route-backed", async () => {
  assert.ok(paymentMutationAuthorizationManifest.length >= 30, "money-path inventory unexpectedly shrank");

  const seen = new Set<string>();
  for (const row of paymentMutationAuthorizationManifest) {
    const key = `${row.method} ${row.path}`;
    assert.ok(!seen.has(key), `duplicate inventory row: ${key}`);
    seen.add(key);
    assert.notEqual(row.reason.trim(), "", `${key} requires an evidence/untested reason`);
    if (row.state === "untested") {
      assert.match(row.reason, /untested/i, `${key} cannot masquerade as exercised coverage`);
    }

    const source = await readFile(row.source, "utf8");
    assert.ok(source.includes(row.declaration), `${key}: route declaration moved or was removed`);
  }

  assert.ok(
    knownAuthorizationReviewFindings.length > 0,
    "audit findings must remain explicit until a real-resource test resolves them",
  );
});