/**
 * ready-made.routes.ts — Ready-Made Trips authoring, Phase 1 (brief v1.1 §1–2, spec v3).
 *
 * Two endpoints:
 *  • POST /api/expert/ready-made — create the authoring pair: a trip with userId=NULL +
 *    authorId=caller (traveler-surface exclusion by construction, §2a) and a ready_made_trips
 *    listing row born 'draft' (D1a). Role-gated per D3: local_expert | travel_expert (+ admin),
 *    resolved by DB lookup (§2-style — never the session's possibly-stale role string).
 *  • GET /api/expert/workspace-context/:tripId — server-side mode resolution for the dual-mode
 *    workspace: assignment row exists → 'assignment'; else trip.authorId === caller → 'authoring';
 *    else 403/404. The client is TOLD the mode; it never infers it.
 *
 * Auth rules (brief §2, hard): the authoring check is isTripAuthor (explicit, present-value
 * comparison). NEVER routed through getTripRole/canMutateTrip.
 */
import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { storage } from "../storage";
import { trips, readyMadeTrips, tripExpertAdvisors } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { getAuthoredTrip } from "../utils/trip-authorship";

const router = Router();

const AUTHOR_ROLES = new Set(["local_expert", "travel_expert", "admin"]); // D3 (Leon, 2026-07-25)

function sessionUserId(req: any): string | null {
  return (req.user as any)?.claims?.sub ?? (req.user as any)?.id ?? null;
}

function isAuthenticated(req: any, res: any, next: any) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

const createReadyMadeSchema = z.object({
  title: z.string().trim().min(1).max(200).default("Untitled ready-made trip"),
  market: z.string().trim().min(1).max(100).default("Kyoto"), // §12: Kyoto-only launch (server default, not client-trusted scope)
  durationDays: z.number().int().min(1).max(30).default(3),
});

// ─── Create the authoring pair ───────────────────────────────────────────────
router.post("/api/expert/ready-made", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    // D3 role gate — DB lookup, not the session role string.
    const user = await storage.getUser(userId);
    if (!user || !AUTHOR_ROLES.has(user.role ?? "")) {
      return res.status(403).json({ message: "Ready-made authoring requires a local expert or trip advisor role" });
    }

    const parsed = createReadyMadeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    }
    const { title, market, durationDays } = parsed.data;

    // Placeholder dates: authoring trips are templates-in-the-making, not scheduled travel; the
    // buyer's CLONE gets real dates. trips.start/end are NOT NULL so we anchor a synthetic window.
    const start = new Date();
    const end = new Date(start.getTime() + (durationDays - 1) * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const result = await db.transaction(async (tx) => {
      const [trip] = await tx
        .insert(trips)
        .values({
          userId: null,          // §2a: NULL owner = excluded from every traveler surface
          authorId: userId,      // authoring-mode scope key
          title,
          destination: market,
          startDate: fmt(start),
          endDate: fmt(end),
          status: "draft",
          numberOfTravelers: 2,
          adults: 2,
          kids: 0,
        } as any)
        .returning();

      const [listing] = await tx
        .insert(readyMadeTrips)
        .values({
          authorId: userId,
          sourceTripId: trip.id,
          market,
          title,
          durationDays,
          status: "draft",       // born-draft (D1a) — approval only via the admin action
        } as any)
        .returning();

      return { trip, listing };
    });

    res.status(201).json({
      tripId: result.trip.id,
      listingId: result.listing.id,
      mode: "authoring",
      redirect: `/expert/workspace/${result.trip.id}`,
    });
  } catch (err: any) {
    console.error("[ready-made] create error:", err);
    res.status(500).json({ message: "Failed to create ready-made trip", error: err.message });
  }
});

// ─── Workspace mode resolution (dual-mode bootstrap) ─────────────────────────
router.get("/api/expert/workspace-context/:tripId", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    const tripId = req.params.tripId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // Assignment mode first: an advisor row for this caller on this trip.
    const [assignment] = await db
      .select()
      .from(tripExpertAdvisors)
      .where(and(eq(tripExpertAdvisors.tripId, tripId), eq(tripExpertAdvisors.localExpertId, userId)))
      .limit(1);
    if (assignment) {
      const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      return res.json({ mode: "assignment", trip, assignment });
    }

    // Authoring mode: explicit present-value author check (never getTripRole).
    const authored = await getAuthoredTrip(tripId, userId);
    if (authored) {
      const [listing] = await db
        .select()
        .from(readyMadeTrips)
        .where(eq(readyMadeTrips.sourceTripId, tripId))
        .limit(1);
      return res.json({ mode: "authoring", trip: authored, listing: listing ?? null });
    }

    return res.status(403).json({ message: "Not assigned to this trip and not its author" });
  } catch (err: any) {
    console.error("[ready-made] workspace-context error:", err);
    res.status(500).json({ message: "Failed to resolve workspace context", error: err.message });
  }
});

export default router;
