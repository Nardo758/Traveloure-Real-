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
});