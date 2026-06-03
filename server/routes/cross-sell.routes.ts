import { Router } from "express";
import { db } from "../db";
import { z } from "zod";
import { crossSellEvents, serviceBookings, providerServices } from "@shared/schema";
import { eq, and, inArray, sql, desc, count, gte } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";

const router = Router();

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

// POST /api/cross-sell-events — accepts a single event or batch array
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

    await db.insert(crossSellEvents).values(rows);
    res.status(201).json({ recorded: rows.length });
  } catch (err: any) {
    console.error("[cross-sell] insert error:", err);
    res.status(500).json({ message: "Failed to record events" });
  }
});

// GET /api/cross-sell-events/provider-stats — provider's own cross-sell performance
router.get("/api/cross-sell-events/provider-stats", isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user.claims.sub;

    // Get all service IDs owned by this provider
    const services = await db
      .select({ id: providerServices.id })
      .from(providerServices)
      .where(eq(providerServices.providerId, userId));

    const serviceIds = services.map((s) => s.id);
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

    // Count cross-sell attributed bookings
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

    // Fetch service names to enrich response
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

// GET /api/admin/cross-sell/funnel — platform-wide funnel report
router.get("/api/admin/cross-sell/funnel", isAuthenticated, async (req, res) => {
  try {
    const { city } = req.query;

    const whereClause = city
      ? eq(crossSellEvents.city, city as string)
      : undefined;

    // Overall funnel counts
    const funnelRows = await db
      .select({ eventType: crossSellEvents.eventType, cnt: count() })
      .from(crossSellEvents)
      .where(whereClause)
      .groupBy(crossSellEvents.eventType);

    const funnel: Record<string, number> = { impression: 0, click: 0, conversion: 0 };
    for (const r of funnelRows) funnel[r.eventType] = Number(r.cnt);

    // Total cross-sell bookings (from bookings table)
    const csBookingRows = await db
      .select({ cnt: count() })
      .from(serviceBookings)
      .where(eq(serviceBookings.source, "cross_sell"));
    const bookingsCount = Number(csBookingRows[0]?.cnt ?? 0);

    // Top source content types (by clicks)
    const topSourceTypes = await db
      .select({
        sourceContentType: crossSellEvents.sourceContentType,
        clicks: count(),
      })
      .from(crossSellEvents)
      .where(
        whereClause
          ? and(eq(crossSellEvents.eventType, "click"), whereClause)
          : eq(crossSellEvents.eventType, "click")
      )
      .groupBy(crossSellEvents.sourceContentType)
      .orderBy(desc(count()))
      .limit(10);

    // Top converting services (by conversion events + bookings)
    const topServices = await db
      .select({
        targetServiceId: crossSellEvents.targetServiceId,
        clicks: count(),
      })
      .from(crossSellEvents)
      .where(
        whereClause
          ? and(eq(crossSellEvents.eventType, "click"), whereClause)
          : eq(crossSellEvents.eventType, "click")
      )
      .groupBy(crossSellEvents.targetServiceId)
      .orderBy(desc(count()))
      .limit(10);

    // Fetch service names for top services
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

    // Available cities for filter
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
