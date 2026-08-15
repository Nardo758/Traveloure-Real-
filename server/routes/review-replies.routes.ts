/**
 * review-replies.routes.ts — mount: app.use(reviewRepliesRoutes)
 *
 * Ratified Reviews feature (mockup §06d, decision-maker ratified Aug 9 2026, migration 190 —
 * `service_reviews.provider_reply` / `provider_replied_at`, declared in shared/schema.ts and
 * OMITTED from `insertServiceReviewSchema`, foundations landed 392e2bd8). Two endpoints, both
 * scoped to the SESSION provider — never a body-supplied identity (§14):
 *
 *   GET   /api/me/reviews       — every review across the caller's OWN services (rating, text,
 *                                 traveler display name, service name, date, both reply fields),
 *                                 newest first, plus a summary ({total, avgRating, awaitingReply}).
 *   PATCH /api/me/reviews/:id/reply — set/overwrite the ONE public reply on a review. Owner-gated:
 *                                 the review's SERVICE must belong to the session user (joined
 *                                 through provider_services.user_id, not service_reviews.provider_id
 *                                 — the service row is the actual ownership record) — 404 (never
 *                                 403, so existence of another provider's review id is not
 *                                 disclosed) when it doesn't. Editable: the same endpoint
 *                                 overwrites providerReply/providerRepliedAt on every call — no
 *                                 delete in v1.
 *
 * §14 (session identity only): the acting user is ALWAYS `getUserId(req)`. There is no
 * `providerId`/`userId` field on the PATCH body schema at all — allowlist by construction, and
 * the WHERE clause below is the actual enforcement, not just the pre-check.
 */
import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { serviceReviews, providerServices, users } from "@shared/schema";
import { getUserId } from "../utils/auth";
import { isAuthenticated } from "../replit_integrations/auth";
import { parsePagination } from "../utils/pagination";

const router = Router();

router.get("/api/me/reviews", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const { limit, offset } = parsePagination(req.query);

    // Summary aggregates run over the FULL set (avg/awaiting must not shift with the page).
    const [agg] = await db
      .select({
        total: sql<number>`count(*)::int`,
        avgRating: sql<number>`coalesce(avg(${serviceReviews.rating}), 0)::float`,
        awaitingReply: sql<number>`count(*) filter (where ${serviceReviews.providerReply} is null)::int`,
      })
      .from(serviceReviews)
      .innerJoin(providerServices, eq(serviceReviews.serviceId, providerServices.id))
      .where(eq(providerServices.userId, userId));

    const rows = await db
      .select({
        id: serviceReviews.id,
        rating: serviceReviews.rating,
        reviewText: serviceReviews.reviewText,
        createdAt: serviceReviews.createdAt,
        providerReply: serviceReviews.providerReply,
        providerRepliedAt: serviceReviews.providerRepliedAt,
        serviceId: serviceReviews.serviceId,
        serviceName: providerServices.serviceName,
        travelerId: serviceReviews.travelerId,
        travelerFirstName: users.firstName,
        travelerLastName: users.lastName,
      })
      .from(serviceReviews)
      .innerJoin(providerServices, eq(serviceReviews.serviceId, providerServices.id))
      .leftJoin(users, eq(serviceReviews.travelerId, users.id))
      .where(eq(providerServices.userId, userId))
      .orderBy(desc(serviceReviews.createdAt))
      .limit(limit)
      .offset(offset);

    const reviews = rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      reviewText: r.reviewText ?? null,
      createdAt: r.createdAt,
      providerReply: r.providerReply ?? null,
      providerRepliedAt: r.providerRepliedAt ?? null,
      serviceId: r.serviceId,
      serviceName: r.serviceName ?? "Service",
      travelerName:
        [r.travelerFirstName, r.travelerLastName].filter(Boolean).join(" ") || "Traveler",
    }));

    const total = agg?.total ?? 0;
    res.json({
      reviews,
      summary: {
        total,
        avgRating: agg?.avgRating ?? 0,
        awaitingReply: agg?.awaitingReply ?? 0,
      },
      total,
      hasMore: offset + reviews.length < total,
      limit,
      offset,
    });
  } catch (err) {
    console.error("[me/reviews] read error:", err);
    res.status(500).json({ message: "Failed to load reviews" });
  }
});

// Allowlist (§19 shape): the ONLY field this endpoint ever writes.
const replySchema = z
  .object({
    reply: z.string().trim().min(1).max(1000),
  })
  .strict();

router.patch("/api/me/reviews/:id/reply", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const parsed = replySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid reply", errors: parsed.error.flatten() });
    }

    // Ownership gate: the review's SERVICE must belong to the session user, joined through
    // provider_services.user_id (the actual ownership record — never service_reviews.provider_id,
    // which is only a denormalized copy). The UPDATE's WHERE below re-asserts the SAME join
    // condition (service_id IN <the session user's own service ids>) rather than trusting the
    // pre-check id alone — so a review id belonging to another provider matches zero rows in
    // EITHER query, and the two can never diverge.
    const ownedServiceRows = await db
      .select({ id: providerServices.id })
      .from(providerServices)
      .where(eq(providerServices.userId, userId));
    const ownedServiceIds = ownedServiceRows.map((r) => r.id);
    if (ownedServiceIds.length === 0) return res.status(404).json({ message: "Review not found" });

    const repliedAt = new Date();
    const updated = await db
      .update(serviceReviews)
      .set({ providerReply: parsed.data.reply, providerRepliedAt: repliedAt })
      .where(and(eq(serviceReviews.id, req.params.id), inArray(serviceReviews.serviceId, ownedServiceIds)))
      .returning({ id: serviceReviews.id });

    if (updated.length === 0) return res.status(404).json({ message: "Review not found" });

    res.json({
      id: req.params.id,
      providerReply: parsed.data.reply,
      providerRepliedAt: repliedAt.toISOString(),
    });
  } catch (err) {
    console.error("[me/reviews/reply] write error:", err);
    res.status(500).json({ message: "Failed to save reply" });
  }
});

export default router;
