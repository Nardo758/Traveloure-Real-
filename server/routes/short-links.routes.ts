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
 * GET  /api/me/link-analytics — S5: per-link click/booking/revenue rollup for the session earner
 *                            only (§14). See handler comment for the exact contract.
 *
 * No money path (clicks is a counter, not a charge/payout amount) — outside the §14/§15 clusters.
 */
import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { eq, and, isNull, sql, gte, inArray } from "drizzle-orm";
import { db } from "../db";
import { users, providerServices, expertTemplates, readyMadeTrips, shortLinks, serviceBookings } from "@shared/schema";

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

// S5: allow-set for the range param — no open-ended range parsing.
const RANGE_DAYS = [7, 30, 90, 365] as const;

/**
 * GET /api/me/link-analytics?days=30 — S5 earner link analytics.
 *
 * §14: session user only, never from query/body. Per-link rows join the caller's OWN
 * short_links to service_bookings by acquisition_ref, ADDITIONALLY filtered on
 * provider_id = session user — so an earner sees only conversions of THEIR OWN bookings
 * off a shared code, never another earner's sale through the same code (a code is scoped
 * to one owner already via the create-time ownership check, but this belt-and-suspenders
 * filter keeps the read honest even if that ever changes).
 *
 * Honesty note (§13): `clicks` on short_links is a lifetime counter — there is no per-day
 * click log (S5 explicitly does not build one). So `clicks` in this payload is ALWAYS
 * lifetime, while `bookings`/`revenue` respect the `days` range. The payload says so
 * explicitly (`clicksAreLifetime: true`) so the client never mislabels it as range-scoped.
 */
router.get("/api/me/link-analytics", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub ?? req.user?.id;
    const daysParsed = parseInt(String(req.query?.days ?? "30"), 10);
    const days = (RANGE_DAYS as readonly number[]).includes(daysParsed) ? daysParsed : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const links = await db
      .select({
        code: shortLinks.code,
        targetType: shortLinks.targetType,
        targetId: shortLinks.targetId,
        clicks: shortLinks.clicks,
      })
      .from(shortLinks)
      .where(eq(shortLinks.ownerUserId, userId));

    if (links.length === 0) {
      return res.json({
        range: { days, since: since.toISOString() },
        clicksAreLifetime: true,
        links: [],
        totals: { totalClicks: 0, totalBookings: 0, totalRevenue: 0, conversionRate: null },
      });
    }

    const codes = links.map((l) => l.code);
    // Single aggregate query across all of the caller's codes — bookings/revenue grouped
    // by acquisition_ref, scoped to (a) this earner's own bookings and (b) the date range.
    const bookingRows = await db
      .select({
        code: serviceBookings.acquisitionRef,
        bookings: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${serviceBookings.totalAmount}), 0)::numeric`,
      })
      .from(serviceBookings)
      .where(
        and(
          eq(serviceBookings.providerId, userId),
          inArray(serviceBookings.acquisitionRef, codes),
          gte(serviceBookings.createdAt, since),
        ),
      )
      .groupBy(serviceBookings.acquisitionRef);

    const byCode = new Map<string, { bookings: number; revenue: number }>();
    for (const row of bookingRows) {
      if (!row.code) continue;
      byCode.set(row.code, { bookings: Number(row.bookings) || 0, revenue: Number(row.revenue) || 0 });
    }

    let totalClicks = 0;
    let totalBookings = 0;
    let totalRevenue = 0;
    const rows = links.map((l) => {
      const agg = byCode.get(l.code) ?? { bookings: 0, revenue: 0 };
      totalClicks += l.clicks ?? 0;
      totalBookings += agg.bookings;
      totalRevenue += agg.revenue;
      return {
        code: l.code,
        targetType: l.targetType,
        targetId: l.targetId,
        clicks: l.clicks ?? 0,
        bookings: agg.bookings,
        revenue: agg.revenue,
      };
    });

    return res.json({
      range: { days, since: since.toISOString() },
      clicksAreLifetime: true,
      links: rows,
      totals: {
        totalClicks,
        totalBookings,
        totalRevenue,
        conversionRate: totalClicks > 0 ? totalBookings / totalClicks : null,
      },
    });
  } catch (error: any) {
    console.error("[short-links] link-analytics failed:", error);
    return res.status(500).json({ message: "Failed to load link analytics" });
  }
});

export default router;
