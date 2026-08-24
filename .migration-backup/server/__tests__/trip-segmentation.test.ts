/**
 * trip-segmentation.test.ts
 *
 * Pure unit tests for WP-C's `proposeSegmentation` (server/services/trip-segmentation.service.ts).
 * No DB, no network — the module under test has zero infra dependencies, so this is safe to run
 * with `tsx --test` anywhere (no disposable-DB guard required).
 *
 * Run with: npx tsx --test server/__tests__/trip-segmentation.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  proposeSegmentation,
  type SegmentationInput,
} from "../services/trip-segmentation.service";

function baseInput(overrides: Partial<SegmentationInput> = {}): SegmentationInput {
  return {
    items: [],
    externalItems: [],
    startDate: "2026-09-01",
    endDate: "2026-09-08",
    travelers: 2,
    ...overrides,
  };
}

describe("proposeSegmentation — single-city (safety property)", () => {
  it("one dominant city yields strategy=single, one segment, destination=modal city, covering every city-resolvable item", () => {
    const input = baseInput({
      items: [
        { id: "a1", city: "Kyoto", scheduledDate: "2026-09-01" },
        { id: "a2", city: "Kyoto", scheduledDate: "2026-09-02" },
        { id: "a3", city: "Kyoto", scheduledDate: "2026-09-03" },
        { id: "a4", city: "Kyoto", scheduledDate: "2026-09-04" },
      ],
      externalItems: [{ city: "Kyoto", date: "2026-09-05" }],
    });
    const result = proposeSegmentation(input);

    assert.equal(result.strategy, "single");
    assert.equal(result.segments.length, 1);
    assert.equal(result.segments[0].destination, "Kyoto");
    assert.deepEqual(result.segments[0].itemIds.sort(), ["a1", "a2", "a3", "a4"]);
    assert.deepEqual(result.segments[0].externalIndexes, [0]);
    assert.equal(result.confidence, "high");
    assert.equal(result.segments[0].unplaced.length, 0);
  });

  it("100% one city (trivial single-item case) is high confidence with no alternatives", () => {
    const input = baseInput({ items: [{ id: "x1", city: "Rome", scheduledDate: "2026-09-01" }] });
    const result = proposeSegmentation(input);
    assert.equal(result.strategy, "single");
    assert.equal(result.confidence, "high");
    assert.equal(result.alternatives.length, 0);
  });

  it("a dominant-but-not-overwhelming majority (75-84%) sweeps minority cities into the same single segment (matches today's resolve-trip behavior byte-for-byte for resolvable items), flagged low confidence with a multi_city alternative", () => {
    // 8 Kyoto (80%) + 2 Osaka (20%) — >= 75% dominance threshold, < 85% high-confidence threshold.
    const items = [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `k${i}`, city: "Kyoto", scheduledDate: "2026-09-01" })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `o${i}`, city: "Osaka", scheduledDate: "2026-09-02" })),
    ];
    const result = proposeSegmentation(baseInput({ items }));

    assert.equal(result.strategy, "single");
    assert.equal(result.confidence, "low");
    assert.equal(result.segments.length, 1);
    assert.equal(result.segments[0].destination, "Kyoto");
    // Every city-resolvable item — Kyoto AND Osaka — is covered by the one segment, exactly
    // matching today's resolve-trip behavior of attaching every cart item to the chosen trip.
    assert.equal(result.segments[0].itemIds.length, 10);
    assert.ok(result.alternatives.length >= 1, "low confidence must carry at least one alternative");
  });
});

describe("proposeSegmentation — 60/40 two-city split", () => {
  it("splits into two trips when shares are non-dominant and dates are cleanly separable", () => {
    // 6 Kyoto (60%), 4 Osaka (40%) — below the 75% single-dominance threshold.
    // Dates form clean contiguous blocks: Kyoto Sep 1-6, Osaka Sep 7-10 (no interleaving).
    const items = [
      { id: "k1", city: "Kyoto", scheduledDate: "2026-09-01" },
      { id: "k2", city: "Kyoto", scheduledDate: "2026-09-02" },
      { id: "k3", city: "Kyoto", scheduledDate: "2026-09-03" },
      { id: "k4", city: "Kyoto", scheduledDate: "2026-09-04" },
      { id: "k5", city: "Kyoto", scheduledDate: "2026-09-05" },
      { id: "k6", city: "Kyoto", scheduledDate: "2026-09-06" },
      { id: "o1", city: "Osaka", scheduledDate: "2026-09-07" },
      { id: "o2", city: "Osaka", scheduledDate: "2026-09-08" },
      { id: "o3", city: "Osaka", scheduledDate: "2026-09-09" },
      { id: "o4", city: "Osaka", scheduledDate: "2026-09-10" },
    ];
    const result = proposeSegmentation(
      baseInput({ items, startDate: "2026-09-01", endDate: "2026-09-10" }),
    );

    assert.equal(result.strategy, "split");
    assert.equal(result.segments.length, 2);

    const destinations = result.segments.map((s) => s.destination);
    assert.deepEqual(destinations, ["Kyoto", "Osaka"]); // chronological order

    const kyotoSeg = result.segments.find((s) => s.destination === "Kyoto")!;
    const osakaSeg = result.segments.find((s) => s.destination === "Osaka")!;
    assert.deepEqual(kyotoSeg.itemIds.sort(), ["k1", "k2", "k3", "k4", "k5", "k6"]);
    assert.deepEqual(osakaSeg.itemIds.sort(), ["o1", "o2", "o3", "o4"]);

    // Segment date ranges are contiguous and together span the full input range.
    assert.equal(kyotoSeg.startDate, "2026-09-01");
    assert.equal(osakaSeg.endDate, "2026-09-10");
    assert.equal(osakaSeg.startDate > kyotoSeg.endDate, true);

    // Every item is accounted for, nothing lost or duplicated across segments' itemIds.
    const allIds = result.segments.flatMap((s) => s.itemIds).sort();
    assert.deepEqual(allIds, items.map((i) => i.id).sort());
  });
});

describe("proposeSegmentation — interleaved dates force multi_city over split", () => {
  it("alternating city visits on the calendar cannot be cleanly split into two trips", () => {
    // Same 60/40 Kyoto/Osaka ratio as the split test, but the dates interleave: K,O,K,O,K,O...
    // — the traveler is bouncing between cities, not visiting them in two separate blocks.
    const items = [
      { id: "k1", city: "Kyoto", scheduledDate: "2026-09-01" },
      { id: "o1", city: "Osaka", scheduledDate: "2026-09-02" },
      { id: "k2", city: "Kyoto", scheduledDate: "2026-09-03" },
      { id: "o2", city: "Osaka", scheduledDate: "2026-09-04" },
      { id: "k3", city: "Kyoto", scheduledDate: "2026-09-05" },
      { id: "o3", city: "Osaka", scheduledDate: "2026-09-06" },
      { id: "k4", city: "Kyoto", scheduledDate: "2026-09-07" },
      { id: "o4", city: "Osaka", scheduledDate: "2026-09-08" },
      { id: "k5", city: "Kyoto", scheduledDate: "2026-09-09" },
      { id: "k6", city: "Kyoto", scheduledDate: "2026-09-10" },
    ];
    const result = proposeSegmentation(
      baseInput({ items, startDate: "2026-09-01", endDate: "2026-09-10" }),
    );

    assert.equal(result.strategy, "multi_city");
    assert.equal(result.segments.length, 1); // one trip, multiple stops
    assert.equal(result.segments[0].destination, "Kyoto + Osaka");
    assert.equal(result.segments[0].itemIds.length, 10);
    assert.notEqual(result.strategy, "split");
    assert.notEqual((result.strategy as string), "road_trip");
  });

  it("insufficient day-span for N clusters also forces multi_city (not split), even without interleaving", () => {
    // 2 clean, non-interleaved city blocks, but the whole trip is only 2 days — not enough for
    // two standalone MIN_DAYS_PER_SEGMENT=2-day trips (needs >= 4 days).
    const items = [
      { id: "k1", city: "Kyoto", scheduledDate: "2026-09-01" },
      { id: "k2", city: "Kyoto", scheduledDate: "2026-09-01" },
      { id: "o1", city: "Osaka", scheduledDate: "2026-09-02" },
      { id: "o2", city: "Osaka", scheduledDate: "2026-09-02" },
    ];
    const result = proposeSegmentation(
      baseInput({ items, startDate: "2026-09-01", endDate: "2026-09-02" }),
    );
    assert.equal(result.strategy, "multi_city");
    assert.equal(result.segments.length, 1);
  });
});

describe("proposeSegmentation — no road_trip in vocabulary", () => {
  it("never emits strategy=road_trip regardless of input shape", () => {
    const scenarios: SegmentationInput[] = [
      baseInput({ items: [{ id: "1", city: "Paris" }] }),
      baseInput({
        items: [
          { id: "1", city: "Paris", scheduledDate: "2026-09-01" },
          { id: "2", city: "Lyon", scheduledDate: "2026-09-05" },
        ],
        startDate: "2026-09-01",
        endDate: "2026-09-10",
      }),
      baseInput({ items: [{ id: "1", city: null }] }),
    ];
    for (const s of scenarios) {
      const result = proposeSegmentation(s);
      assert.ok(["single", "multi_city", "split"].includes(result.strategy));
      for (const alt of result.alternatives) {
        assert.ok(["single", "multi_city", "split"].includes(alt.strategy));
      }
    }
  });
});

describe("proposeSegmentation — all-null cities", () => {
  it("everything with no resolvable city is explicitly unplaced, never silently attached to a fabricated destination", () => {
    const input = baseInput({
      items: [
        { id: "n1", city: null },
        { id: "n2", city: null },
        { id: "n3", city: "" as any },
      ],
      externalItems: [{}, { date: "2026-09-01" }],
    });
    const result = proposeSegmentation(input);

    assert.equal(result.confidence, "low");
    assert.ok(result.alternatives.length >= 1, "low confidence must carry at least one alternative");
    assert.equal(result.segments.length, 1);
    assert.equal(result.segments[0].destination, "");
    assert.equal(result.segments[0].itemIds.length, 0);
    assert.equal(result.segments[0].externalIndexes.length, 0);
    assert.deepEqual(result.segments[0].unplaced.sort(), ["ext:0", "ext:1", "n1", "n2", "n3"]);
  });
});

describe("proposeSegmentation — empty input", () => {
  it("throws rather than fabricating a proposal for nothing (mirrors resolve-trip's 400 on an empty cart)", () => {
    assert.throws(() => proposeSegmentation(baseInput({ items: [], externalItems: [] })), /nothing to segment/);
  });
});

describe("proposeSegmentation — determinism and purity", () => {
  it("is deterministic: identical input yields identical output across repeated calls", () => {
    const input = baseInput({
      items: [
        { id: "a", city: "Kyoto", scheduledDate: "2026-09-01" },
        { id: "b", city: "Osaka", scheduledDate: "2026-09-05" },
        { id: "c", city: null },
      ],
      externalItems: [{ city: "Kyoto", date: "2026-09-02" }],
    });
    const r1 = proposeSegmentation(input);
    const r2 = proposeSegmentation(input);
    assert.deepEqual(r1, r2);
  });

  it("rejects malformed dates rather than guessing", () => {
    assert.throws(() =>
      proposeSegmentation(baseInput({ items: [{ id: "a", city: "Rome" }], startDate: "not-a-date" })),
    );
    assert.throws(() =>
      proposeSegmentation(baseInput({ items: [{ id: "a", city: "Rome" }], endDate: "09/01/2026" })),
    );
  });
});
