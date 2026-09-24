/**
 * The /experts "Highest Rated" and "Most Reviews" sorts (board task #429). Pure.
 *
 * Both read the SAME figures the cards show (`expertRating` / `expertReviewCount`, the one earner
 * rating, board task #1665) — never a second computation. An expert with no rating yet ("New") has
 * no position in a rating order, so they sort after every rated expert rather than as a zero (§13).
 */
type RatedExpert = { expertRating?: number | null; expertReviewCount?: number | null };

const rating = (e: RatedExpert) => (typeof e.expertRating === "number" ? e.expertRating : null);
const reviews = (e: RatedExpert) => (typeof e.expertReviewCount === "number" ? e.expertReviewCount : 0);

/** Highest rating first; ties broken by more reviews; unrated last. */
export function compareByRating(a: RatedExpert, b: RatedExpert): number {
  const ra = rating(a);
  const rb = rating(b);
  if (ra === null && rb === null) return reviews(b) - reviews(a);
  if (ra === null) return 1;
  if (rb === null) return -1;
  return rb - ra || reviews(b) - reviews(a);
}

/** Most reviews first; ties broken by higher rating. */
export function compareByReviews(a: RatedExpert, b: RatedExpert): number {
  return reviews(b) - reviews(a) || compareByRating(a, b);
}
