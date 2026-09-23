/**
 * AN EARNER'S RATING — stated ONCE (board task #1665, ledger `2026-09-23-earner-rating-one-rule`).
 *
 * The rule the storefront has used since PR #1052, and now the only one: an earner's rating is the
 * plain mean of every APPROVED `service_reviews` row naming them as the provider, rounded to two
 * places, and their review count is how many such rows there are. Nothing else is read — not the
 * denormalized `provider_services.average_rating`/`review_count`, which can be stale or
 * fixture-written, and not a subset filtered by whether a listing is still live (a review a traveler
 * left stays that traveler's review after the listing is paused).
 *
 * Before this, three surfaces answered the question three ways — the storefront (this rule), the
 * /providers directory (reviews on live listings only) and /experts (a review-count-weighted mean of
 * the denormalized per-listing columns) — so the same person could show three different ratings
 * one click apart. §18 rule 1: one derivation, every caller.
 *
 * §13: no approved review ⇒ `averageRating: null` and `reviewCount: 0`; the client renders "New",
 * never a fabricated number and never "0.0".
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { serviceReviews } from "@shared/schema";
import { summarizeApprovedRatings, type EarnerRating } from "@shared/earner-rating";

// The rule itself is pure and lives in `@shared/earner-rating` so it can be proven without a database.
export { summarizeApprovedRatings, type EarnerRating } from "@shared/earner-rating";

/**
 * The same rule for many earners at once — one query, for list surfaces. Every requested id is in
 * the returned map; an earner with no approved review maps to `{ averageRating: null, reviewCount: 0 }`.
 */
export async function loadEarnerRatings(earnerIds: readonly string[]): Promise<Map<string, EarnerRating>> {
  const ids = Array.from(new Set(earnerIds.filter(Boolean)));
  const byEarner = new Map<string, number[]>();
  if (ids.length > 0) {
    const rows = await db
      .select({ providerId: serviceReviews.providerId, rating: serviceReviews.rating })
      .from(serviceReviews)
      .where(and(inArray(serviceReviews.providerId, ids), eq(serviceReviews.status, "approved")));
    for (const row of rows) {
      if (!row.providerId) continue;
      const bucket = byEarner.get(row.providerId) ?? [];
      bucket.push(Number(row.rating));
      byEarner.set(row.providerId, bucket);
    }
  }
  return new Map(ids.map((id) => [id, summarizeApprovedRatings(byEarner.get(id) ?? [])]));
}
