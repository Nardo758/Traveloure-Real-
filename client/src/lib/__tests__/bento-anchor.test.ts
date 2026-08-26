import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FeedItem } from "../feed-stream";
import { bentoAnchorPriority, selectBentoAnchorIndex } from "../bento-anchor";

function expert(
  id: string,
  role: string,
  extra: Record<string, unknown> = {},
): FeedItem {
  return { kind: "expert", id, data: { id, role, ...extra } };
}

function tagged(item: FeedItem, order: number) {
  return { item, order, isAnchor: false };
}

describe("bento anchor priority (§2)", () => {
  const neighbourhood = { id: "gion", slug: "gion", name: "Gion" };

  it("prefers a neighbourhood-scoped local expert over city local and planner", () => {
    const entries = [
      tagged(expert("planner", "travel_expert"), 0),
      tagged(expert("city-local", "local_expert"), 1),
      tagged(expert("nb-local", "local_expert", { expertForm: { neighborhoods: ["gion"] } }), 2),
    ];

    assert.equal(selectBentoAnchorIndex(entries, neighbourhood, "Kyoto"), 2);
    assert.equal(bentoAnchorPriority(entries[2].item, neighbourhood, "Kyoto"), "neighborhood-local");
  });

  it("prefers a city local expert over a planner", () => {
    const entries = [
      tagged(expert("planner", "travel_expert"), 0),
      tagged(expert("city-local", "local_expert"), 1),
    ];

    assert.equal(selectBentoAnchorIndex(entries, neighbourhood, "Kyoto"), 1);
    assert.equal(bentoAnchorPriority(entries[0].item, neighbourhood, "Kyoto"), "planner");
  });

  it("uses a trip planner when no local expert exists", () => {
    const entry = tagged(expert("planner", "travel_expert"), 0);

    assert.equal(selectBentoAnchorIndex([entry], neighbourhood, "Kyoto"), 0);
    assert.equal(bentoAnchorPriority(entry.item, neighbourhood, "Kyoto"), "planner");
  });

  it("rejects an event planner, leaving no anchor for the ready-made lead", () => {
    const entry = tagged(expert("event-only", "event_planner"), 0);

    assert.equal(selectBentoAnchorIndex([entry], neighbourhood, "Kyoto"), -1);
    assert.equal(bentoAnchorPriority(entry.item, neighbourhood, "Kyoto"), null);
  });

  it("within a priority bucket, ranks the highest-rated eligible expert first", () => {
    const entries = [
      tagged(
        expert("nb-local-low-rated", "local_expert", {
          expertForm: { neighborhoods: ["gion"] },
          reviewCount: 12,
          averageRating: 4.1,
        }),
        0,
      ),
      tagged(
        expert("nb-local-high-rated", "local_expert", {
          expertForm: { neighborhoods: ["gion"] },
          reviewCount: 30,
          averageRating: 4.9,
        }),
        1,
      ),
    ];

    // The second (higher-rated) expert wins even though it appears later in
    // the stream — rating outranks stream order within the same §2 bucket.
    assert.equal(selectBentoAnchorIndex(entries, neighbourhood, "Kyoto"), 1);
  });

  it("breaks a rating tie by the most offerings (servicesCount + packagesCount)", () => {
    const entries = [
      tagged(
        expert("nb-local-fewer-offerings", "local_expert", {
          expertForm: { neighborhoods: ["gion"] },
          reviewCount: 20,
          averageRating: 4.7,
          servicesCount: 1,
          packagesCount: 0,
        }),
        0,
      ),
      tagged(
        expert("nb-local-more-offerings", "local_expert", {
          expertForm: { neighborhoods: ["gion"] },
          reviewCount: 20,
          averageRating: 4.7,
          servicesCount: 2,
          packagesCount: 3,
        }),
        1,
      ),
    ];

    assert.equal(selectBentoAnchorIndex(entries, neighbourhood, "Kyoto"), 1);
  });

  it("falls back to stream order when rating and offerings are both tied", () => {
    const entries = [
      tagged(
        expert("nb-local-first", "local_expert", {
          expertForm: { neighborhoods: ["gion"] },
          reviewCount: 20,
          averageRating: 4.7,
          servicesCount: 2,
          packagesCount: 1,
        }),
        0,
      ),
      tagged(
        expert("nb-local-second", "local_expert", {
          expertForm: { neighborhoods: ["gion"] },
          reviewCount: 20,
          averageRating: 4.7,
          servicesCount: 2,
          packagesCount: 1,
        }),
        1,
      ),
    ];

    assert.equal(selectBentoAnchorIndex(entries, neighbourhood, "Kyoto"), 0);
  });

  it("never lets an unrated expert outrank a review-backed one in the same bucket", () => {
    const entries = [
      tagged(
        expert("nb-local-unrated", "local_expert", {
          expertForm: { neighborhoods: ["gion"] },
          servicesCount: 9,
          packagesCount: 9,
        }),
        0,
      ),
      tagged(
        expert("nb-local-rated", "local_expert", {
          expertForm: { neighborhoods: ["gion"] },
          reviewCount: 3,
          averageRating: 3.2,
        }),
        1,
      ),
    ];

    assert.equal(selectBentoAnchorIndex(entries, neighbourhood, "Kyoto"), 1);
  });
});