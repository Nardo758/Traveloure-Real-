import { Router } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { crossSellEvents, serviceBookings, providerServices } from "@shared/schema";
import { db } from "../db";
import { eq, and, inArray, sql, desc, count } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

async function requireAdmin(req: any, res: any): Promise<boolean> {
  const userId = req.user?.claims?.sub;
  if (!userId) { res.status(401).json({ message: "Unauthorized" }); return false; }
  const user = await storage.getUser(userId);
  if (!user || user.role !== "admin") { res.status(403).json({ message: "Admin access required" }); return false; }
  return true;
}

// ── schemas ───────────────────────────────────────────────────────────────────

const crossSellEventSchema = z.object({
  eventType: z.enum(["impression", "click", "conversion"]),
  sourceContentType: z.string().min(1),
  sourceContentId: z.string().min(1),
  sourceContentName: z.string().optional(),
  targetServiceId: z.string().min(1),
  city: z.string().optional(),
  neighborhood: z.string().optional(),
  sessionId: z.string().optional(),
});

// ── POST /api/cross-sell-events ───────────────────────────────────────────────
// Anonymous — accepts a single event or a batch array.
// Attaches user_id when the request is authenticated.
router.post("/api/cross-sell-events", async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub ?? null;

    const body = req.body;
    const events = Array.isArray(body) ? body : [body];

    const parsed = z.array(crossSellEventSchema).safeParse(events);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid event data", errors: parsed.error.flatten() });
    }

    const rows = parsed.data.map((e) => ({
      eventType: e.eventType,
      sourceContentType: e.sourceContentType,
      sourceContentId: e.sourceContentId,
      sourceContentName: e.sourceContentName ?? null,
      targetServiceId: e.targetServiceId,
      city: e.city ?? null,
      neighborhood: e.neighborhood ?? null,
      userId,
      sessionId: e.sessionId ?? null,
    }));

    await storage.recordCrossSellEvents(rows);
    res.status(201).json({ recorded: rows.length });
  } catch (err: any) {
    console.error("[cross-sell] insert error:", err);
    res.status(500).json({ message: "Failed to record events" });
  }
});

// ── GET /api/cross-sell-events/provider-stats ─────────────────────────────────
// Auth required. Returns cross-sell performance for the authenticated provider's services.
router.get("/api/cross-sell-events/provider-stats", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub ?? (req as any).user?.id;

    // providerServices uses userId (not providerId) as the owner FK
    const serviceIds = await storage.getProviderServiceIdsForUser(userId);
    if (serviceIds.length === 0) {
      return res.json({ impressions: 0, clicks: 0, ctr: 0, conversions: 0, byService: [] });
    }

    // Aggregate counts per event type for these services
    const stats = await db
      .select({
        eventType: crossSellEvents.eventType,
        targetServiceId: crossSellEvents.targetServiceId,
        cnt: count(),
      })
      .from(crossSellEvents)
      .where(inArray(crossSellEvents.targetServiceId, serviceIds))
      .groupBy(crossSellEvents.eventType, crossSellEvents.targetServiceId);

    // Count cross-sell attributed bookings for these services
    const csBookings = await db
      .select({ cnt: count() })
      .from(serviceBookings)
      .where(
        and(
          inArray(serviceBookings.serviceId, serviceIds),
          eq(serviceBookings.source, "cross_sell")
        )
      );
    const conversionCount = Number(csBookings[0]?.cnt ?? 0);

    let totalImpressions = 0;
    let totalClicks = 0;
    const byServiceMap: Record<string, { impressions: number; clicks: number; conversions: number }> = {};

    for (const row of stats) {
      const sid = row.targetServiceId;
      if (!byServiceMap[sid]) byServiceMap[sid] = { impressions: 0, clicks: 0, conversions: 0 };
      const n = Number(row.cnt);
      if (row.eventType === "impression") { byServiceMap[sid].impressions += n; totalImpressions += n; }
      if (row.eventType === "click") { byServiceMap[sid].clicks += n; totalClicks += n; }
      if (row.eventType === "conversion") { byServiceMap[sid].conversions += n; }
    }

    // Enrich with service names
    const serviceDetails = await db
      .select({ id: providerServices.id, serviceName: providerServices.serviceName })
      .from(providerServices)
      .where(inArray(providerServices.id, serviceIds));

    const nameMap: Record<string, string> = {};
    for (const s of serviceDetails) nameMap[s.id] = s.serviceName ?? "Unnamed";

    const byService = Object.entries(byServiceMap).map(([id, data]) => ({
      serviceId: id,
      serviceName: nameMap[id] ?? id,
      ...data,
      ctr: data.impressions > 0 ? +(data.clicks / data.impressions * 100).toFixed(1) : 0,
    }));

    res.json({
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr: totalImpressions > 0 ? +(totalClicks / totalImpressions * 100).toFixed(1) : 0,
      conversions: conversionCount,
      byService,
    });
  } catch (err: any) {
    console.error("[cross-sell] provider-stats error:", err);
    res.status(500).json({ message: "Failed to fetch cross-sell stats" });
  }
});

