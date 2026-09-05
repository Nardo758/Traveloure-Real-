/**
 * OPTIMIZE PREVIEW ON THE SLIP — the heuristic, and the two entries that share it.
 * Ledger `2026-09-05-optimize-preview-on-slip`; CLAUDE.md Locked Decision 41 (d), §13, §14,
 * §18 rule 1.
 *
 * Pure + static: no DB, no server, no network. Run:
 *   npx tsx --test server/__tests__/optimize-preview-on-slip.test.ts
 *
 *   P — the HEURISTIC itself (`server/services/optimization-preview.service.ts`). Deterministic
 *       fixtures: a plan the heuristic can score, and the two shapes it must REFUSE rather than
 *       score. Also that the computed answer names no distance, minute or dollar — the class of
 *       claim this heuristic has no input for.
 *   E — the EXTRAPOLATION. The three legacy cart numbers must keep their exact pre-existing
 *       arithmetic, and must be reachable only through their own named function.
 *   S — the SHIPPED artifacts, because a pure rule a call site can reach past is not a rule:
 *       ONE heuristic with two callers, the trip entry reading the optimizer's own read-set, the
 *       gate, and the trip response carrying none of the extrapolated numbers.
 *
 * NEGATIVE SPACE (§18d): nothing here proves the endpoints refuse an anonymous caller or that
 * the slip renders the line — those are DB/browser questions. This file holds the arithmetic and
 * the wiring that a refactor is most likely to silently fork.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PREVIEW_MIN_ITEMS,
  PREVIEW_NO_ITEMS_REASON,
  PREVIEW_SINGLE_ITEM_REASON,
  computeOptimizationPreviewHeuristic,
  legacyPreviewExtrapolation,
  type OptimizationPreviewComputed,
  type PreviewHeuristicItem,
} from "../services/optimization-preview.service";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const routesSrc = readFileSync(join(ROOT, "server", "routes", "optimization.routes.ts"), "utf-8");
const serviceSrc = readFileSync(
  join(ROOT, "server", "services", "optimization-preview.service.ts"),
  "utf-8",
);
const slipSrc = readFileSync(
  join(ROOT, "client", "src", "components", "plancard", "SlipView.tsx"),
  "utf-8",
);
// LD 42 wave 1.5 (ledger 2026-09-05-slip-rail-regroup) moved the Optimize block — button, preview line
// and fee label — out of SlipView.tsx into the Build card in SlipRail.tsx. The slip SURFACE is both
// files; S7 pins the surface, not one file, so a later move between the two cannot fake a pass or a
// failure.
const railSrc = readFileSync(
  join(ROOT, "client", "src", "components", "plancard", "SlipRail.tsx"),
  "utf8",
);
const slipSurfaceSrc = slipSrc + "\n" + railSrc;
const cartSrc = readFileSync(join(ROOT, "client", "src", "pages", "cart.tsx"), "utf-8");

/** A plan with real room to improve: five items crammed onto one day, all the same kind. */
const LOPSIDED_PLAN: PreviewHeuristicItem[] = [
  { serviceType: "museum", duration: 120, price: 40, dayNumber: 1 },
  { serviceType: "museum", duration: 120, price: 40, dayNumber: 1 },
  { serviceType: "museum", duration: 120, price: 30, dayNumber: 1 },
  { serviceType: "museum", duration: 90, price: 30, dayNumber: 1 },
  { serviceType: "museum", duration: 90, price: 20, dayNumber: 1 },
];

/** A well-shaped plan: four kinds of thing spread across two days. */
const BALANCED_PLAN: PreviewHeuristicItem[] = [
  { serviceType: "hiking", duration: 180, price: 60, dayNumber: 1 },
  { serviceType: "dinner", duration: 90, price: 80, dayNumber: 1 },
  { serviceType: "spa", duration: 90, price: 120, dayNumber: 1 },
  { serviceType: "museum", duration: 120, price: 25, dayNumber: 2 },
  { serviceType: "lunch", duration: 60, price: 35, dayNumber: 2 },
  { serviceType: "beach", duration: 150, price: 0, dayNumber: 2 },
];

