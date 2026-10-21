import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FeedItem } from "../feed-stream";
import {
  bentoAnchorPriority,
  bentoBaseColSpan,
  isBentoAnchorEligible,
  isPartnerOrThirdPartyFeedItem,
  selectBentoAnchorIndex,
  selectBentoHero,
} from "../bento-anchor";

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

  it("treats eligibility as a role predicate, never admitting event planners or providers", () => {
    assert.equal(isBentoAnchorEligible(expert("local", "local_expert")), true);
    assert.equal(isBentoAnchorEligible(expert("planner", "trip_planner")), true);
    assert.equal(isBentoAnchorEligible(expert("event", "event_planner")), false);
    assert.equal(
      isBentoAnchorEligible({
        kind: "vendor-service",
        id: "provider-service",
        data: { role: "local_expert" },
      }),
      false,
    );
  });

  it("uses highest rating then offerings to break a same-priority tie", () => {
    const entries = [
      tagged(expert("more-offerings", "local_expert", { averageRating: 4.7, packagesCount: 4 }), 0),
      tagged(expert("higher-rating", "local_expert", { averageRating: 4.9, packagesCount: 1 }), 1),
      tagged(expert("same-rating-more-offerings", "local_expert", { averageRating: 4.9, packagesCount: 3 }), 2),
    ];

    assert.equal(selectBentoAnchorIndex(entries, neighbourhood, "Kyoto"), 2);
  });

  it("does not anchor a trip planner scoped to another city", () => {
    const entry = tagged(expert("elsewhere", "trip_planner", { city: "Tokyo" }), 0);

    assert.equal(bentoAnchorPriority(entry.item, neighbourhood, "Kyoto"), null);
    assert.equal(selectBentoAnchorIndex([entry], neighbourhood, "Kyoto"), -1);
  });
});

function tile(kind: FeedItem["kind"], id: string, data: Record<string, unknown> = {}): FeedItem {
  return { kind, id, data };
}

describe("bento hero is ours (expert, then ready-made, then Wanted)", () => {
  const neighbourhood = { id: "gion", slug: "gion", name: "Gion" };

  it("prefers a local expert over a ready-made, a Wanted card, and a partner", () => {
    const entries = [
      tagged(tile("recommendation", "rec-affiliate", { candidate: { sourceType: "affiliate" } }), 0),
      tagged(tile("package", "package-1", { id: "rm-1", title: "A morning walk" }), 1),
      tagged(tile("wanted-slot", "wanted-0", { offeringLabel: "Local guide" }), 2),
      tagged(expert("nb-local", "local_expert", { expertForm: { neighborhoods: ["gion"] } }), 3),
    ];

    assert.deepEqual(selectBentoHero(entries, neighbourhood, "Kyoto"), { kind: "expert", index: 3 });
  });

  it("uses the ready-made when no eligible expert is in the section", () => {
    const entries = [
      tagged(tile("recommendation", "rec-affiliate", { candidate: { sourceType: "affiliate" } }), 0),
      tagged(tile("external-stub", "stub-1", { provider: "tiqets" }), 1),
      tagged(tile("wanted-slot", "wanted-0"), 2),
      tagged(tile("package", "package-1", { id: "rm-1", title: "A morning walk" }), 3),
      tagged(expert("event-only", "event_planner"), 4),
    ];

    assert.deepEqual(selectBentoHero(entries, neighbourhood, "Kyoto"), { kind: "ready-made", index: 3 });
  });

  it("uses an existing Wanted card when there is no expert and no ready-made", () => {
    const entries = [
      tagged(tile("supply-hotel", "hotel-1", { provider: "liteapi" }), 0),
      tagged(tile("recommendation", "rec-affiliate", { candidate: { sourceType: "affiliate" } }), 1),
      tagged(tile("wanted-slot", "wanted-0"), 2),
    ];

    assert.deepEqual(selectBentoHero(entries, neighbourhood, "Kyoto"), { kind: "wanted", index: 2 });
  });

  it("asks for a Wanted hero when the only cards are partner or third-party", () => {
    const entries = [
      tagged(tile("recommendation", "rec-affiliate", { candidate: { sourceType: "affiliate" } }), 0),
      tagged(tile("external-stub", "stub-1"), 1),
      tagged(tile("supply-hotel", "hotel-1", { provider: "liteapi" }), 2),
      tagged(tile("supply-activity", "act-1", { provider: "tiqets" }), 3),
      tagged(tile("event", "fever-1", { provider: "fever", priceSource: "partner" }), 4),
      tagged(tile("package", "partner-package", { provider: "tiqets" }), 5),
    ];

    assert.deepEqual(selectBentoHero(entries, neighbourhood, "Kyoto"), { kind: "wanted", index: null });
    for (const entry of entries) {
      assert.equal(isPartnerOrThirdPartyFeedItem(entry.item), true, entry.item.id);
      assert.equal(bentoBaseColSpan(entry.item, true), 1, entry.item.id);
    }
  });

  it("keeps a platform listing and a ready-made at hero width, and a partner at one column", () => {
    const platform = tile("recommendation", "rec-platform", { candidate: { sourceType: "platform_provider" } });
    const readyMade = tile("package", "package-1", { id: "rm-1" });
    const affiliate = tile("recommendation", "rec-affiliate", { candidate: { sourceType: "affiliate" } });

    assert.equal(isPartnerOrThirdPartyFeedItem(platform), false);
    assert.equal(isPartnerOrThirdPartyFeedItem(readyMade), false);
    assert.equal(isPartnerOrThirdPartyFeedItem(tile("vendor-service", "svc-1")), false);
    assert.equal(isPartnerOrThirdPartyFeedItem(tile("loose-gem", "gem-1")), false);
    assert.equal(bentoBaseColSpan(readyMade, false), 2);
    assert.equal(bentoBaseColSpan(platform, false), 1);
    assert.equal(bentoBaseColSpan(affiliate, true), 1);
  });
});