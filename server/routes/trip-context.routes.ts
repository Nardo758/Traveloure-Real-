import { Router } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { verifyTripOwnership } from "../utils/trip-ownership";
import { storage } from "../storage";

/**
 * TripContext server persistence (migration 130, Trip-Strip program P2/E2; re-keyed by
 * migration 161, Trip-Canon Lane 6).
 *
 * The client-side trip context (sessionStorage, formalized by the P1 module) dies
 * with the browser session and never crosses devices. For signed-in users the
 * context is mirrored here so planning survives restarts.
 *
 * Self-scoped: the user id comes from the session ONLY (§14 — never from the body).
 * PUT is a zod allow-list of the TripContext fields with length caps — never raw
 * req.body into the jsonb column. No money path (a draft-planning blob; every
 * charge derives server-side from its own record per §14 regardless of context).
 *
 * Lane 6 (re-key): both routes now accept an optional `?tripId=` query param so context
 * can follow a SPECIFIC trip once the Trip is the canonical planning container, instead of
 * being smeared across every trip a user has open. `tripId` present → ownership-checked
 * (§14: the trip must exist AND belong to the session user — 404 if it doesn't exist, 403
 * if it isn't theirs) and reads/writes the trip-scoped row. `tripId` absent → the exact
 * pre-Lane-6 behavior: the legacy per-user row (back-compat, no client change required).
 */
const router = Router();

function sessionUserId(req: any): string | undefined {
  return (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
}

const tripIdParamSchema = z.string().min(1).max(64);

/**
 * Resolves and authorizes the optional `?tripId=` query param.
 * Returns `{ tripId: undefined }` when absent (legacy per-user row).
 * Returns `{ tripId: string }` when present and owned by `userId`.
 * Returns `{ error: { status, message } }` on a malformed param, a trip that doesn't
 * exist (404), or one that exists but isn't owned by this user (403).
 */
async function resolveTripIdParam(
  req: any,
  userId: string,
): Promise<{ tripId?: string; error?: { status: number; message: string } }> {
  const raw = req.query?.tripId;
  if (raw === undefined) return {};
  const parsed = tripIdParamSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: { status: 400, message: "Invalid tripId" } };
  }
  const tripId = parsed.data;
  const owned = await verifyTripOwnership(tripId, userId);
  if (!owned) {
    // Distinguish "trip doesn't exist" (404) from "exists but isn't yours" (403).
    const trip = await storage.getTrip(tripId);
    if (!trip) return { error: { status: 404, message: "Trip not found" } };
    return { error: { status: 403, message: "Not authorized to access this trip" } };
  }
  return { tripId };
}

const str = (max: number) => z.string().max(max);

// Mirrors client/src/lib/trip-context.ts TripContext. Unknown keys are stripped.
const tripContextSchema = z
  .object({
    experienceSlug: str(120).optional(),
    experienceType: str(120).optional(),
    title: str(255).optional(),
    destination: str(255).optional(),
    city: str(120).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    travelers: z.number().int().min(1).max(500).optional(),
    eventType: str(120).optional(),
    tripId: str(64).optional(),
    userExperienceId: str(64).optional(),
    id: str(64).optional(),
    intent: str(2000).optional(),
    contextFields: z.record(z.unknown()).optional(),
    selectedServices: z
      .array(
        z.object({
          name: str(255).optional(),
          provider: str(255).optional(),
          price: z.number().optional(),
          category: str(120).optional(),
        }),
      )
      .max(100)
      .optional(),
  })
  .strip();

router.get("/api/trip-context", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const resolved = await resolveTripIdParam(req, userId);
    if (resolved.error) return res.status(resolved.error.status).json({ message: resolved.error.message });
    const { tripId } = resolved;
    const rows = tripId
      ? await db.execute(
          sql`SELECT context, updated_at FROM trip_contexts WHERE user_id = ${userId} AND trip_id = ${tripId} LIMIT 1`,
        )
      : await db.execute(
          sql`SELECT context, updated_at FROM trip_contexts WHERE user_id = ${userId} AND trip_id IS NULL LIMIT 1`,
        );
    const row: any = (rows as any).rows?.[0];
    res.json({ context: row?.context ?? {}, updatedAt: row?.updated_at ?? null });
  } catch (err) {
    console.error("[TripContext] GET failed:", err);
    res.status(500).json({ message: "Failed to load trip context" });
  }
});

router.put("/api/trip-context", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const resolved = await resolveTripIdParam(req, userId);
    if (resolved.error) return res.status(resolved.error.status).json({ message: resolved.error.message });
    const { tripId } = resolved;
    const parsed = tripContextSchema.safeParse(req.body?.context ?? req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid trip context", issues: parsed.error.issues.slice(0, 5) });
    }
    const json = JSON.stringify(parsed.data);
    if (json.length > 32_768) {
      return res.status(413).json({ message: "Trip context too large" });
    }
    // Two branches, not one dynamic ON CONFLICT target: Postgres requires the conflict
    // target to exactly match an existing (partial) unique index, including its predicate
    // (migration 161 — trip_contexts_user_legacy_uidx WHERE trip_id IS NULL vs
    // trip_contexts_user_trip_uidx WHERE trip_id IS NOT NULL).
    if (tripId) {
      await db.execute(sql`
        INSERT INTO trip_contexts (user_id, trip_id, context, updated_at)
        VALUES (${userId}, ${tripId}, ${json}::jsonb, NOW())
        ON CONFLICT (user_id, trip_id) WHERE trip_id IS NOT NULL
        DO UPDATE SET context = ${json}::jsonb, updated_at = NOW()
      `);
    } else {
      await db.execute(sql`
        INSERT INTO trip_contexts (user_id, trip_id, context, updated_at)
        VALUES (${userId}, NULL, ${json}::jsonb, NOW())
        ON CONFLICT (user_id) WHERE trip_id IS NULL
        DO UPDATE SET context = ${json}::jsonb, updated_at = NOW()
      `);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[TripContext] PUT failed:", err);
    res.status(500).json({ message: "Failed to save trip context" });
  }
});

export default router;