function computed(items: PreviewHeuristicItem[]): OptimizationPreviewComputed {
  const result = computeOptimizationPreviewHeuristic(items);
  assert.equal(result.computable, true, "fixture was expected to be scorable");
  return result as OptimizationPreviewComputed;
}

// ── P — the heuristic ────────────────────────────────────────────────────────────────────────

test("P1: a lopsided plan scores, and names the dimension a run has the most room on", () => {
  const p = computed(LOPSIDED_PLAN);
  assert.equal(p.itemCount, 5);
  assert.equal(p.dayCount, 1, "day count is COUNTED from the items, never assumed");
  assert.ok(p.currentScore >= 0 && p.currentScore <= 100);
  assert.equal(p.improvementRoom, 100 - p.currentScore);
  assert.equal(p.dimensions.length, 4);
  // Weakest-first, and `weakest` is that first entry — one ordering, not two.
  const scores = p.dimensions.map((d) => d.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => a - b));
  assert.deepEqual(p.weakest, p.dimensions[0]);
  // Five same-kind items on one day: variety and balance are demonstrably poor.
  const byKey = Object.fromEntries(p.dimensions.map((d) => [d.key, d.score]));
  assert.ok(byKey.diversity < 50, `variety should be low, got ${byKey.diversity}`);
});

test("P2: a well-shaped plan scores HIGHER than the lopsided one — the number moves with the plan", () => {
  assert.ok(
    computed(BALANCED_PLAN).currentScore > computed(LOPSIDED_PLAN).currentScore,
    "a balanced plan must not score below a lopsided one",
  );
});

test("P3: the same items always yield the same answer (deterministic — no clock, no randomness)", () => {
  assert.deepEqual(
    computeOptimizationPreviewHeuristic(BALANCED_PLAN),
    computeOptimizationPreviewHeuristic(BALANCED_PLAN),
  );
});

test("P4: an EMPTY plan is refused with the heuristic's own reason, never a zero score", () => {
  const r = computeOptimizationPreviewHeuristic([]);
  assert.equal(r.computable, false);
  assert.equal(r.computable === false && r.reason, PREVIEW_NO_ITEMS_REASON);
  assert.ok(!("currentScore" in r), "a refusal carries no score at all");
});

test("P5: a SINGLE item is refused — there is nothing to sequence it against", () => {
  assert.equal(PREVIEW_MIN_ITEMS, 2);
  const r = computeOptimizationPreviewHeuristic([LOPSIDED_PLAN[0]]);
  assert.equal(r.computable, false);
  assert.equal(r.computable === false && r.reason, PREVIEW_SINGLE_ITEM_REASON);
});

test("P6: `minItems: 1` is the cart's carry-over only — it scores one item, the default does not", () => {
  const cartShape = computeOptimizationPreviewHeuristic([LOPSIDED_PLAN[0]], 1, undefined, {
    minItems: 1,
  });
  assert.equal(cartShape.computable, true, "the cart's pre-existing contract is unchanged");
  assert.equal(computeOptimizationPreviewHeuristic([LOPSIDED_PLAN[0]]).computable, false);
});

test("P7: the computed answer contains no distance, duration-saved or money claim (§13)", () => {
  const keys = Object.keys(computed(BALANCED_PLAN));
  for (const forbidden of [
    "estimatedSavingsPct",
    "estimatedCostDelta",
    "estimatedScheduleTighteningPct",
    "transitMinutes",
    "minutesSaved",
    "distanceKm",
  ]) {
    assert.ok(!keys.includes(forbidden), `${forbidden} must not be part of the computed answer`);
  }
  // The heuristic has no coordinate input at all — proof by the item type it accepts.
  assert.ok(
    !/latitude|longitude|distance|transitMinutes/.test(serviceSrc.split("export interface PreviewHeuristicItem")[1]?.split("}")[0] ?? ""),
    "PreviewHeuristicItem must not carry a coordinate — the heuristic reads no geography",
  );
});

