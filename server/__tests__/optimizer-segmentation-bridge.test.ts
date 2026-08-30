/**
 * optimizer-segmentation-bridge.test.ts
 *
 * Pure unit tests for the seam that wires WP-C's dark `proposeSegmentation` engine into the paid
 * optimize completion point (server/services/optimizer-segmentation-bridge.service.ts →
 * server/itinerary-optimizer.ts's `generateOptimizedItineraries`). No DB, no network — both
 * functions under test are pure, and the module's only runtime import is the equally pure
 * trip-segmentation.service.ts (the import of `ItineraryItem` from itinerary-optimizer.ts is
 * `import type`, elided at build time, so this file never touches server/db.ts).
 *
 * Run with: npx tsx --test server/__tests__/optimizer-segmentation-bridge.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSegmentationInput,
  computeSegmentationProposal,
} from "../services/optimizer-segmentation-bridge.service";
import type { ItineraryItem } from "../itinerary-optimizer";

describe("buildSegmentationInput — null-city mapping", () => {
  it("an item with no location maps to city: null (never guessed)", () => {
    const items: ItineraryItem[] = [
      { id: "i1", name: "Free-text stop", location: undefined, dayNumber: 1 },
      { id: "i2", name: "Blank location", location: "   ", dayNumber: 1 },
      { id: "i3", name: "Real city", location: "Kyoto", dayNumber: 1 },
    ];

    const input = buildSegmentationInput(items, "2026-09-01", "2026-09-05", 2);

    assert.equal(input.items.length, 3);
    assert.equal(input.items[0].city, null, "undefined location -> null city");
    assert.equal(input.items[1].city, null, "whitespace-only location -> null city");
    assert.equal(input.items[2].city, "Kyoto", "a real location is trimmed and passed through");
    assert.equal(input.externalItems.length, 0, "no external descriptors reach this pipeline");
  });

  it("feeding the built input to the real engine surfaces null-city items as `unplaced`, never silently attached to a resolvable city", () => {
    const items: ItineraryItem[] = [
      { id: "a1", name: "Kyoto temple", location: "Kyoto", dayNumber: 1 },
      { id: "a2", name: "Kyoto garden", location: "Kyoto", dayNumber: 2 },
      { id: "a3", name: "Kyoto dinner", location: "Kyoto", dayNumber: 3 },
      { id: "a4", name: "No city on this one", location: undefined, dayNumber: 4 },
    ];

    const proposal = computeSegmentationProposal(items, "2026-09-01", "2026-09-08", 2);

    assert.ok(proposal, "engine ran successfully over a real (non-empty) collection");
    assert.equal(proposal!.strategy, "single");
    assert.deepEqual(proposal!.segments[0].unplaced, ["a4"]);
    assert.ok(
      !proposal!.segments[0].itemIds.includes("a4"),
      "the unplaced item must never appear in a segment's placed itemIds",
    );
  });

  it("derives scheduledDate from startDate + (dayNumber - 1), honest arithmetic over real server values", () => {
    const items: ItineraryItem[] = [
      { id: "d1", name: "Day 1", location: "Rome", dayNumber: 1 },
      { id: "d2", name: "Day 3", location: "Rome", dayNumber: 3 },
      { id: "d3", name: "No day number", location: "Rome", dayNumber: undefined },
    ];

    const input = buildSegmentationInput(items, "2026-01-01", "2026-01-10", 1);

    assert.equal(input.items[0].scheduledDate, "2026-01-01");
    assert.equal(input.items[1].scheduledDate, "2026-01-03");
    assert.equal(input.items[2].scheduledDate, undefined, "no dayNumber -> no fabricated date");
  });
});

describe("computeSegmentationProposal — never fails the paid optimize path", () => {
  it("an empty collection makes the real engine throw internally, and the wrapper swallows it and returns null", () => {
    // proposeSegmentation itself throws on "nothing to segment" (no items, no externalItems) —
    // this exercises the ACTUAL engine throw path, not a mock, at the seam this module owns.
    const result = computeSegmentationProposal([], "2026-09-01", "2026-09-08", 2);
    assert.equal(result, null);
  });

  it("malformed dates (another real engine throw) also resolve to null, not an exception", () => {
    const items: ItineraryItem[] = [{ id: "x1", name: "Something", location: "Paris", dayNumber: 1 }];
    assert.doesNotThrow(() => {
      const result = computeSegmentationProposal(items, "not-a-date", "also-not-a-date", 1);
      assert.equal(result, null);
    });
  });

  it("a genuinely healthy input still returns a real proposal (the wrapper isn't swallowing success too)", () => {
    const items: ItineraryItem[] = [{ id: "y1", name: "Osaka stop", location: "Osaka", dayNumber: 1 }];
    const result = computeSegmentationProposal(items, "2026-09-01", "2026-09-03", 1);
    assert.ok(result);
    assert.equal(result!.strategy, "single");
    assert.equal(result!.segments[0].destination, "Osaka");
  });
});
