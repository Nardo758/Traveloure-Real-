/**
 * short-links.routes.ts — short-link + click store (backoffice S3).
 *
 * POST /api/short-links   — owner creates (or re-fetches, deduped) a short link for one of their
 *                            OWN approved offerings, or their storefront handle. §14: owner is the
 *                            session user only, never req.body. Ownership is verified against the
 *                            target row before a link is minted — a short link can't be forged to
 *                            point at someone else's offering.
 * GET  /r/:code           — public redirect + atomic click increment. Unknown code -> /discover
 *                            (never a dead 404/500 for a shared link).
 *
 * No money path (clicks is a counter, not a charge/payout amount) — outside the §14/§15 clusters.
 */
import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { users, providerServices, expertTemplates, readyMadeTrips, shortLinks } from "@shared/schema";

const router = Router();

const isAuthenticated = (req: any, res: any, next: any) => {
  if (req.isAuthenticated?.() && req.user) return next();
  return res.status(401).json({ message: "Authentication required" });
};

const TARGET_TYPES = ["storefront", "service", "template", "ready_made"] as const;
type TargetType = (typeof TARGET_TYPES)[number];

const createSchema = z.object({
  targetType: z.enum(TARGET_TYPES),
  targetId: z.string().min(1).optional(),
});

// 8 chars from [a-z0-9] via crypto.randomBytes — collision-resistant, URL-safe, no ambiguous chars needed.
const CODE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
function generateCode(): string {
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

router.post("/api/short-links", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub ?? req.user?.id;
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
    }
    const { targetType } = parsed.data;
    let targetId: string | null = parsed.data.targetId ?? null;

    // Ownership verification BEFORE minting a link — §14-style: never trust the client's claim
    // that it owns the target, always re-check against the row itself.
    if (targetType === "storefront") {
      const [me] = await db.select({ handle: users.handle }).from(users).where(eq(users.id, userId)).limit(1);
      if (!me?.handle) {
        return res.status(403).json({ message: "Claim a storefront handle before creating a share link." });
      }
      targetId = null; // storefront links carry no target_id; the handle is resolved at redirect time
    } else if (targetType === "service") {
      if (!targetId) return res.status(400).json({ message: "targetId is required for this target type." });
      const [row] = await db
        .select({ userId: providerServices.userId })
        .from(providerServices)
        .where(eq(providerServices.id, targetId))
        .limit(1);
      if (!row || row.userId !== userId) {
        return res.status(403).json({ message: "You do not own this service." });
      }
    } else if (targetType === "template") {
      if (!targetId) return res.status(400).json({ message: "targetId is required for this target type." });
      const [row] = await db
        .select({ expertId: expertTemplates.expertId })
        .from(expertTemplates)
        .where(eq(expertTemplates.id, targetId))
        .limit(1);
      if (!row || row.expertId !== userId) {
        return res.status(403).json({ message: "You do not own this template." });
      }
    } else if (targetType === "ready_made") {
      if (!targetId) return res.status(400).json({ message: "targetId is required for this target type." });
      const [row] = await db
        .select({ authorId: readyMadeTrips.authorId })
        .from(readyMadeTrips)
        .where(eq(readyMadeTrips.id, targetId))
        .limit(1);
      if (!row || row.authorId !== userId) {
        return res.status(403).json({ message: "You do not own this Ready Made Trip." });
      }
    }

    // Dedup: one short link per (owner, targetType, targetId) — a repeat request returns the
    // existing row rather than minting a second code for the same destination.
    const dedupWhere = and(
      eq(shortLinks.ownerUserId, userId),
      eq(shortLinks.targetType, targetType),
      targetId === null ? isNull(shortLinks.targetId) : eq(shortLinks.targetId, targetId),
    );
    const [existing] = await db.select({ code: shortLinks.code }).from(shortLinks).where(dedupWhere).limit(1);
    if (existing) {
      return res.json({ code: existing.code, url: `/r/${existing.code}` });
    }

    // Code generation: retry up to 3 times on a unique-violation race.
    let lastError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generateCode();
      try {
        const [created] = await db
          .insert(shortLinks)
          .values({ code, ownerUserId: userId, targetType, targetId })
          .returning({ code: shortLinks.code });
        return res.json({ code: created.code, url: `/r/${created.code}` });
      } catch (e: any) {
        lastError = e;
        if (e?.code === "23505") continue; // unique violation on code -> retry
        throw e;
      }
    }
    console.error("[short-links] code generation exhausted retries:", lastError);
    return res.status(500).json({ message: "Failed to generate a short link. Please try again." });
  } catch (error: any) {
    console.error("[short-links] create failed:", error);
    return res.status(500).json({ message: "Failed to create short link" });
  }
});

router.get("/r/:code", async (req, res) => {
  try {
    const code = req.params.code;
    const [row] = await db
      .update(shortLinks)
      .set({ clicks: sql`${shortLinks.clicks} + 1` })
      .where(eq(shortLinks.code, code))
      .returning();
    if (!row) return res.redirect(302, "/discover");

    // S4: carry the code through as ?ref= so the SPA can capture it (client acquisition module)
    // and the checkout can attribute the booking (source='link' only when the code resolves).
    const ref = `?ref=${encodeURIComponent(row.code)}`;
    const targetType = row.targetType as TargetType;
    if (targetType === "storefront") {
      const [owner] = await db.select({ handle: users.handle }).from(users).where(eq(users.id, row.ownerUserId)).limit(1);
      if (!owner?.handle) return res.redirect(302, "/discover");
      return res.redirect(302, `/p/${owner.handle}${ref}`);
    }
    if (targetType === "service") return res.redirect(302, `/services/${row.targetId}${ref}`);
    if (targetType === "template") return res.redirect(302, `/expert-templates/${row.targetId}${ref}`);
    if (targetType === "ready_made") return res.redirect(302, `/ready-made/${row.targetId}${ref}`);
    return res.redirect(302, "/discover");
  } catch (error: any) {
    console.error("[short-links] redirect failed:", error);
    return res.redirect(302, "/discover");
  }
});

export default router;