test("P8: an event type changes only the WEIGHTS, and both answers stay in range", () => {
  const plain = computed(BALANCED_PLAN);
  const wedding = computeOptimizationPreviewHeuristic(BALANCED_PLAN, 1, "wedding");
  assert.equal(wedding.computable, true);
  const w = wedding as OptimizationPreviewComputed;
  // The four sub-scores are weight-independent; only the combined score may move.
  assert.deepEqual(
    w.dimensions.map((d) => [d.key, d.score]).sort(),
    plain.dimensions.map((d) => [d.key, d.score]).sort(),
  );
  assert.ok(w.currentScore >= 0 && w.currentScore <= 100);
});

// ── E — the segregated extrapolation ─────────────────────────────────────────────────────────

test("E1: the three legacy numbers keep their exact pre-existing arithmetic", () => {
  const p = computed(LOPSIDED_PLAN);
  const legacy = legacyPreviewExtrapolation(p);
  const room = Math.max(0, 100 - p.metrics.overallScore);
  assert.equal(legacy.estimatedSavingsPct, Math.round(room * 0.25));
  assert.equal(
    legacy.estimatedScheduleTighteningPct,
    Math.round((p.metrics.paceScore < 70 ? 70 - p.metrics.paceScore : 0) * 0.3),
  );
  assert.equal(
    legacy.estimatedCostDelta,
    -Math.round(p.metrics.totalCost * (legacy.estimatedSavingsPct / 100)),
  );
});

test("E2: a plan with no priced item yields a ZERO cost delta, not a fabricated one", () => {
  const free = computed([
    { serviceType: "museum", duration: 90, dayNumber: 1 },
    { serviceType: "walking", duration: 60, dayNumber: 1 },
  ]);
  assert.equal(free.metrics.totalCost, 0);
  assert.equal(legacyPreviewExtrapolation(free).estimatedCostDelta, 0);
});

test("E3: the extrapolation is reachable ONLY through its own named function", () => {
  // It must not leak back into the computed shape any other way.
  assert.ok(
    serviceSrc.includes("export function legacyPreviewExtrapolation"),
    "the extrapolation keeps its own named home",
  );
  const computedBlock = serviceSrc.split("export function computeOptimizationPreviewHeuristic")[1]
    ?.split("export function legacyPreviewExtrapolation")[0] ?? "";
  assert.ok(
    !/estimatedSavingsPct|estimatedCostDelta/.test(computedBlock),
    "the scoring function must not compute the extrapolated numbers",
  );
});

// ── S — the shipped wiring ───────────────────────────────────────────────────────────────────

