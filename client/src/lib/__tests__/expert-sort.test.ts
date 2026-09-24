/**
 * The /experts rating and review sorts (board task #429). Pure.
 *   S1 Highest Rated: rating desc, ties by review count, unrated ("New") last.
 *   S2 Most Reviews: review count desc, ties by rating.
 * Run: npx tsx --test client/src/lib/__tests__/expert-sort.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareByRating, compareByReviews } from "../expert-sort";

const e = (id: string, expertRating: number | null, expertReviewCount: number) => ({ id, expertRating, expertReviewCount });
const list = [e("new", null, 0), e("low", 3.2, 40), e("topFew", 4.9, 2), e("topMany", 4.9, 12), e("mid", 4.1, 7)];

test("S1: Highest Rated — rating first, then reviews, unrated last", () => {
  assert.deepEqual([...list].sort(compareByRating).map((x) => x.id), ["topMany", "topFew", "mid", "low", "new"]);
});

test("S2: Most Reviews — review count first, then rating", () => {
  assert.deepEqual([...list].sort(compareByReviews).map((x) => x.id), ["low", "topMany", "mid", "topFew", "new"]);
});
