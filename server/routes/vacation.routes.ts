/**
 * vacation.routes.ts — mount: app.use(vacationRoutes)
 *
 * The ratified Vacation mode business-level flag (mockup §06b, CLAUDE.md provider back-office
 * wave, decision-maker approved Aug 9 2026, migration 189 — `users.vacation_until` /
 * `users.vacation_message`, declared in shared/models/auth.ts). Two endpoints:
 *
 *   GET   /api/me/vacation — the caller's own vacation state: {vacationUntil, vacationMessage,
 *                            active}. `active` is computed SERVER-side (vacationUntil non-null
 *                            AND in the future) so every consumer (Settings card, Dashboard
 *                            banner) reads the same derivation instead of re-implementing the
 *                            "is it still future" check client-side with clock skew.
 *   PATCH /api/me/vacation — set or clear. `vacationUntil: null` clears BOTH fields (an earner
 *                            coming back early shouldn't have to also blank the message
 *                            separately). A non-null `vacationUntil` must be a future ISO
 *                            timestamp — a past date is rejected, not silently accepted as an
 *                            already-expired flag.
 *
 * §14 (session identity only): the acting user is ALWAYS `getUserId(req)`, never `req.body`.
 * There is no `userId`/target-user field on the body schema at all — allowlist by construction.
 *
 * GOVERNING CONSTRAINT (this is a BUSINESS-level flag only): this route touches ONLY
 * `users.vacation_until` / `users.vacation_message`. It never reads, writes, or references
 * `provider_services` rows/status/approval — a provider's listings are untouched by this route;
 * enforcement of "away" lives at the read/booking surfaces that consult this flag (storefront,
 * advisor stay-anchor, checkout claim), not here and not by mutating listing state.
 */
import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import { getUserId } from "../utils/auth";
import { isAuthenticated } from "../replit_integrations/auth";

const router = Router();

function isAway(vacationUntil: Date | null): boolean {
  return !!vacationUntil && vacationUntil.getTime() > Date.now();
}

router.get("/api/me/vacation", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const [me] = await db
      .select({ vacationUntil: users.vacationUntil, vacationMessage: users.vacationMessage })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!me) return res.status(401).json({ message: "Authentication required" });

    res.json({
      vacationUntil: me.vacationUntil ? me.vacationUntil.toISOString() : null,
      vacationMessage: me.vacationMessage ?? null,
      active: isAway(me.vacationUntil),
    });
  } catch (err) {
    console.error("[me/vacation] read error:", err);
    res.status(500).json({ message: "Failed to load vacation status" });
  }
});

// Allowlist (§19 shape): exactly the two fields this route ever writes. `vacationUntil: null`
// clears; a string is parsed as an ISO date and validated future-only below (zod's `.datetime()`
// only checks format, not "is it in the future", since that's a moving target zod can't express
// declaratively — checked in the handler against `Date.now()` at write time).
const vacationPatchSchema = z.object({
  vacationUntil: z.string().datetime().nullable(),
  vacationMessage: z.string().trim().max(200).nullable().optional(),
}).strict();

router.patch("/api/me/vacation", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const parsed = vacationPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid vacation settings", errors: parsed.error.flatten() });
    }
    const { vacationUntil, vacationMessage } = parsed.data;

    // Clearing: null vacationUntil wipes both fields regardless of what vacationMessage carries —
    // a returning earner doesn't have to separately blank a stale "back on the 24th" message.
    if (vacationUntil === null) {
      await db
        .update(users)
        .set({ vacationUntil: null, vacationMessage: null, updatedAt: new Date() })
        .where(eq(users.id, userId));
      return res.json({ vacationUntil: null, vacationMessage: null, active: false });
    }

    const until = new Date(vacationUntil);
    if (Number.isNaN(until.getTime())) {
      return res.status(400).json({ message: "vacationUntil must be a valid date" });
    }
    if (until.getTime() <= Date.now()) {
      return res.status(400).json({ message: "vacationUntil must be in the future" });
    }

    const nextMessage = vacationMessage === undefined ? undefined : vacationMessage;
    await db
      .update(users)
      .set({
        vacationUntil: until,
        // undefined (field absent from body) leaves the column untouched via drizzle's partial
        // set semantics; present (string or null) writes it.
        ...(nextMessage !== undefined ? { vacationMessage: nextMessage } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    const [row] = await db
      .select({ vacationUntil: users.vacationUntil, vacationMessage: users.vacationMessage })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    res.json({
      vacationUntil: row?.vacationUntil ? row.vacationUntil.toISOString() : null,
      vacationMessage: row?.vacationMessage ?? null,
      active: isAway(row?.vacationUntil ?? null),
    });
  } catch (err) {
    console.error("[me/vacation] write error:", err);
    res.status(500).json({ message: "Failed to save vacation settings" });
  }
});

export default router;
