/**
 * short-links.routes.ts — short-link + click store (backoffice S3).
 *
 * POST /api/short-links   — owner creates (or re-fetches, deduped) a short link for one of their
 *                            OWN approved offerings, or their storefront handle. §14: owner is the
 *                            session user only, never req.body. Ownership is verified against the
 *                            target row before a link is minted — a short link can't be forged to
 *                            point at someone else's offering. Accepts an optional `frame`
 *                            (D4, migration 193) drawn from the closed SHARE_FRAMES allowlist —
 *                            NULL/omitted stays the historical untagged link, unchanged behavior.
 * PATCH /api/short-links/:id — the EXPIRY writer (docs/DECISIONS.md ruling 69 disposition 7).
 *                            Ruling 68 landed `short_links.expires_at` (migration 198) read-side
 *                            first, deliberately: ruling 61's "expired ref -> full rate" refusal
 *                            needed something to key on, and the ledger recorded that it had NO
 *                            writer. The decision-maker's disposition names the writer: **the
 *                            link's OWNER and admin, nobody else**; NULL = never expires; a set
 *                            value must be in the FUTURE. A default TTL on minting was one of the
 *                            three options and was NOT chosen — links stay perpetual by default.
 * GET  /r/:code           — public redirect + atomic click increment. Unknown code -> /discover
 *                            (never a dead 404/500 for a shared link). frame is metadata only —
 *                            redirect target and click counting are unchanged by D4.
 * GET  /api/me/link-analytics — S5: per-link click/booking/revenue rollup for the session earner
 *                            only (§14), PLUS a D4 per-frame breakdown. See handler comment for
 *                            the exact contract.
 * GET  /api/me/earnings-by-source — S6: booking count/revenue split by acquisition source
 *                            (direct | link | cross_sell) for the session earner only (§14).
 *                            See handler comment for the honesty caveat on pre-attribution rows.
 *
 * MOSTLY no money path (clicks is a counter, not a charge/payout amount; earnings-by-source reads
 * the existing booking ledger read-only, no charge/payout/earning write) — outside the §14/§15
 * clusters. ONE exception to state plainly: since ruling 68, `expires_at` BINDS IN A MONEY
 * DECISION — an expired ref is refused rails and the booking prices at the full rate. The expiry
 * writer below therefore carries the §19 posture even though it moves no amount: an explicit
 * ALLOWLIST body of exactly one field, the acting user from the session, and the owner resolved
 * from the ROW rather than from anything the client sent. Setting an expiry can only ever cost the
 * owner their own discount lane; it can never raise a traveler's price or lower a payout.
 */
