/**
 * CONTENT FACTS — the expert's two actions on a plan's facts.
 *
 *   POST /api/trips/:tripId/itinerary-items/:itemId/fresh-facts   A6 (3), `2026-10-01-a6-tavily-extract`
 *   POST /api/trips/:tripId/place-facts/:factId/confirm            A6 (4), `2026-10-01-a6-expert-confirm`
 *
 * The ONE consumer of `mayFetchFresh`'s `expert_action` arm. Only a §12 WRITE-status advisor on the
 * plan (`accepted`/`assigned`, never `pending`, never the owner — an owner's fresh facts come from a
 * paid run) may ask, and the actor is the SESSION (§14). "No such plan or item", "not your plan" and
 * "you are not its write-status advisor" are ONE 404 (LD 40 posture). The body is empty (`.strict()`).
 * Spend is capped per plan, per day and per source (`resolveFreshFetchBudget`); a refusal says which.
 */
import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { isTripAdvisorWithWriteAccess } from "../utils/trip-advisor";
import { db } from "../db";
import { itineraryItems, trips } from "@shared/schema";
import { FactConfirmError, confirmFactAsNugget, fetchFreshFactsForItem } from "../services/content-facts/place-facts.service";
import { checkBylineEligibility } from "../services/blog-byline-gate.service";

const router = Router();
const emptyBody = z.object({}).strict();

router.post("/api/trips/:tripId/itinerary-items/:itemId/fresh-facts", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "unauthenticated" });
    if (!emptyBody.safeParse(req.body ?? {}).success) return res.status(400).json({ error: "body_must_be_empty" });
    const { tripId, itemId } = req.params;
    if (!(await isTripAdvisorWithWriteAccess(tripId, userId))) return res.status(404).json({ error: "not_found" });
    const [trip] = await db.select({ id: trips.id, marketSlug: trips.marketSlug, destination: trips.destination }).from(trips).where(eq(trips.id, tripId));
    const [item] = await db
      .select({ id: itineraryItems.id, title: itineraryItems.title, type: itineraryItems.itemType })
      .from(itineraryItems)
      .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId)));
    if (!trip || !item) return res.status(404).json({ error: "not_found" });
    const city = (trip.destination ?? "").split(",")[0]?.trim() || null;
    const result = await fetchFreshFactsForItem({
      ctx: { kind: "expert_action", tripId, expertUserId: userId },
      tripId,
      item: { id: item.id, title: item.title, type: item.type },
      market: trip.marketSlug ?? null,
      city,
    });
    res.json(result);
  } catch (err) {
    console.error("[content-facts] fresh lookup failed:", (err as Error)?.message ?? err);
    res.status(500).json({ error: "fresh_lookup_failed" });
  }
});

/**
 * A6 (4): confirm a crawled fact into a verified nugget. Same gate as above (a §12 WRITE-status
 * advisor; ONE 404 otherwise), plus the byline gate for the plan's market — a verified nugget is
 * publishable, so only an expert who could sign a post about that market may vouch for one (brief
 * §1: "byline-gated experts confirm facts"). A refusal by the byline gate names its reason.
 */
router.post("/api/trips/:tripId/place-facts/:factId/confirm", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "unauthenticated" });
    if (!emptyBody.safeParse(req.body ?? {}).success) return res.status(400).json({ error: "body_must_be_empty" });
    const { tripId, factId } = req.params;
    if (!(await isTripAdvisorWithWriteAccess(tripId, userId))) return res.status(404).json({ error: "not_found" });
    const [trip] = await db.select({ marketSlug: trips.marketSlug }).from(trips).where(eq(trips.id, tripId));
    if (!trip) return res.status(404).json({ error: "not_found" });
    const byline = await checkBylineEligibility(userId, trip.marketSlug ?? null);
    if (!byline.eligible) return res.status(403).json({ error: "byline_not_eligible", reason: byline.reason });
    res.json(await confirmFactAsNugget({ tripId, factId, expertId: userId }));
  } catch (err) {
    if (err instanceof FactConfirmError) return res.status(err.status).json({ error: err.code });
    console.error("[content-facts] confirm failed:", (err as Error)?.message ?? err);
    res.status(500).json({ error: "confirm_failed" });
  }
});

export default router;
