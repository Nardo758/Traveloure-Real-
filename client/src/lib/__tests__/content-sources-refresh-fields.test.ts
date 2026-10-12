/**
 * P0-e (ledger `2026-10-12-p0e-findings-and-gaps`): the official refresh (SS-1b) reads a source only when it
 * states both a refresh interval and a daily cost ceiling, and the server already accepted both — but the
 * admin form could set neither, so no source typed through it could ever be refreshed.
 *
 *   CS1 the form carries both fields and sends both on save; blank is sent as null (not stated)
 *
 * Run: npx tsx --test client/src/lib/__tests__/content-sources-refresh-fields.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../../pages/admin/content-sources.tsx", import.meta.url), "utf8");

test("CS1 the form carries the refresh interval and cost ceiling and sends both", () => {
  assert.match(page, /data-testid="input-source-refresh-days"/);
  assert.match(page, /data-testid="input-source-cost-ceiling"/);
  assert.match(page, /refreshIntervalDays: intOrNull\(draft\.refreshIntervalDays\)/);
  assert.match(page, /costCeilingCentsPerDay: intOrNull\(draft\.costCeilingCentsPerDay\)/);
  assert.match(page, /const intOrNull = \(s: string\) => \(s\.trim\(\) === "" \? null :/);
});
