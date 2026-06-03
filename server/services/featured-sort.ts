/**
 * Featured-ranking trust guardrail (v2 spec §5, §8, §10 — Phase 1b-4).
 *
 * Spec: "never bury a better native result."
 *
 * Editorial marquee is valuable, but a naïve `ORDER BY is_featured DESC` lets
 * a mediocre featured listing outrank a high-quality unfeatured one — exactly
 * the trust break the spec calls out. The fix: featuring is a bounded boost,
 * not an absolute trump. Sort by score = quality + FEATURED_BOOST, where
 * FEATURED_BOOST is small enough that a clearly-better unfeatured item
 * still wins.
 *
 * Quality score is implementation-specific per surface (e.g. ratings,
 * bookings, recency). Use `scoreFor` to plug in whatever signal that
 * surface already trusts; the comparator stays the same.
 *
 * Wire site: anywhere that returns a list mixing featured + unfeatured items
 * to a discovery surface (location-view marquee section, services index,
 * trip-template browse, etc.). Phase 3+ will consume this.
 */

/**
 * Boost added to a featured item's quality score for ranking purposes.
 *
 * Tuned to ~10 % of a typical 100-point quality score: a high-rated unfeatured
 * item still beats a mediocre featured one, but featured is a real leg up
 * among items of comparable quality.
 */
export const FEATURED_BOOST = 10;

/**
 * Min quality threshold a featured item must hit to keep its boost.
 * Below this, a featured flag is treated as no-op so editorial errors
 * (an item featured then later degraded) don't corrupt ranking.
 */
export const FEATURED_MIN_QUALITY = 30;

export interface FeaturedRankableItem {
  isFeatured?: boolean | null;
}

/**
 * Returns the effective ranking score for an item given its baseline quality.
 * Featured items get FEATURED_BOOST iff their quality is above the floor.
 */
export function featuredAdjustedScore(item: FeaturedRankableItem, qualityScore: number): number {
  const featured = item.isFeatured === true;
  if (!featured) return qualityScore;
  if (qualityScore < FEATURED_MIN_QUALITY) return qualityScore;
  return qualityScore + FEATURED_BOOST;
}

/**
 * Build a comparator suitable for Array.prototype.sort that orders items
 * by their featured-adjusted score (highest first).
 *
 * @param scoreFor extract the baseline quality score for an item — surface-
 *                 specific (e.g. avg rating × 20, or a composite engagement metric)
 */
export function makeFeaturedSorter<T extends FeaturedRankableItem>(
  scoreFor: (item: T) => number,
): (a: T, b: T) => number {
  return (a, b) => featuredAdjustedScore(b, scoreFor(b)) - featuredAdjustedScore(a, scoreFor(a));
}

/**
 * Convenience wrapper: sort an array in place by featured-adjusted score.
 */
export function sortByFeaturedAdjusted<T extends FeaturedRankableItem>(
  items: T[],
  scoreFor: (item: T) => number,
): T[] {
  return items.sort(makeFeaturedSorter(scoreFor));
}
