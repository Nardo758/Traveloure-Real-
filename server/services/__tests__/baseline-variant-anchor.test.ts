/**
 * Baseline "Your Plan" anchor columns come from the traveler's pin only.
 *
 * Run: npx tsx --test --test-force-exit server/services/__tests__/baseline-variant-anchor.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { baselineVariantAnchorFields } from "../baseline-variant-anchor";
import type { AnchorScore } from "../anchor-scoring";

const optimizerSrc = fs.readFileSync(path.resolve(process.cwd(), "server/itinerary-optimizer.ts"), "utf8");

function pin(overrides: Partial<AnchorScore> = {}): AnchorScore {
  return {
    anchorId: "custom:gion",
    type: "hotel",
    name: "Gion",
    lat: 35.0037,
    lng: 135.7788,
    locatedStops: 2,
    totalStops: 3,
    medianMeters: 1500.6,
    within15MinCount: 1,
    estMedianWalkMinutes: 18,
    ...overrides,
  };
}

describe("baselineVariantAnchorFields", () => {
  it("writes the traveler's kind for a catalog pin and custom only for a geocoded free-text pin", () => {
    const coords = {
      anchorName: "Gion",
      anchorLat: "35.0037",
      anchorLng: "135.7788",
      anchorMedianMeters: 1501,
    };
    assert.deepEqual(baselineVariantAnchorFields(pin({ anchorId: "hotel-1", type: "hotel" })), {
      anchorType: "hotel",
      ...coords,
    });
    assert.deepEqual(baselineVariantAnchorFields(pin({ anchorId: "hood-gion", type: "neighborhood", name: "Gion" })), {
      anchorType: "neighborhood",
      ...coords,
    });
    assert.deepEqual(baselineVariantAnchorFields(pin({ anchorId: "stop-1", type: "activity", name: "Gion" })), {
      anchorType: "activity",
      ...coords,
    });
    assert.deepEqual(baselineVariantAnchorFields(pin({ anchorId: "custom:gion", type: "neighborhood" })), {
      anchorType: "custom",
      ...coords,
    });
    assert.equal(baselineVariantAnchorFields(pin({ locatedStops: 1, medianMeters: 40 })).anchorMedianMeters, null);
    assert.equal(baselineVariantAnchorFields(pin({ locatedStops: 0, medianMeters: null })).anchorMedianMeters, null);
    assert.equal(baselineVariantAnchorFields(pin({ locatedStops: 2, medianMeters: 0 })).anchorMedianMeters, 0);
    assert.equal(baselineVariantAnchorFields(pin({ name: "n".repeat(250) })).anchorName?.length, 200);
  });

  it("writes all five null when there is no pin or the coordinates are not finite", () => {
    const empty = {
      anchorType: null,
      anchorName: null,
      anchorLat: null,
      anchorLng: null,
      anchorMedianMeters: null,
    };
    assert.deepEqual(baselineVariantAnchorFields(undefined), empty);
    assert.deepEqual(baselineVariantAnchorFields(null), empty);
    assert.deepEqual(baselineVariantAnchorFields(pin({ lat: Number.NaN })), empty);
  });

  it("the Your Plan insert reads the helper, and the AI insert still reads chosenAnchors", () => {
    const yourAt = optimizerSrc.indexOf('name: "Your Plan"');
    const totalAt = optimizerSrc.indexOf("const baselineTotal", yourAt);
    const your = optimizerSrc.slice(yourAt, totalAt);
    assert.match(your, /baselineVariantAnchorFields\(pinnedAnchor\)/);
    assert.doesNotMatch(your, /chosenAnchors/);

    const aiAt = optimizerSrc.indexOf('source: "ai_optimized"');
    const ai = optimizerSrc.slice(aiAt, aiAt + 900);
    assert.match(ai, /anchorType: chosenAnchors\[v\]\?\.type/);
    assert.doesNotMatch(ai, /baselineVariantAnchorFields/);

    const helperSrc = fs.readFileSync(
      path.resolve(process.cwd(), "server/services/baseline-variant-anchor.ts"),
      "utf8",
    );
    const helperFn = helperSrc.slice(helperSrc.indexOf("export function baselineVariantAnchorFields"));
    assert.doesNotMatch(helperFn, /chosenAnchors|pickAutoAnchors/);
  });
});
