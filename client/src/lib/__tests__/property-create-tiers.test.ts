/**
 * The property-create form offers the ENFORCED cancellation tiers, and sends the tier
 * (lane 2026-09-27-property-cancel-tier).
 *
 * T1 no stay window is typed on the form — its labels are generated from shared/cancellation-schedule.ts,
 * the table the refund math reads (the preset text it replaced promised 5 / 14 / 30 days, windows no
 * code enforces). T2 it sends `cancellationPolicyType` (a tier the server validates), never the old
 * free-text preset. T3 no tier is preselected.
 *
 * Run: npx tsx --test client/src/lib/__tests__/property-create-tiers.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(process.cwd(), "client/src/pages/provider/property-create.tsx"), "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("T1 no stay window is typed; the labels come from the shared schedule", () => {
  assert.doesNotMatch(code, /\d+\s*(days?|hours?|h)\s+before check-in/i, "a typed stay window");
  assert.match(code, /from "@shared\/cancellation-schedule"/);
  assert.match(code, /cancellationTierLabel\(p, "check-in"\)/);
});

test("T2 the form sends the tier, not free text", () => {
  assert.match(code, /cancellationPolicyType: propCancellation \|\| undefined/);
  assert.doesNotMatch(code, /cancellationPolicy: propCancellation/);
});

test("T3 no tier is preselected", () => {
  assert.match(code, /useState<CancellationPolicyType \| "">\(""\)/);
});
