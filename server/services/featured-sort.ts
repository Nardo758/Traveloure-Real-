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
 *
 * `qualityScore` may be **null**, meaning UNMEASURED — the item has no rating,
 * no reviews, no bookings yet, so no quality judgment exists for it at all.
 * This is distinct from a measured-but-low score, and the two must not be
 * conflated:
 *
 *   - measured & below floor → the item was rated and rated badly. The floor
 *     applies: featuring does NOT rescue it. (The original intent — "an item
 *     featured then later degraded" must not corrupt ranking.)
 *   - UNMEASURED (null)      → nothing is known. The floor does NOT apply,
 *     because the guardrail exists to stop featuring from burying a *better
 *     native result*, and where nothing is measured there is no better result
 *     to bury. Treating unmeasured as below-floor would silently make editorial
 *     featuring a no-op on any young marketplace — every item scores 0 and no
 *     boost ever lands. Unmeasured items rank at 0 + boost, i.e. featured ones
 *     lead their unmeasured peers but still lose to a genuinely well-rated item.
 */
export function featuredAdjustedScore(
  item: FeaturedRankableItem,
  qualityScore: number | null,
): number {
  const measured = qualityScore ?? 0;
  const featured = item.isFeatured === true;
  if (!featured) return measured;
  // Unmeasured → boost applies (nothing to bury). Measured-but-low → floor holds.
  if (qualityScore !== null && qualityScore < FEATURED_MIN_QUALITY) return measured;
  return measured + FEATURED_BOOST;
}

/**
 * Build a comparator suitable for Array.prototype.sort that orders items
 * by their featured-adjusted score (highest first).
 *
 * @param scoreFor extract the baseline quality score for an item — surface-
 *                 specific (e.g. avg rating × 20, or a composite engagement metric).
 *                 Return **null** for an item with no quality measurement at all
 *                 (no reviews/bookings yet) rather than inventing a 0 — see
 *                 featuredAdjustedScore for why the two differ.
 */
export function makeFeaturedSorter<T extends FeaturedRankableItem>(
  scoreFor: (item: T) => number | null,
): (a: T, b: T) => number {
  return (a, b) => featuredAdjustedScore(b, scoreFor(b)) - featuredAdjustedScore(a, scoreFor(a));
}

/**
 * Convenience wrapper: sort an array in place by featured-adjusted score.
 */
export function sortByFeaturedAdjusted<T extends FeaturedRankableItem>(
  items: T[],
  scoreFor: (item: T) => number | null,
): T[] {
  return items.sort(makeFeaturedSorter(scoreFor));
}
