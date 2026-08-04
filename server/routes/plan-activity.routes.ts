/**
 * plan-activity.routes.ts — "While you were away" digest read (Console Realign R-H, Lane E7).
 *
 * ONE endpoint: GET /api/me/plan-activity?since=<ISO timestamp> — read-only, session-scoped.
 * Reads `item_transition_log` (the slip's diary, server/services/item-transition-log.service.ts)
 * joined to `trips` owned by the session user, so a traveler can see what OTHER actors (expert /
 * agent / checkout) did across ALL their trips since their last dashboard visit — the existing
 * `getRecentTripTransitions` reader is trip-scoped (one trip at a time), so this is a new,
 * cross-trip, user-scoped read over the SAME table. No writes — the item-transition-log module's
 * append-only contract is untouched (§13: this file only selects).
 *
 * §14: acting user from the session only, never from query/body. `since` bounds the window but is
 * clamped to a 90-day lookback so an arbitrary/ancient client-sent timestamp can't force an
 * unbounded scan.
 *
 * actorType filter = expert | agent | checkout — "things OTHER actors did", not the traveler's own
 * edits (R-H). `agent` is not yet a value any code path writes (CLAUDE.md §9's R-J MCP connector is
 * the future writer) — included here so this endpoint needs no change when that lane lands; it is
 * simply never matched today.
 */
import { Router } from "express";
import { getUserId } from "../utils/auth";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { itemTransitionLog, trips } from "@shared/schema";

const router = Router();

const ACTIVITY_ACTOR_TYPES = ["expert", "agent", "checkout"] as const;
const DEFAULT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const RESULT_LIMIT = 20;

function sessionUserId(req: any): string | undefined {
  return getUserId(req)!;
}

router.get("/api/me/plan-activity", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const rawSince = typeof req.query.since === "string" ? req.query.since : undefined;
    let since = rawSince ? new Date(rawSince) : new Date(Date.now() - DEFAULT_LOOKBACK_MS);
    if (isNaN(since.getTime())) {
      return res.status(400).json({ message: "Invalid since — must be a parseable timestamp" });
    }
    const minSince = new Date(Date.now() - MAX_LOOKBACK_MS);
    if (since < minSince) since = minSince;

    const rows = await db
      .select({
        id: itemTransitionLog.id,
        tripId: itemTransitionLog.tripId,
        eventType: itemTransitionLog.eventType,
        fromStatus: itemTransitionLog.fromStatus,
        toStatus: itemTransitionLog.toStatus,
        actorType: itemTransitionLog.actorType,
        createdAt: itemTransitionLog.createdAt,
        tripDestination: trips.destination,
        tripTitle: trips.title,
        trackingNumber: trips.trackingNumber,
      })
      .from(itemTransitionLog)
      .innerJoin(trips, eq(itemTransitionLog.tripId, trips.id))
      .where(
        and(
          eq(trips.userId, userId),
          gt(itemTransitionLog.createdAt, since),
          inArray(itemTransitionLog.actorType, ACTIVITY_ACTOR_TYPES as unknown as string[]),
        ),
      )
      .orderBy(desc(itemTransitionLog.createdAt))
      .limit(RESULT_LIMIT);

    res.json({ transitions: rows, since: since.toISOString() });
  } catch (err) {
    console.error("[plan-activity] GET failed:", err);
    res.status(500).json({ message: "Failed to load plan activity" });
  }
});

export default router;