import { Router } from "express";
import { getUserId } from "../utils/auth";
import crypto from "crypto";
import { z } from "zod/v4";
import { eq, and, isNull, sql, gte, inArray } from "drizzle-orm";
import { db } from "../db";
import { users, providerServices, expertTemplates, readyMadeTrips, shortLinks, serviceBookings } from "@workspace/db";
import { SHARE_FRAMES, SHARE_FRAME_LABEL, UNTAGGED_FRAME_LABEL, type ShareFrame } from "@shared/share-frames";
// Ledger 90 (FP-5, M1/M2): the ONE money-bearing status predicate every earner surface shares.
// Both aggregations below summed EVERY booking row regardless of status, so an unauthorized
// §15b claim (nothing charged, no PaymentIntent) was reported as revenue.
import { EARNING_BOOKING_STATUSES } from "@shared/booking-visibility";

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
  // D4 (migration 193): optional, closed allowlist (shared/share-frames.ts) — the real formats
  // the share-image render surface produces. Omitted -> untagged link, today's exact behavior.
  frame: z.enum(SHARE_FRAMES).optional(),
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
    const userId = getUserId(req)!;
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
    }
    const { targetType } = parsed.data;
    let targetId: string | null = parsed.data.targetId ?? null;
    const frame: ShareFrame | null = parsed.data.frame ?? null;

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

    // Dedup: one short link per (owner, targetType, targetId, frame) — a repeat request returns
    // the existing row rather than minting a second code for the same destination. D4 (migration
    // 193): frame participates in the identity so a frame-tagged request never returns the
    // untagged link and vice versa — each frame gets its OWN code, or the feature is pointless.
    const dedupWhere = and(
      eq(shortLinks.ownerUserId, userId),
      eq(shortLinks.targetType, targetType),
      targetId === null ? isNull(shortLinks.targetId) : eq(shortLinks.targetId, targetId),
      frame === null ? isNull(shortLinks.frame) : eq(shortLinks.frame, frame),
    );
    const [existing] = await db
      .select({ code: shortLinks.code, frame: shortLinks.frame })
      .from(shortLinks)
      .where(dedupWhere)
      .limit(1);
    if (existing) {
      return res.json({ code: existing.code, url: `/r/${existing.code}`, frame: existing.frame });
    }

    // Code generation: retry up to 3 times on a unique-violation race.
    let lastError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generateCode();
      try {
        const [created] = await db
          .insert(shortLinks)
          .values({ code, ownerUserId: userId, targetType, targetId, frame })
          .returning({ code: shortLinks.code, frame: shortLinks.frame });
        return res.json({ code: created.code, url: `/r/${created.code}`, frame: created.frame });
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

/**
 * PATCH /api/short-links/:id — set or clear a link's expiry (ruling 69 disposition 7).
 *
 * §19 ALLOWLIST: the body is a hand-written zod object with EXACTLY one field. Nothing else off
 * the body reaches a column — not the code, not the owner, not the target, not the click count.
 *
 * AUTHORITY: the link's OWNER, or an admin (DB role lookup on the session id, the `requireAdmin`
 * pattern — never `req.user.role`, which is a stale session snapshot, CLAUDE.md §2). Anyone else
 * gets an undifferentiated 404 so a stranger cannot enumerate link ids.
 *
 * VALUES: `null` clears the expiry (never expires — the column's own default and the behaviour of
 * every link minted before migration 198). A timestamp must parse AND be in the FUTURE: accepting
 * a past date would be a way to retire a link through a field whose name says "expires at", and a
 * retire action that pretends to be a schedule is the kind of quiet lie §13 exists to stop. An
 * owner who wants it dead now sets a moment they can see.
 */
const expirySchema = z.object({
  expiresAt: z.union([z.string().datetime({ offset: true }), z.string().datetime(), z.null()]),
});

router.patch("/api/short-links/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const parsed = expirySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Send exactly { expiresAt: <ISO timestamp> | null }",
        code: "INVALID_EXPIRY",
        errors: parsed.error.flatten(),
      });
    }

    const [link] = await db
      .select({ id: shortLinks.id, code: shortLinks.code, ownerUserId: shortLinks.ownerUserId })
      .from(shortLinks)
      .where(eq(shortLinks.id, req.params.id))
      .limit(1);
    if (!link) return res.status(404).json({ message: "Short link not found" });

    if (link.ownerUserId !== userId) {
      // Admin is the ONLY other authority the disposition names. Role from the DB, not the session.
      const [me] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
      if (me?.role !== "admin") {
        // Undifferentiated with "not found" on purpose — a non-owner learns nothing.
        return res.status(404).json({ message: "Short link not found" });
      }
    }

    let expiresAt: Date | null = null;
    if (parsed.data.expiresAt !== null) {
      const when = new Date(parsed.data.expiresAt);
      if (!Number.isFinite(when.getTime())) {
        return res.status(400).json({ message: "expiresAt is not a valid timestamp", code: "INVALID_EXPIRY" });
      }
      if (when.getTime() <= Date.now()) {
        return res.status(400).json({
          message: "An expiry must be in the future. To retire this link now, pick a moment you can see.",
          code: "EXPIRY_IN_PAST",
        });
      }
      expiresAt = when;
    }

    const [updated] = await db
      .update(shortLinks)
      .set({ expiresAt })
      .where(eq(shortLinks.id, link.id))
      .returning({ id: shortLinks.id, code: shortLinks.code, expiresAt: shortLinks.expiresAt });
    return res.json({ id: updated.id, code: updated.code, expiresAt: updated.expiresAt });
  } catch (error: any) {
    console.error("[short-links] expiry update failed:", error);
    return res.status(500).json({ message: "Failed to update the short link" });
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
 * Ledger 90 (FP-5, M2): `bookings`/`revenue` count MONEY-BEARING rows only
 * (`EARNING_BOOKING_STATUSES`, shared/booking-visibility.ts) — the same predicate the Money page,
 * the Inbox and `earnings-by-source` read. An unauthorized §15b claim is never attributed revenue.
 *
 * Honesty note (§13): `clicks` on short_links is a lifetime counter — there is no per-day
 * click log (S5 explicitly does not build one). So `clicks` in this payload is ALWAYS
 * lifetime, while `bookings`/`revenue` respect the `days` range. The payload says so
 * explicitly (`clicksAreLifetime: true`) so the client never mislabels it as range-scoped.
 *
 * D4 (migration 193) `frameBreakdown`: clicks/bookings/revenue grouped by `frame`, ruling
 * 22(d)-honest. A frame group appears ONLY when the caller actually has at least one short
 * link tagged with it — a frame with zero of the earner's links is simply absent, never a
 * zero-filled guess (§13). Legacy/generic NULL-frame links are represented too, under the
 * explicit `frame: null` / "Untagged" bucket, rather than being silently dropped or folded
 * into one of the real frames.
 */
router.get("/api/me/link-analytics", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req)!;
    const daysParsed = parseInt(String(req.query?.days ?? "30"), 10);
    const days = (RANGE_DAYS as readonly number[]).includes(daysParsed) ? daysParsed : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const links = await db
      .select({
        code: shortLinks.code,
        targetType: shortLinks.targetType,
        targetId: shortLinks.targetId,
        frame: shortLinks.frame,
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
        frameBreakdown: [],
      });
    }

    const codes = links.map((l) => l.code);
    // Single aggregate query across all of the caller's codes — bookings/revenue grouped
    // by acquisition_ref, scoped to (a) this earner's own bookings, (b) the date range, and
    // (c) MONEY-BEARING statuses only (ledger 90 / FP-5 M2).
    //
    // (c) was missing entirely until FP-5. The exercise read $0 here only by accident — the one
    // unauthorized claim on that bench carried `source='direct'` and a NULL `acquisition_ref`, so
    // it landed in no link bucket. A checkout that fails the same way AFTER a tracked-link click
    // would have reported unpaid revenue against that link: the exact number an earner uses to
    // decide where to spend. Attributed revenue must count money that exists.
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
          inArray(serviceBookings.status, [...EARNING_BOOKING_STATUSES]),
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
    // D4: frame -> aggregate, keyed by the real frame or the literal "untagged" bucket for a
    // NULL-frame (legacy or deliberately generic) link — only groups the caller actually has a
    // link for are ever emitted (§13, see handler comment above).
    const byFrame = new Map<string, { clicks: number; bookings: number; revenue: number; linkCount: number }>();
    const rows = links.map((l) => {
      const agg = byCode.get(l.code) ?? { bookings: 0, revenue: 0 };
      const clicks = l.clicks ?? 0;
      totalClicks += clicks;
      totalBookings += agg.bookings;
      totalRevenue += agg.revenue;

      const frameKey = l.frame ?? "untagged";
      const bucket = byFrame.get(frameKey) ?? { clicks: 0, bookings: 0, revenue: 0, linkCount: 0 };
      bucket.clicks += clicks;
      bucket.bookings += agg.bookings;
      bucket.revenue += agg.revenue;
      bucket.linkCount += 1;
      byFrame.set(frameKey, bucket);

      return {
        code: l.code,
        targetType: l.targetType,
        targetId: l.targetId,
        frame: l.frame,
        clicks,
        bookings: agg.bookings,
        revenue: agg.revenue,
      };
    });

    // Stable display order: the four real frames in their canonical order, then "untagged" last
    // — never reordering by volume, so the panel doesn't jump around release to release.
    const frameOrder: string[] = [...SHARE_FRAMES, "untagged"];
    const frameBreakdown = frameOrder
      .filter((key) => byFrame.has(key))
      .map((key) => {
        const bucket = byFrame.get(key)!;
        return {
          frame: key === "untagged" ? null : (key as ShareFrame),
          label: key === "untagged" ? UNTAGGED_FRAME_LABEL : SHARE_FRAME_LABEL[key as ShareFrame],
          linkCount: bucket.linkCount,
          clicks: bucket.clicks,
          bookings: bucket.bookings,
          revenue: bucket.revenue,
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
      frameBreakdown,
    });
  } catch (error: any) {
    console.error("[short-links] link-analytics failed:", error);
    return res.status(500).json({ message: "Failed to load link analytics" });
  }
});

