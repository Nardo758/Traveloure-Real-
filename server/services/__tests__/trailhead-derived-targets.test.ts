/**
 * R-T1-b / R-T1-d — slot-derived content-plan DETERMINISM test (pure, no DB).
 * Run: tsx --test server/services/__tests__/trailhead-derived-targets.test.ts
 *
 * Asserts the matrix × crosswalk → per-market plan derivation is pure + deterministic, that the
 * seven staged markets are emitted (INERT) as browsable-minimum config, and that the Kyoto diff
 * reports (never resolves) the wedge-vs-minimum divergence.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dmoContentTypeEnum } from "@shared/schema";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { TIER2_BROWSABLE_MINIMUM } from "../../config/trailhead.config";
import {
  deriveContentPlan,
  INERT_MARKET_CONTENT_PLANS,
  KYOTO_DERIVED_CONTENT_PLAN,
  diffKyotoPlan,
} from "../content-gap-taxonomy";

const CONTENT_TYPES = new Set<string>(dmoContentTypeEnum);
const KYOTO = OPERATING_MARKETS.find((m) => m.marketKey === "kyoto")!;
const EDINBURGH = OPERATING_MARKETS.find((m) => m.marketKey === "edinburgh")!;

test("determinism: same matrix input → identical plan across repeated derivations", () => {
  const a = deriveContentPlan(EDINBURGH);
  const b = deriveContentPlan(EDINBURGH);
  assert.deepEqual(a, b, "deriveContentPlan must be a pure function of its input");
});

test("determinism: two different markets derive the SAME shape (matrix is market-agnostic), differing only in labels", () => {
  const kyoto = deriveContentPlan(KYOTO);
  const edinburgh = deriveContentPlan(EDINBURGH);
  assert.deepEqual(
    kyoto.targets,
    edinburgh.targets,
    "the derived target shape is identical — the matrix is the same for every market",
  );
  assert.notEqual(kyoto.marketKey, edinburgh.marketKey);
  assert.notEqual(kyoto.city, edinburgh.city);
});

test("R-T1-b: derived plan is the browsable-minimum shape (~26), every content type real + config-targeted", () => {
  const plan = deriveContentPlan(EDINBURGH);
  const total = Object.values(TIER2_BROWSABLE_MINIMUM).reduce((s, n) => s + n, 0);
  assert.equal(plan.totalTarget, total, "totalTarget = Σ browsable-minimum config");
  assert.equal(plan.totalTarget, 26, "R-T1-b: ~26/market");
  for (const t of plan.targets) {
    assert.ok(CONTENT_TYPES.has(t.contentType), `${t.contentType} is a real dmoContentTypeEnum member`);
    assert.equal(t.target, TIER2_BROWSABLE_MINIMUM[t.contentType], "target comes from config, not a literal");
  }
});

test("R-T1-b: targets are ordered by derived demand weight (desc), deterministic tiebreak", () => {
  const plan = deriveContentPlan(EDINBURGH);
  for (let i = 1; i < plan.targets.length; i++) {
    const prev = plan.targets[i - 1];
    const cur = plan.targets[i];
    assert.ok(
      prev.demandWeight > cur.demandWeight ||
        (prev.demandWeight === cur.demandWeight && prev.contentType.localeCompare(cur.contentType) <= 0),
      `targets not in demand-desc order at ${i}: ${prev.contentType}(${prev.demandWeight}) then ${cur.contentType}(${cur.demandWeight})`,
    );
  }
});

test("§13 honesty: destination is a browsable-minimum type with ZERO matrix demand (surfaced, not faked)", () => {
  const plan = deriveContentPlan(EDINBURGH);
  assert.ok(plan.minimumWithoutDemand.includes("destination"), "destination has no template-service demand");
  const dest = plan.targets.find((t) => t.contentType === "destination")!;
  assert.equal(dest.demandWeight, 0);
  assert.deepEqual(dest.demandingCategories, []);
});

test("§13 honesty: transport is demanded by the matrix but deferred (outside the browsable minimum)", () => {
  const plan = deriveContentPlan(EDINBURGH);
  const transport = plan.demandOutsideMinimum.find((d) => d.contentType === "transport");
  assert.ok(transport, "private_transportation crosswalks to transport → demanded");
  assert.ok(transport!.demandWeight > 0);
  assert.ok(!plan.targets.some((t) => t.contentType === "transport"), "transport is not in the minimum profile");
});

test("R-T1-d: exactly the seven non-Kyoto markets are emitted as INERT config plans", () => {
  const keys = Object.keys(INERT_MARKET_CONTENT_PLANS).sort();
  const expected = OPERATING_MARKETS.filter((m) => m.marketKey !== "kyoto").map((m) => m.marketKey).sort();
  assert.deepEqual(keys, expected);
  assert.equal(keys.length, 7);
  assert.ok(!keys.includes("kyoto"), "Kyoto is excluded — it has its own hand-set plan");
});

test("R-T1-d: derivation touches no ignition flag — plans are pure data (frozen)", () => {
  assert.ok(Object.isFrozen(INERT_MARKET_CONTENT_PLANS));
});

test("T2.1.3: Kyoto derived plan diffs against the hand plan — hand plan runs DEEPER on every type", () => {
  const divergences = diffKyotoPlan();
  // Hand: attraction 15, venue 12, restaurant 12, event 10, destination 8 (=57).
  // Derived: browsable minimum (=26). Every shared type should diverge (hand deeper).
  const byType = new Map(divergences.map((d) => [d.contentType, d]));
  for (const ct of ["attraction", "venue", "restaurant", "event", "destination"]) {
    const d = byType.get(ct);
    assert.ok(d, `${ct} should diverge between hand and derived`);
    assert.ok(d!.handTarget! > d!.derivedTarget!, `${ct}: hand (${d!.handTarget}) deeper than derived (${d!.derivedTarget})`);
    assert.equal(d!.delta, d!.handTarget! - d!.derivedTarget!);
  }
});

test("T2.1.3: Kyoto DERIVED plan is the browsable minimum, NOT the hand plan (never applied to Kyoto)", () => {
  assert.equal(KYOTO_DERIVED_CONTENT_PLAN.totalTarget, 26);
  assert.equal(KYOTO_DERIVED_CONTENT_PLAN.marketKey, "kyoto");
});
