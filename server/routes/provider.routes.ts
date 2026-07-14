import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { users } from "@shared/schema";
import { isAuthenticated } from "../replit_integrations/auth";

/**
 * Provider supply tools — /api/provider/settings (Kyoto-supply activation).
 *
 * The provider settings page (client/src/pages/provider/settings.tsx, routed behind
 * ProtectedRoute requiredRole="provider") was a surface without a backend: it GET/PATCHes
 * /api/provider/settings, but those handlers lived in the imported-but-unmounted
 * experts.routes.ts (dark) — so the page hit the Vite catch-all (200-HTML) instead of real
 * data. This mounts them for real. The dark copies also referenced an undefined
 * `requireProviderRole`, so they would have thrown even if reached; that helper is written
 * here (DB role lookup, mirroring the EA `isEA` guard).
 *
 * NOT money-path: settings are self-scoped by userId (unique per user); PATCH is a zod
 * allow-list of the seven editable fields only (never raw req.body), so ownership/identity
 * columns can't be mass-assigned. `payoutFrequency`/`minimumPayoutAmount` are provider
 * preferences, not a charge/transfer amount — no Stripe/earning write happens here.
 *
 * The /api/provider/earnings* family (also dark) is intentionally NOT mounted here: no client
 * consumer calls it (the earnings page derives from the live /api/provider/bookings), so
 * mounting it would be a backend without a surface. Activate it alongside a real consumer.
 */
const router = Router();

/** Resolve the session user's id iff they are a provider (or admin); else 403 and return null. */
async function requireProviderRole(req: any, res: any): Promise<string | null> {
  const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
  if (!userId) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  if (!row || (row.role !== "provider" && row.role !== "admin")) {
    res.status(403).json({ message: "Provider access required" });
    return null;
  }
  return userId;
}

// The seven provider-editable settings fields (mirrors settings.tsx). Everything else — id,
// userId, updatedAt — is server-owned and never accepted from the client.
const settingsPatchSchema = z
  .object({
    instantBooking: z.boolean(),
    autoResponse: z.boolean(),
    minimumLeadTimeDays: z.number().int().min(0),
    targetResponseTimeHours: z.number().int().min(0),
    payoutFrequency: z.enum(["weekly", "biweekly", "monthly"]),
    minimumPayoutAmount: z.union([z.string(), z.number()]).transform((v) => String(v)),
    notificationsJson: z.record(z.boolean()),
  })
  .partial();

router.get("/api/provider/settings", isAuthenticated, async (req, res) => {
  try {
    const userId = await requireProviderRole(req, res);
    if (!userId) return;
    const settings = await storage.getProviderSettings(userId);
    if (!settings) {
      // Sensible defaults so a first-time provider sees the form populated (no row yet).
      return res.json({
        instantBooking: false,
        autoResponse: true,
        minimumLeadTimeDays: 7,
        targetResponseTimeHours: 2,
        payoutFrequency: "monthly",
        minimumPayoutAmount: "100",
        notificationsJson: {
          newBookings: true,
          bookingUpdates: true,
          messages: true,
          reviews: true,
          payouts: true,
          marketing: false,
        },
      });
    }
    res.json(settings);
  } catch (err) {
    console.error("[Provider] getSettings error:", err);
    res.status(500).json({ message: "Failed to get settings" });
  }
});

router.patch("/api/provider/settings", isAuthenticated, async (req, res) => {
  try {
    const userId = await requireProviderRole(req, res);
    if (!userId) return;
    // Allow-list only — never spread raw req.body (ownership/identity columns stay server-owned).
    const safeSettings = settingsPatchSchema.parse(req.body);
    const settings = await storage.upsertProviderSettings(userId, safeSettings);
    res.json(settings);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid settings", errors: err.errors });
    }
    console.error("[Provider] upsertSettings error:", err);
    res.status(500).json({ message: "Failed to save settings" });
  }
});

export default router;
