/**
 * Package relevance ranking gates.
 *
 * Run: npx tsx --test client/src/lib/__tests__/package-relevance.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  rankPackagesByRelevance,
  tripTypeFit,
  destinationMatch,
  qualityScore,
  type RankablePackage,
} from "../package-relevance";

const pkg = (over: Partial<RankablePackage>): RankablePackage => ({
  id: over.id ?? "p",
  destination: "Kyoto, Japan",
  category: null,
  tags: null,
  salesCount: 0,
  averageRating: null,
  reviewCount: 0,
  isFeatured: false,
  createdAt: null,
  ...over,
});

describe("destinationMatch", () => {
  it("matches the browsed city (substring either direction)", () => {
    assert.equal(destinationMatch(pkg({ destination: "Kyoto, Japan" }), { city: "Kyoto" }), 1);
    assert.equal(destinationMatch(pkg({ destination: "Kyoto" }), { city: "Kyoto, Japan" }), 1);
  });
  it("is 0 for a different city", () => {
    assert.equal(destinationMatch(pkg({ destination: "Paris" }), { city: "Kyoto" }), 0);
  });
});

describe("tripTypeFit", () => {
  it("is neutral (0.5) with no active category filter", () => {
    assert.equal(tripTypeFit(pkg({ category: "adventure" }), { category: "all" }), 0.5);
    assert.equal(tripTypeFit(pkg({ category: "adventure" }), {}), 0.5);
  });
  it("is 1 when category or tags match the active filter", () => {
    assert.equal(tripTypeFit(pkg({ category: "Adventure" }), { category: "adventure" }), 1);
    assert.equal(tripTypeFit(pkg({ category: "luxury", tags: ["family", "kids"] }), { category: "family" }), 1);
  });
  it("is 0 when a filter is active and nothing matches", () => {
    assert.equal(tripTypeFit(pkg({ category: "luxury", tags: ["spa"] }), { category: "adventure" }), 0);
  });
});

describe("qualityScore", () => {
  it("ignores rating when there are no reviews (§13 — no fabricated score)", () => {
    const unrated = qualityScore(pkg({ averageRating: "4.9", reviewCount: 0, salesCount: 0 }), 0);
    assert.equal(unrated, 0);
  });
  it("rewards a review-backed rating", () => {
    const rated = qualityScore(pkg({ averageRating: "5", reviewCount: 10 }), 0);
    assert.ok(rated > 0);
  });
  it("rewards featured and higher sales share", () => {
    assert.ok(qualityScore(pkg({ isFeatured: true }), 0) > qualityScore(pkg({ isFeatured: false }), 0));
    assert.ok(qualityScore(pkg({ salesCount: 100 }), 100) > qualityScore(pkg({ salesCount: 1 }), 100));
  });
});

describe("rankPackagesByRelevance", () => {
  it("does not mutate the input and returns all items", () => {
    const input = [pkg({ id: "a" }), pkg({ id: "b" })];
    const copy = [...input];
    const out = rankPackagesByRelevance(input, { city: "Kyoto" });
    assert.deepEqual(input, copy);
    assert.equal(out.length, 2);
  });

  it("surfaces the category-matching package first when a filter is active", () => {
    const ranked = rankPackagesByRelevance(
      [
        pkg({ id: "generic", category: "luxury", salesCount: 100 }),
        pkg({ id: "match", category: "adventure", salesCount: 1 }),
      ],
      { city: "Kyoto", category: "adventure" },
    );
    // The category match (tripTypeFit=1, weight .25) outranks a higher-sales generic
    // package (tripTypeFit=0) even though the generic one has more sales.
    assert.equal(ranked[0].id, "match");
  });

  it("falls back to quality order when unfiltered (≈ the server default)", () => {
    const ranked = rankPackagesByRelevance(
      [
        pkg({ id: "low", salesCount: 1, isFeatured: false }),
        pkg({ id: "high", salesCount: 50, isFeatured: true }),
      ],
      { city: "Kyoto", category: "all" },
    );
    assert.equal(ranked[0].id, "high");
  });

  it("keeps stable order for equal-relevance packages", () => {
    const ranked = rankPackagesByRelevance(
      [pkg({ id: "first" }), pkg({ id: "second" })],
      { city: "Kyoto" },
    );
    assert.deepEqual(ranked.map((p) => p.id), ["first", "second"]);
  });
});