// S6: the three acquisition buckets, in the fixed display order the client renders.
const SOURCE_BUCKETS = ["direct", "link", "cross_sell"] as const;
type SourceBucket = (typeof SOURCE_BUCKETS)[number];
const SOURCE_LABEL: Record<SourceBucket, string> = {
  direct: "Direct",
  link: "Your links",
  cross_sell: "Cross-sell",
};

/**
 * GET /api/me/earnings-by-source — S6 dashboard "earnings by source" split.
 *
 * §14: session user only, never from query/body. Groups the session earner's OWN
 * `service_bookings` (providerId = session user — this column holds the owning provider/expert's
 * userId for both roles, see payments.routes.ts checkout insert) by `source`
 * (direct | link | cross_sell, written server-side at checkout since S4/migration 141) and
 * returns booking count + gross booking revenue (`total_amount`) per bucket, lifetime — no date
 * range, no per-day breakdown; the smallest honest version of this split.
 *
 * Ledger 90 (FP-5, M1): rows are filtered to MONEY-BEARING statuses
 * (`EARNING_BOOKING_STATUSES`, shared/booking-visibility.ts) — the same predicate the Money page
 * and link-analytics read. `count` therefore means "paid bookings", not "rows on disk".
 *
 * §13 honesty note: `source` defaults to 'direct' at the column level, so every booking created
 * BEFORE S4 shipped reads 'direct' whether or not it was genuinely a direct/organic acquisition —
 * that default is a column default, not a measurement. The payload always carries
 * `preAttributionCaveat: true` (not data-derived — it is true for every earner, since the column
 * predates S4 for all of them) so the client can render the disclaimer next to "Direct" rather
 * than presenting historical 'direct' as a measured fact.
 */
