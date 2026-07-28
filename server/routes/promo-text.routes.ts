/**
 * promo-text.routes.ts — GET /api/promo-text (Phase A3, mockup v9).
 *
 * Session-authenticated, owner-verified (§14: acting user from session only, never req.body/query).
 * No writes, no money. Loads the real target row server-side, gates it to its owner, and returns
 * a caption via promo-text.service.ts (AI best-effort, deterministic fallback — §13 no fabrication).
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { readyMadeTrips, users } from "@shared/schema";
import { generatePromoText, type PromoTextTarget } from "../services/promo-text.service";

const router = Router();

function sessionUserId(req: any): string | null {
  return (req.user as any)?.claims?.sub ?? (req.user as any)?.id ?? null;
}

function isAuthenticated(req: any, res: any, next: any) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

router.get("/api/promo-text", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const targetType = String(req.query.targetType ?? "");
    const targetId = req.query.targetId != null ? String(req.query.targetId) : null;

    let target: PromoTextTarget;

    if (targetType === "service") {
      if (!targetId) return res.status(400).json({ message: "targetId is required" });
      const service = await storage.getProviderServiceById(targetId);
      if (!service) return res.status(404).json({ message: "Service not found" });
      if (service.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      target = { kind: "service", serviceName: service.serviceName, city: (service as any).city ?? null };
    } else if (targetType === "ready_made") {
      if (!targetId) return res.status(400).json({ message: "targetId is required" });
      const [listing] = await db
        .select()
        .from(readyMadeTrips)
        .where(eq(readyMadeTrips.id, targetId))
        .limit(1);
      if (!listing) return res.status(404).json({ message: "Listing not found" });
      if (listing.authorId !== userId) return res.status(403).json({ message: "Forbidden" });
      target = {
        kind: "ready_made",
        title: listing.title,
        market: listing.market,
        durationDays: listing.durationDays,
        priceCents: listing.priceCents ?? null,
      };
    } else if (targetType === "storefront") {
      const [me] = await db.select({ handle: users.handle }).from(users).where(eq(users.id, userId)).limit(1);
      if (!me?.handle) return res.status(404).json({ message: "No storefront handle claimed" });
      target = { kind: "storefront", handle: me.handle };
    } else {
      return res.status(400).json({ message: "Invalid targetType" });
    }

    const result = await generatePromoText(target);
    return res.json(result);
  } catch (error: any) {
    console.error("[promo-text] generation failed:", error);
    return res.status(500).json({ message: "Failed to generate promo text" });
  }
});

export default router;
