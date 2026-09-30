/**
 * B6 (production smoke test Sep 30, 2026 — ledger `2026-09-30-b3-b6-draft-is-the-deliverable`):
 * A FREE DRAFT NEVER STARTS AN OPTIMIZER RUN. The draft handler used to launch
 * `generateOptimizedItineraries` in the background — three model calls per free draft with no
 * traveler action. Pinned at the source: the handler's body may not name the optimizer, create a
 * comparison, or pass one to the snapshot. Negative space: this reads ONE handler's text; a run
 * started through a helper it calls would need its own pin.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.resolve(import.meta.dirname, "..", "routes", "content.routes.ts"), "utf8");
const start = src.indexOf('router.post("/api/ai/generate-itinerary"');
const end = src.indexOf("\nrouter.", start + 10);
const handler = src.slice(start, end);

test("F1 the draft handler exists where this pin reads it", () => {
  assert.ok(start > 0 && handler.length > 1000, "generate-itinerary handler not found");
});
test("F2 the free draft starts no optimizer run", () => {
  assert.doesNotMatch(handler, /generateOptimizedItineraries\s*\(/);
  assert.doesNotMatch(handler, /tripOptimizationService\./);
});
test("F3 the free draft creates no comparison and returns no comparisonId", () => {
  assert.doesNotMatch(handler, /insertItineraryComparison\s*\(/);
  assert.doesNotMatch(handler, /\n\s+comparison:\s*\{/);
  assert.doesNotMatch(handler, /comparisonId:/);
});