test("S1: ONE heuristic — the routes file never calls calculateItineraryMetrics itself", () => {
  // A prose MENTION is fine; a CALL is the fork. Match the invocation, not the word.
  assert.equal(
    (routesSrc.match(/calculateItineraryMetrics\(/g) ?? []).length,
    0,
    "the scoring call belongs to optimization-preview.service.ts alone (§18 rule 1)",
  );
  assert.equal(
    (serviceSrc.match(/calculateItineraryMetrics\(/g) ?? []).length,
    1,
    "exactly one invocation of the metrics function exists, in the service",
  );
});

test("S2: BOTH entries call the one heuristic — the cart's POST and the slip's trip-addressed GET", () => {
  assert.equal(
    (routesSrc.match(/computeOptimizationPreviewHeuristic\(/g) ?? []).length,
    2,
    "two callers, one implementation",
  );
  assert.ok(routesSrc.includes('router.post("/api/optimization-preview"'));
  assert.ok(routesSrc.includes('router.get("/api/optimization-preview"'));
  // …and the cart still reaches the heuristic through that same endpoint.
  assert.ok(cartSrc.includes('"/api/optimization-preview"'), "cart still posts to the one endpoint");
});

test("S3: the trip-addressed entry reads the optimizer's own read-set, not a client item list", () => {
  const getBlock =
    routesSrc.split('router.get("/api/optimization-preview"')[1]?.split("\nrouter.")[0] ?? "";
  assert.ok(getBlock.length > 0, "the GET handler exists");
  assert.ok(
    getBlock.includes("loadTripOptimizerInputs(tripId)"),
    "the same read-set the paid run uses (optimizer-baseline.service.ts)",
  );
  assert.ok(
    !/req\.body/.test(getBlock),
    "the slip sends an id and nothing else — no item list off the wire (§14 reads)",
  );
  assert.ok(
    routesSrc.includes('from "../services/optimizer-baseline.service"'),
    "the read-set is imported, never re-expressed",
  );
});

test("S4: the trip entry is authenticated, trip-gated, and takes its actor from the SESSION", () => {
  const getBlock =
    routesSrc.split('router.get("/api/optimization-preview"')[1]?.split("\nrouter.")[0] ?? "";
  assert.ok(routesSrc.includes('router.get("/api/optimization-preview", isAuthenticated'));
  assert.ok(getBlock.includes("authorizeTripLogistics(tripId, userId"));
  assert.ok(getBlock.includes("getUserId(req)"), "actor from the session, never the query string");
  assert.ok(
    !/req\.query\.(userId|ownerId)/.test(getBlock),
    "no owner id is read off the query string (§14 reads)",
  );
});

test("S5: the trip response emits none of the extrapolated numbers, and creates no charge", () => {
  const getBlock =
    routesSrc.split('router.get("/api/optimization-preview"')[1]?.split("\nrouter.")[0] ?? "";
  for (const forbidden of ["estimatedSavingsPct", "estimatedCostDelta", "legacyPreviewExtrapolation"]) {
    assert.ok(!getBlock.includes(forbidden), `${forbidden} must not reach the slip's response`);
  }
  for (const money of ["stripe", "paymentIntents", "getFee(", "feeCents"]) {
    assert.ok(!getBlock.includes(money), `a preview never touches ${money}`);
  }
});

test("S6: Trip Pass coverage on the fee endpoint is the SERVER's coversAction answer", () => {
  const feeBlock = routesSrc.split('router.get("/api/optimization-fee"')[1]?.split("\nrouter.")[0] ?? "";
  assert.ok(feeBlock.includes('coversAction(String(tripId), "optimizer_run")'));
  assert.ok(feeBlock.includes("coveredByTripPass,"), "the answer is returned to the client");
});

test("S7: the slip surface renders the preview and its fee, and reads no extrapolated number", () => {
  assert.ok(slipSurfaceSrc.includes('data-testid="slip-optimize-preview"'));
  assert.ok(slipSurfaceSrc.includes('data-testid="slip-optimize-preview-fee"'));
  assert.ok(slipSurfaceSrc.includes('queryKey: ["/api/optimization-preview"'));
  assert.ok(slipSurfaceSrc.includes('queryKey: ["/api/optimization-fee"'));
  assert.ok(
    slipSurfaceSrc.includes("describeOptimizationPreview") && slipSurfaceSrc.includes("formatOptimizationFeeLabel"),
    "the slip reads the shared client module rather than composing its own copy",
  );
  for (const forbidden of ["estimatedSavingsPct", "estimatedCostDelta", "estimatedScheduleTighteningPct"]) {
    assert.ok(!slipSurfaceSrc.includes(forbidden), `the slip must not render ${forbidden}`);
  }
  // Owner-only, exactly like the button the line sits beside. The Build card additionally gates on
  // the AI action being Optimize (LD 41(b): an empty slip offers Draft, and previews nothing).
  assert.ok(
    /const previewEnabled = isOwner && (aiAction === "optimize" && )?!optimizeDisabledReason;/.test(slipSurfaceSrc),
    "the preview is enabled only for the owner beside a live Optimize",
  );
});
