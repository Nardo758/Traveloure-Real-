/**
 * The earner-rating rule, pure (board task #1665, ledger `2026-09-23-earner-rating-one-rule`): the
 * plain mean of an earner's APPROVED review ratings, rounded to two places, and how many there are.
 * `server/services/earner-rating.service.ts` loads the rows and applies this; the storefront, the
 * /providers card and /experts all read the result. §13: none ⇒ `null` and `0`, rendered "New".
 */
export interface EarnerRating {
  averageRating: number | null;
  reviewCount: number;
}

/** The rule itself, over the ratings of an earner's approved reviews. Pure. */
export function summarizeApprovedRatings(ratings: ReadonlyArray<number | string | null | undefined>): EarnerRating {
  let total = 0;
  let count = 0;
  for (const raw of ratings) {
    const n = Number(raw);
    if (raw == null || !Number.isFinite(n)) continue;
    total += n;
    count += 1;
  }
  return {
    averageRating: count > 0 ? Math.round((total / count) * 100) / 100 : null,
    reviewCount: count,
  };
}

