/**
 * Feed-composition gates (Discover Feed Composition Brief, Commit 2):
 *  - THE ENGINE'S RANKED ORDER IS PRESERVED — the layer places, it does not
 *    re-rank. This is the trust check one layer above the engine's dominance
 *    test: a revenue-over-relevance regression here would be invisible to it.
 *  - Cadence honored (~1 recommendation per N organic items; never dominates).
 *  - Wanted slots capped and spaced (no wall of "Apply" cards at the top).
 *  - Lead expert exactly once, near the top.
 *  - Injected cards never stacked adjacent.
 *
 * Run: npx tsx --test client/src/lib/__tests__/feed-composition.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import type { FeedItem } from "../feed-stream";
import {
  composeFeedStream,
  defaultIsRelated,
  DEFAULT_FEED_COMPOSITION_CONFIG,
  type FeedCompositionConfig,
  type FeedRecommendation,
} from "../feed-composition";

const organicItems = (n: number, placeType = "temple"): FeedItem[] =>
  Array.from({ length: n }, (_, i) => ({
    kind: "loose-gem" as const,
    id: `gem-${i}`,
    data: { id: `g${i}`, placeName: `Gem ${i}`, placeType },
  }));

// Engine output stand-in: ranked order is the array order (rank 1 first).
const rankedRecs = (n: number): FeedRecommendation[] =>
  Array.from({ length: n }, (_, i) => ({
    offeringId: `offering_${i}`,
    categoryKey: `category_${i}`,
    displayName: `Offering ${i}`,
    tagline: null,
  }));

const wantedSlotsPool = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `nb-${i}`, nbName: `Neighborhood ${i}`, offeringLabel: "Guide", offeringKey: "guide" }));

const cfg = (over: Partial<FeedCompositionConfig> = {}): FeedCompositionConfig => ({
  ...DEFAULT_FEED_COMPOSITION_CONFIG,
  ...over,
});

const recsOf = (stream: FeedItem[]) => stream.filter((i) => i.kind === "recommendation");
const kinds = (stream: FeedItem[]) => stream.map((i) => i.kind);

describe("engine ranked order is preserved (places, never re-ranks)", () => {
  it("recommendations appear in exactly the engine's order, no skips, across configs", () => {
    for (const organicN of [0, 3, 5, 10, 25, 40]) {
      for (const recN of [0, 1, 3, 5, 8]) {
        for (const cadence of [1, 3, 4, 7]) {
          const stream = composeFeedStream({
            organic: organicItems(organicN),
            recommendations: rankedRecs(recN),
            wantedSlots: wantedSlotsPool(4),
            leadExpert: { id: "x" },
            config: cfg({ recCadence: cadence }),
          });
          const placed = recsOf(stream).map((i) => i.data.candidate.offeringId);
          // Placed list must be the exact PREFIX of the engine's ranked list:
          // same order, no reordering, no skipping a higher-ranked item to
          // surface a lower-ranked (higher-revenue) one.
          assert.deepStrictEqual(
            placed,
            rankedRecs(recN).slice(0, placed.length).map((r) => r.offeringId),
            `order broken for organic=${organicN} recs=${recN} cadence=${cadence}`,
          );
        }
      }
    }
  });

  it("the related-content nudge shifts placement, never order", () => {
    // Photo gem early in the stream + a photographer as the engine's #2 pick:
    // the nudge must NOT let the photographer jump pick #1.
    const organic: FeedItem[] = [
      ...organicItems(2, "temple"),
      { kind: "loose-gem", id: "gem-photo", data: { id: "gp", placeName: "Viewpoint", placeType: "photography viewpoint" } },
      ...organicItems(10, "temple"),
    ];
    const recommendations: FeedRecommendation[] = [
      { offeringId: "top_pick", categoryKey: "cultural_experiences", displayName: "Tea Ceremony Host", tagline: null },
      { offeringId: "photo_pick", categoryKey: "photography", displayName: "Local Photographer", tagline: null },
    ];
    const stream = composeFeedStream({
      organic,
      recommendations,
      wantedSlots: [],
      leadExpert: null,
      config: cfg({ recCadence: 4 }),
      isRelated: defaultIsRelated,
    });
    const placed = recsOf(stream).map((i) => i.data.candidate.offeringId);
    assert.deepStrictEqual(placed, ["top_pick", "photo_pick"], "nudge reordered the engine's ranking");
  });
});

describe("cadence (injected content never dominates organic)", () => {
  it("places at most 1 recommendation per `recCadence` organic items, with >= cadence-1 organic between", () => {
    for (const cadence of [3, 4, 5]) {
      const stream = composeFeedStream({
        organic: organicItems(30),
        recommendations: rankedRecs(10),
        wantedSlots: [],
        leadExpert: null,
        config: cfg({ recCadence: cadence }),
      });
      const recCount = recsOf(stream).length;
      assert.ok(
        recCount <= Math.floor(30 / cadence),
        `cadence ${cadence}: ${recCount} recs for 30 organic items`,
      );
      // Spacing: count organic items between consecutive recommendations.
      let sinceRec = 0;
      let first = true;
      for (const item of stream) {
        if (item.kind === "recommendation") {
          if (!first) assert.ok(sinceRec >= cadence - 1, `recs only ${sinceRec} organic apart (cadence ${cadence})`);
          first = false;
          sinceRec = 0;
        } else {
          sinceRec++;
        }
      }
    }
  });

  it("drops leftover recommendations rather than cramming them", () => {
    const stream = composeFeedStream({
      organic: organicItems(4),
      recommendations: rankedRecs(8),
      wantedSlots: [],
      leadExpert: null,
      config: cfg({ recCadence: 4 }),
    });
    assert.strictEqual(recsOf(stream).length, 1);
  });
});

describe("wanted slots capped and spaced (no wall of Apply cards)", () => {
  it("honors wantedSlotMax and wantedSlotSpacing; none stacked at the top", () => {
    const stream = composeFeedStream({
      organic: organicItems(30),
      recommendations: [],
      wantedSlots: wantedSlotsPool(6),
      leadExpert: null,
      config: cfg({ wantedSlotMax: 2, wantedSlotSpacing: 6 }),
    });
    const ks = kinds(stream);
    const wantedIdx = ks.map((k, i) => (k === "wanted-slot" ? i : -1)).filter((i) => i >= 0);
    assert.strictEqual(wantedIdx.length, 2, "cap not honored");
    assert.ok(wantedIdx[0] >= 6, `first wanted slot too close to the top (index ${wantedIdx[0]})`);
    const organicBetween = ks.slice(wantedIdx[0] + 1, wantedIdx[1]).filter((k) => k !== "recommendation" && k !== "wanted-slot" && k !== "lead-expert").length;
    assert.ok(organicBetween >= 6, `wanted slots only ${organicBetween} organic items apart`);
  });

  it("wantedSlotMax=0 disables recruitment slots entirely", () => {
    const stream = composeFeedStream({
      organic: organicItems(30),
      recommendations: [],
      wantedSlots: wantedSlotsPool(6),
      leadExpert: null,
      config: cfg({ wantedSlotMax: 0 }),
    });
    assert.strictEqual(kinds(stream).filter((k) => k === "wanted-slot").length, 0);
  });
});

describe("lead expert and stacking", () => {
  it("lead expert appears exactly once, near the top", () => {
    const stream = composeFeedStream({
      organic: organicItems(20),
      recommendations: rankedRecs(3),
      wantedSlots: wantedSlotsPool(3),
      leadExpert: { id: "lead" },
      config: cfg(),
    });
    const idx = kinds(stream)
      .map((k, i) => (k === "lead-expert" ? i : -1))
      .filter((i) => i >= 0);
    assert.deepStrictEqual(idx, [1], `lead expert at ${JSON.stringify(idx)}, expected once at index 1`);
  });

  it("no two injected items are ever adjacent", () => {
    const injected = new Set(["recommendation", "wanted-slot", "lead-expert"]);
    const stream = composeFeedStream({
      organic: organicItems(40),
      recommendations: rankedRecs(10),
      wantedSlots: wantedSlotsPool(6),
      leadExpert: { id: "lead" },
      config: cfg({ recCadence: 3, wantedSlotMax: 3, wantedSlotSpacing: 4 }),
    });
    const ks = kinds(stream);
    for (let i = 1; i < ks.length; i++) {
      assert.ok(
        !(injected.has(ks[i]) && injected.has(ks[i - 1])),
        `injected items stacked at ${i - 1}/${i}: ${ks[i - 1]}, ${ks[i]}`,
      );
    }
  });
});
