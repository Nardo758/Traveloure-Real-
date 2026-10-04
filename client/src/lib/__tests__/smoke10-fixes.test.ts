/**
 * Smoke 10 (ledger `2026-10-04-smoke10-fixes`) — the client half.
 *   C4 S10-2 the comparison route resolves to a plan's versions board (Draft-only with no run); a
 *      trip-less cart comparison keeps the legacy screen
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("C4 S10-2: the comparison route resolves to a plan's versions board; a trip-less cart keeps the legacy screen", async () => {
  const { planVersionsTarget, versionsRunState } = await import("../plan-versions");
  assert.deepEqual(planVersionsTarget({ id: "c1", comparisonLoaded: true, comparisonFailed: false, comparison: { tripId: "t1", status: "generating" } }), { kind: "plan", tripId: "t1", comparisonStatus: "generating" });
  assert.deepEqual(planVersionsTarget({ id: "t9", comparisonLoaded: false, comparisonFailed: true, comparison: null }), { kind: "plan", tripId: "t9", comparisonStatus: null }, "a plan id with no run");
  assert.deepEqual(planVersionsTarget({ id: "c2", comparisonLoaded: true, comparisonFailed: false, comparison: { tripId: null } }), { kind: "tripless" });
  assert.equal(planVersionsTarget({ id: "x", comparisonLoaded: false, comparisonFailed: false, comparison: null }).kind, "loading");
  assert.equal(versionsRunState("pending_payment"), "awaiting_payment");
  assert.equal(versionsRunState("generating"), "building");
  assert.equal(versionsRunState("failed"), "failed");
  assert.equal(versionsRunState(null), "none");
  const app = read("client/src/App.tsx");
  assert.match(app, /const ItineraryComparisonPage = lazy\(\(\) => import\("@\/pages\/plan-versions"\)\)/);
  const page = read("client/src/pages/plan-versions.tsx");
  assert.match(page, /noRunCta=\{\s*<OptimizerLead/);
  const board = read("client/src/components/plancard/VersionsBoard.tsx");
  assert.match(board, /data-board-state="draft-only"/);
  // Draft-only: the map is mounted WITHOUT versions — no A/B/C toggle.
  const draftOnly = board.slice(board.indexOf('data-board-state="draft-only"'), board.indexOf("{noRunCta}"));
  assert.ok(!/versions=/.test(draftOnly));
});