// ── GET /api/admin/cross-sell/funnel ─────────────────────────────────────────
// Admin only. Platform-wide cross-sell funnel with optional ?city= filter.
// When a city filter is supplied, bookings are also filtered to services seen
// in that city's cross-sell events to keep the funnel metrics consistent.
router.get("/api/admin/cross-sell/funnel", isAuthenticated, async (req, res) => {
  const isAdmin = await requireAdmin(req, res);
  if (!isAdmin) return;

  try {
    const { city } = req.query;
    const cityFilter = city && city !== "all" ? (city as string) : undefined;

    const eventCityFilter = cityFilter ? eq(crossSellEvents.city, cityFilter) : undefined;

    // Overall funnel counts (city-scoped)
    const funnelRows = await db
      .select({ eventType: crossSellEvents.eventType, cnt: count() })
      .from(crossSellEvents)
      .where(eventCityFilter)
      .groupBy(crossSellEvents.eventType);

    const funnel: Record<string, number> = { impression: 0, click: 0, conversion: 0 };
    for (const r of funnelRows) funnel[r.eventType] = Number(r.cnt);

    // Cross-sell bookings — city-consistent:
    // When city filter is active, scope to services that received cross-sell events
    // in that city so the conversion rate is meaningful.
    let bookingsCount = 0;
    if (cityFilter) {
      const cityServiceRows = await db
        .selectDistinct({ sid: crossSellEvents.targetServiceId })
        .from(crossSellEvents)
        .where(eq(crossSellEvents.city, cityFilter));
      const cityServiceIds = cityServiceRows.map((r) => r.sid);
      if (cityServiceIds.length > 0) {
        const csBookingRows = await db
          .select({ cnt: count() })
          .from(serviceBookings)
          .where(
            and(
              inArray(serviceBookings.serviceId, cityServiceIds),
              eq(serviceBookings.source, "cross_sell")
            )
          );
        bookingsCount = Number(csBookingRows[0]?.cnt ?? 0);
      }
    } else {
      const csBookingRows = await db
        .select({ cnt: count() })
        .from(serviceBookings)
        .where(eq(serviceBookings.source, "cross_sell"));
      bookingsCount = Number(csBookingRows[0]?.cnt ?? 0);
    }

    // Top source content types (by clicks, city-scoped)
    const topSourceTypes = await db
      .select({ sourceContentType: crossSellEvents.sourceContentType, clicks: count() })
      .from(crossSellEvents)
      .where(
        eventCityFilter
          ? and(eq(crossSellEvents.eventType, "click"), eventCityFilter)
          : eq(crossSellEvents.eventType, "click")
      )
      .groupBy(crossSellEvents.sourceContentType)
      .orderBy(desc(count()))
      .limit(10);

    // Top clicked services (city-scoped)
    const topServices = await db
      .select({ targetServiceId: crossSellEvents.targetServiceId, clicks: count() })
      .from(crossSellEvents)
      .where(
        eventCityFilter
          ? and(eq(crossSellEvents.eventType, "click"), eventCityFilter)
          : eq(crossSellEvents.eventType, "click")
      )
      .groupBy(crossSellEvents.targetServiceId)
      .orderBy(desc(count()))
      .limit(10);

    // Enrich top services with names
    const topServiceIds = topServices.map((s) => s.targetServiceId);
    const serviceNames =
      topServiceIds.length > 0
        ? await db
            .select({ id: providerServices.id, serviceName: providerServices.serviceName })
            .from(providerServices)
            .where(inArray(providerServices.id, topServiceIds))
        : [];
    const nameMap: Record<string, string> = {};
    for (const s of serviceNames) nameMap[s.id] = s.serviceName ?? s.id;

    // Available cities for the filter dropdown
    const cities = await db
      .selectDistinct({ city: crossSellEvents.city })
      .from(crossSellEvents)
      .where(sql`${crossSellEvents.city} IS NOT NULL`)
      .orderBy(crossSellEvents.city)
      .limit(50);

    res.json({
      funnel: {
        impressions: funnel.impression,
        clicks: funnel.click,
        conversions: funnel.conversion,
        bookings: bookingsCount,
        clickThroughRate: funnel.impression > 0
          ? +(funnel.click / funnel.impression * 100).toFixed(1)
          : 0,
        conversionRate: funnel.click > 0
          ? +(bookingsCount / funnel.click * 100).toFixed(1)
          : 0,
      },
      topSourceTypes: topSourceTypes.map((r) => ({
        sourceContentType: r.sourceContentType,
        clicks: Number(r.clicks),
      })),
      topServices: topServices.map((r) => ({
        serviceId: r.targetServiceId,
        serviceName: nameMap[r.targetServiceId] ?? r.targetServiceId,
        clicks: Number(r.clicks),
      })),
      cities: cities.map((c) => c.city).filter(Boolean),
    });
  } catch (err: any) {
    console.error("[cross-sell] funnel error:", err);
    res.status(500).json({ message: "Failed to fetch cross-sell funnel" });
  }
});

export default router;