router.get("/api/me/earnings-by-source", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req)!;

    const rows = await db
      .select({
        source: sql<string>`coalesce(${serviceBookings.source}, 'direct')`,
        count: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${serviceBookings.totalAmount}), 0)::numeric`,
      })
      .from(serviceBookings)
      .where(
        and(
          eq(serviceBookings.providerId, userId),
          // Ledger 90 (FP-5, M1): money-bearing statuses ONLY. Without this the panel rendered
          // "Direct · 1 booking · $95.00" for a never-charged §15b claim, on the same page whose
          // ledger correctly read $0.00.
          inArray(serviceBookings.status, [...EARNING_BOOKING_STATUSES]),
        ),
      )
      .groupBy(sql`coalesce(${serviceBookings.source}, 'direct')`);

    const bySource = new Map<string, { count: number; revenue: number }>();
    for (const row of rows) {
      bySource.set(row.source, { count: Number(row.count) || 0, revenue: Number(row.revenue) || 0 });
    }

    let totalCount = 0;
    let totalRevenue = 0;
    const buckets = SOURCE_BUCKETS.map((source) => {
      const agg = bySource.get(source) ?? { count: 0, revenue: 0 };
      totalCount += agg.count;
      totalRevenue += agg.revenue;
      return { source, label: SOURCE_LABEL[source], count: agg.count, revenue: agg.revenue };
    });

    // Any bucket outside the known vocabulary (should not happen — app-enforced, no DB CHECK)
    // is folded into the totals so the totals never silently undercount, without inventing a
    // fourth display bucket for it.
    for (const row of rows) {
      if (!(SOURCE_BUCKETS as readonly string[]).includes(row.source)) {
        totalCount += Number(row.count) || 0;
        totalRevenue += Number(row.revenue) || 0;
      }
    }

    return res.json({
      buckets,
      totals: { count: totalCount, revenue: totalRevenue },
      preAttributionCaveat: true,
    });
  } catch (error: any) {
    console.error("[short-links] earnings-by-source failed:", error);
    return res.status(500).json({ message: "Failed to load earnings by source" });
  }
});

export default router;
