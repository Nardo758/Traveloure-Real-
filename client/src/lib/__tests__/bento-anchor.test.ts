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

  it("within a priority bucket, ranks the highest-rated eligible expert first (live /api/experts field names)", () => {
    // expertRating / expertReviewCount are the real fields the live
    // /api/experts route attaches (server/routes.ts) — the ranking must read
    // those, not just the legacy averageRating / reviewCount names.
    const entries = [
      tagged(
        expert("nb-local-low-rated", "local_expert", {
          expertForm: { neighborhoods: ["gion"] },
          expertReviewCount: 12,
          expertRating: 4.1,
        }),
        0,
      ),
      tagged(
        expert("nb-local-high-rated", "local_expert", {
          expertForm: { neighborhoods: ["gion"] },
          expertReviewCount: 30,
          expertRating: 4.9,
        }),
        1,
      ),
    ];

    // The second (higher-rated) expert wins even though it appears later in
    // the stream — rating outranks stream order within the same §2 bucket.
    assert.equal(selectBentoAnchorIndex(entries, neighbourhood, "Kyoto"), 1);
  });

  it("falls back to legacy averageRating / reviewCount when expertRating is absent (fixtures, other callers)", () => {
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

    assert.equal(selectBentoAnchorIndex(entries, neighbourhood, "Kyoto"), 1);
  });

  it("treats an explicit null expertRating (no approved reviews yet) as unrated, not a fallback to averageRating", () => {
    const entries = [
      tagged(
        expert("nb-local-null-rating-with-legacy", "local_expert", {
          expertForm: { neighborhoods: ["gion"] },
          expertReviewCount: 0,
          expertRating: null,
          // A stale/unrelated legacy field must not leak through once the
          // live field is present (even as an explicit null).
          reviewCount: 5,
          averageRating: 4.9,
        }),
        0,
      ),
      tagged(
        expert("nb-local-rated", "local_expert", {
          expertForm: { neighborhoods: ["gion"] },
          expertReviewCount: 3,
          expertRating: 3.2,
        }),
        1,
      ),
    ];

    assert.equal(selectBentoAnchorIndex(entries, neighbourhood, "Kyoto"), 1);
  });

  it("breaks a rating tie by the most offerings (servicesCount + packagesCount)", () => {
    const entries = [
      tagged(
        expert("nb-local-fewer-offerings", "local_expert", {
          expertForm: { neighborhoods: ["gion"] },
          expertReviewCount: 20,
          expertRating: 4.7,
          servicesCount: 1,
          packagesCount: 0,
        }),
        0,
      ),
      tagged(
        expert("nb-local-more-offerings", "local_expert", {
          expertForm: { neighborhoods: ["gion"] },
          expertReviewCount: 20,
          expertRating: 4.7,
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
          expertReviewCount: 20,
          expertRating: 4.7,
          servicesCount: 2,
          packagesCount: 1,
        }),
        0,
      ),
      tagged(
        expert("nb-local-second", "local_expert", {
          expertForm: { neighborhoods: ["gion"] },
          expertReviewCount: 20,
          expertRating: 4.7,
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
          expertReviewCount: 3,
          expertRating: 3.2,
        }),
        1,
      ),
    ];

    assert.equal(selectBentoAnchorIndex(entries, neighbourhood, "Kyoto"), 1);
  });

  it("matches a neighbourhood-local expert against a punctuated display name, mirroring the server's normalizeNeighborhoodKey", () => {
    // Real seeded neighbourhood display names carry punctuation ("Fort / Kala
    // Ghoda") while the expert's own neighbourhood field may be a plain slug
    // ("fort_kala_ghoda") or a hyphenated one ("fort-kala-ghoda") — all three
    // must collapse to the same key the way the server-side join does.
    const fortKalaGhoda = { id: "fort-kala-ghoda", slug: null, name: "Fort / Kala Ghoda" };
    const entry = tagged(
      expert("fort-local", "local_expert", { expertForm: { neighborhoods: ["fort_kala_ghoda"] } }),
      0,
    );

    assert.equal(bentoAnchorPriority(entry.item, fortKalaGhoda, "Mumbai"), "neighborhood-local");
  });

  it("classifies the legacy generic 'expert' role as a planner, not a local — it must never outrank a genuine city-local expert", () => {
    // Mirrors server/routes.ts: "the legacy generic `expert` stored role
    // belongs in the Trip Planners browse lane" — there is no separate
    // generic-expert tab, so it cannot count as neighbourhood/city local here.
    const entries = [
      tagged(
        expert("generic-expert", "expert", {
          expertForm: { neighborhoods: ["gion"] },
          expertReviewCount: 50,
          expertRating: 5.0,
        }),
        0,
      ),
      tagged(
        expert("city-local", "local_expert", {
          expertReviewCount: 1,
          expertRating: 3.0,
        }),
        1,
      ),
    ];

    assert.equal(bentoAnchorPriority(entries[0].item, neighbourhood, "Kyoto"), "planner");
    // The genuine city-local expert wins even with a far lower rating, because
    // priority bucket is compared before rating.
    assert.equal(selectBentoAnchorIndex(entries, neighbourhood, "Kyoto"), 1);
  });
});