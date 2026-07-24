import { Router } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";

/**
 * TripContext server persistence (migration 130, Trip-Strip program P2/E2).
 *
 * The client-side trip context (sessionStorage, formalized by the P1 module) dies
 * with the browser session and never crosses devices. For signed-in users the
 * context is mirrored here so planning survives restarts.
 *
 * Self-scoped: the user id comes from the session ONLY (§14 — never from the body).
 * PUT is a zod allow-list of the TripContext fields with length caps — never raw
 * req.body into the jsonb column. No money path (a draft-planning blob; every
 * charge derives server-side from its own record per §14 regardless of context).
 */
const router = Router();

function sessionUserId(req: any): string | undefined {
  return (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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
    const rows = await db.execute(
      sql`SELECT context, updated_at FROM trip_contexts WHERE user_id = ${userId} LIMIT 1`,
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
    const parsed = tripContextSchema.safeParse(req.body?.context ?? req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid trip context", issues: parsed.error.issues.slice(0, 5) });
    }
    const json = JSON.stringify(parsed.data);
    if (json.length > 32_768) {
      return res.status(413).json({ message: "Trip context too large" });
    }
    await db.execute(sql`
      INSERT INTO trip_contexts (user_id, context, updated_at)
      VALUES (${userId}, ${json}::jsonb, NOW())
      ON CONFLICT (user_id) DO UPDATE SET context = ${json}::jsonb, updated_at = NOW()
    `);
    res.json({ ok: true });
  } catch (err) {
    console.error("[TripContext] PUT failed:", err);
    res.status(500).json({ message: "Failed to save trip context" });
  }
});

export default router;
