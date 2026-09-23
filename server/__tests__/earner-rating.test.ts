/**
 * earner-rating.test.ts — the ONE earner-rating rule (server/services/earner-rating.service.ts;
 * board task #1665, ledger `2026-09-23-earner-rating-one-rule`). The storefront, the /providers card
 * and /experts all read it, so these proofs are the proofs for all three.
 *
 *   R1  the plain mean of the approved ratings, rounded to two places, and their count
 *   R2  no approved review is "New": null average and a zero count — never 0.0
 *   R3  a value that is not a number is not a review and is not counted
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeApprovedRatings } from "@shared/earner-rating";

test("R1 mean of every approved rating, two places, with its count", () => {
  assert.deepEqual(summarizeApprovedRatings([5, 4]), { averageRating: 4.5, reviewCount: 2 });
  assert.deepEqual(summarizeApprovedRatings([5, 4, 4]), { averageRating: 4.33, reviewCount: 3 });
  assert.deepEqual(summarizeApprovedRatings(["3", 4]), { averageRating: 3.5, reviewCount: 2 });
});

test("R2 no approved review renders New, never a zero score", () => {
  assert.deepEqual(summarizeApprovedRatings([]), { averageRating: null, reviewCount: 0 });
});

test("R3 a non-number is not a review", () => {
  assert.deepEqual(summarizeApprovedRatings([5, null, undefined, "abc", Number.NaN]), { averageRating: 5, reviewCount: 1 });
});
