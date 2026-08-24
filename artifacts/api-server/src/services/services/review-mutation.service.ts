import { db } from "../db";
import {
  providerServices,
  reviewModerationLogs,
  serviceReviews,
  type InsertServiceReview,
  type ServiceReview,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

type ReviewModerationStatus = "approved" | "flagged" | "removed" | "pending";

async function lockServiceReviews(tx: any, serviceId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${"service-reviews:" + serviceId}))`,
  );
}

async function recalculateServiceRatingInTransaction(
  tx: any,
  serviceId: string,
): Promise<{ averageRating: string; reviewCount: number }> {
  const [summary] = await tx
    .select({
      reviewCount: sql<number>`count(*)::int`,
      averageRating: sql<string>`coalesce(avg(${serviceReviews.rating}), 0)::numeric(3,1)::text`,
    })
    .from(serviceReviews)
    .where(sql`${serviceReviews.serviceId} = ${serviceId} AND ${serviceReviews.status} = 'approved'`);

  const reviewCount = Number(summary?.reviewCount ?? 0);
  const averageRating = summary?.averageRating ?? "0.0";
  await tx
    .update(providerServices)
    .set({ averageRating, reviewCount, updatedAt: new Date() })
    .where(eq(providerServices.id, serviceId));

  return { averageRating, reviewCount };
}

/**
 * Inserts a review and refreshes the public service aggregate under the same
 * per-service lock and transaction used by moderation. The booking lock keeps
 * the one-review-per-booking rule deterministic.
 */
export async function createServiceReviewWithAggregate(
  review: InsertServiceReview,
  trackingNumber: string,
): Promise<ServiceReview> {
  return db.transaction(async (tx) => {
    await lockServiceReviews(tx, review.serviceId);
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${"service-review-booking:" + review.bookingId}))`,
    );

    const [existing] = await tx
      .select({ id: serviceReviews.id })
      .from(serviceReviews)
      .where(eq(serviceReviews.bookingId, review.bookingId))
      .limit(1);
    if (existing) throw new Error("REVIEW_ALREADY_EXISTS");

    const [created] = await tx
      .insert(serviceReviews)
      .values({ ...review, trackingNumber })
      .returning();
    await recalculateServiceRatingInTransaction(tx, review.serviceId);
    return created;
  });
}

/**
 * Status transition, moderation audit, and public aggregate are one commit.
 * The per-service advisory lock serializes this with review creation and every
 * other moderation request for the same listing.
 */
export async function moderateReviewWithAggregate(input: {
  reviewId: string;
  status: ReviewModerationStatus;
  actorId: string;
  reason?: string | null;
}): Promise<ServiceReview | null> {
  return db.transaction(async (tx) => {
    const [locator] = await tx
      .select({ serviceId: serviceReviews.serviceId })
      .from(serviceReviews)
      .where(eq(serviceReviews.id, input.reviewId))
      .limit(1);
    if (!locator) return null;

    await lockServiceReviews(tx, locator.serviceId);
    const [current] = await tx
      .select()
      .from(serviceReviews)
      .where(eq(serviceReviews.id, input.reviewId))
      .limit(1);
    if (!current) return null;

    const moderationUpdate: Record<string, unknown> = {
      status: input.status,
      moderatedBy: input.actorId,
      moderatedAt: new Date(),
    };
    if (input.status === "flagged") {
      moderationUpdate.flagReason = input.reason || current.flagReason || null;
    } else if (input.status === "approved" || input.status === "removed") {
      // flagReason represents an unresolved user/admin report. An admin
      // decision resolves reports that committed before this transition. A
      // later user report takes the same service lock and remains queued.
      moderationUpdate.flagReason = null;
    }

    const [updated] = await tx
      .update(serviceReviews)
      .set(moderationUpdate)
      .where(eq(serviceReviews.id, input.reviewId))
      .returning();
    await tx.insert(reviewModerationLogs).values({
      reviewId: input.reviewId,
      action: input.status,
      actorId: input.actorId,
      reason: input.reason ?? null,
    } as any);
    await recalculateServiceRatingInTransaction(tx, locator.serviceId);
    return updated;
  });
}

/**
 * Records a user report without changing review visibility or aggregates.
 * Sharing the per-service lock with moderation gives report resolution a
 * deterministic order: an admin decision resolves earlier reports, while a
 * report committed after that decision remains visible in the review queue.
 */
export async function flagReviewSignal(
  reviewId: string,
  reason: string | null,
  actorId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [locator] = await tx
      .select({ serviceId: serviceReviews.serviceId })
      .from(serviceReviews)
      .where(eq(serviceReviews.id, reviewId))
      .limit(1);
    if (!locator) return false;

    await lockServiceReviews(tx, locator.serviceId);
    const [current] = await tx
      .select({ id: serviceReviews.id, status: serviceReviews.status })
      .from(serviceReviews)
      .where(eq(serviceReviews.id, reviewId))
      .limit(1);
    if (!current || current.status === "removed") return false;

    const [existing] = await tx
      .select({ id: reviewModerationLogs.id })
      .from(reviewModerationLogs)
      .where(and(
        eq(reviewModerationLogs.reviewId, reviewId),
        eq(reviewModerationLogs.actorId, actorId),
        eq(reviewModerationLogs.action, "flag"),
      ))
      .limit(1);
    if (existing) return false;

    await tx
      .update(serviceReviews)
      .set({ flagReason: reason || "User reported this review" })
      .where(eq(serviceReviews.id, reviewId));
    await tx.insert(reviewModerationLogs).values({
      reviewId,
      action: "flag",
      actorId,
      reason,
    } as any);
    return true;
  });
}

export async function recalculateServiceRatingAtomic(
  serviceId: string,
): Promise<{ averageRating: string; reviewCount: number }> {
  return db.transaction(async (tx) => {
    await lockServiceReviews(tx, serviceId);
    return recalculateServiceRatingInTransaction(tx, serviceId);
  });
}