/**
 * Demand tab / Trending rail / Business Advisor (ratified §10/§11/§12 build, decision-maker
 * approved Aug 9 2026, foundations from migration 189's `demand_signal_events`).
 *
 * §13 governs this whole file: every number here is derived from real rows in
 * `demand_signal_events` / TravelPulse tables / the earner's own catalog — no invented counts,
 * crowd levels, or events. A market with no matching rows renders `null`/empty honestly rather
 * than falling back to another market's data.
 *
 * `logDemandSignal()` is the ONE writer entry point for `demand_signal_events` — imported by
 * `server/routes/advisor.routes.ts` (stay_anchor_miss, no_stay_flag) and
 * `server/routes/content.routes.ts` (places_fallthrough). It is fire-and-forget by design: it
 * never throws synchronously and its promise chain is always `.catch()`-terminated, so a signal
 * write can never fail the host request it's piggybacking on.
 */
import { Router } from "express";
import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { and, eq, gte, ilike, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { getUserId } from "../utils/auth";
import { isAuthenticated } from "../replit_integrations/auth";
import { aiRateLimit } from "../middleware/rateLimiter";
import { trackAICost, calculateAnthropicCost } from "../services/ai-cost-tracker";
import {
  demandSignalEvents,
  providerServices,
  destinationSeasons,
  destinationEvents,
  shortLinks,
  serviceBookings,
  DEMAND_SIGNAL_EVENT_KINDS,
  type DemandSignalEventKind,
} from "@shared/schema";
import { isClassifiable, isPlaceAnchored, isArtifactDelivery } from "@shared/service-fundamentals";

const router = Router();

// ─── Writer entry point (shared by advisor.routes.ts + content.routes.ts) ─────────────────────

export interface DemandSignalWrite {
  kind: DemandSignalEventKind;
  market?: string | null;
  category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  context?: Record<string, unknown> | null;
}

/**
 * Fire-and-forget append to `demand_signal_events`. Never throws, never awaited by callers —
 * a signal write is a side-observation of a real occurrence (§13), never load-bearing for the
 * request it rides along with.
 */
export function logDemandSignal(evt: DemandSignalWrite): void {
  try {
    db.insert(demandSignalEvents)
      .values({
        kind: evt.kind,
        market: evt.market ?? null,
        category: evt.category ?? null,
        latitude: evt.latitude != null ? String(evt.latitude) : null,
        longitude: evt.longitude != null ? String(evt.longitude) : null,
        context: evt.context ?? null,
      })
      .catch((err) => console.error(`[demand-signal] write failed (${evt.kind}):`, err));
  } catch (err) {
    console.error(`[demand-signal] write failed (${evt.kind}):`, err);
  }
}

// ─── Market derivation (session earner's own catalog, contains-match on city) ─────────────────

/** Most common non-empty `provider_services.city` among the session user's own listings, or
 *  null when they have no services / none carry a city — honest absence, never a guess. */
async function deriveMarket(userId: string): Promise<string | null> {
  const rows = await db
    .select({ city: providerServices.city })
    .from(providerServices)
    .where(eq(providerServices.userId, userId));

  const counts = new Map<string, number>();
  for (const r of rows) {
    const c = (r.city ?? "").trim();
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [city, count] of Array.from(counts.entries())) {
    if (count > bestCount) {
      best = city;
      bestCount = count;
    }
  }
  return best;
}

// ─── Signals (demand_signal_events, grouped by kind, >=3-event honesty threshold) ──────────────

const SIGNAL_MIN_EVENTS = 3;

const SIGNAL_LABELS: Record<DemandSignalEventKind, string> = {
  stay_anchor_miss: "Trips built here found no platform stays nearby",
  places_fallthrough: "Experience searches fell through to outside sources",
  no_stay_flag: "Trips were flagged for missing lodging",
  search_unfilled: "Searches came back with no results",
};

export interface DemandSignalRow {
  kind: DemandSignalEventKind;
  label: string;
  count: number;
  detail?: string;
}

/**
 * Grouped counts per kind for the market, filtered to kinds with >= SIGNAL_MIN_EVENTS rows
 * (spec: "signals need >=3 events per kind else omitted"). `lowSignal` is true whenever nothing
 * cleared the threshold — the client renders its "not enough signal yet" line off that one flag,
 * whether the underlying cause was zero events or just not enough of them (both are honestly
 * "not enough" from the trending surface's point of view).
 */
async function getDemandSignals(market: string): Promise<{ signals: DemandSignalRow[]; lowSignal: boolean }> {
  const rows = await db
    .select({
      kind: demandSignalEvents.kind,
      category: demandSignalEvents.category,
      cnt: sql<number>`count(*)::int`,
    })
    .from(demandSignalEvents)
    .where(ilike(demandSignalEvents.market, market))
    .groupBy(demandSignalEvents.kind, demandSignalEvents.category);

  const byKind = new Map<string, { total: number; categories: Map<string, number> }>();
  for (const r of rows) {
    const entry = byKind.get(r.kind) ?? { total: 0, categories: new Map<string, number>() };
    entry.total += Number(r.cnt) || 0;
    if (r.category) entry.categories.set(r.category, (entry.categories.get(r.category) ?? 0) + (Number(r.cnt) || 0));
    byKind.set(r.kind, entry);
  }

  const signals: DemandSignalRow[] = [];
  for (const kind of DEMAND_SIGNAL_EVENT_KINDS) {
    const entry = byKind.get(kind);
    if (!entry || entry.total < SIGNAL_MIN_EVENTS) continue;
    let detail: string | undefined;
    if (entry.categories.size > 0) {
      const [topCategory, topCount] = Array.from(entry.categories.entries()).sort((a, b) => b[1] - a[1])[0];
      detail = `most often: ${topCategory} (${topCount})`;
    }
    signals.push({ kind, label: SIGNAL_LABELS[kind], count: entry.total, detail });
  }
  return { signals, lowSignal: signals.length === 0 };
}

// ─── Crowd / seasonality (destination_seasons monthly rows — TravelPulse city-card rail) ───────

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface CrowdMonthRow {
  month: number;
  monthLabel: string;
  crowdLevel: string | null;
  rating: string | null;
}

/** destination_seasons rows for the market (city contains-match, case-insensitive), ordered by
 *  month. Null when the market has no city-level rows — real gap in the seed, not hidden (§13). */
async function getCrowd(market: string): Promise<CrowdMonthRow[] | null> {
  const rows = await db
    .select({ month: destinationSeasons.month, crowdLevel: destinationSeasons.crowdLevel, rating: destinationSeasons.rating })
    .from(destinationSeasons)
    .where(ilike(destinationSeasons.city, market))
    .orderBy(destinationSeasons.month);

  if (rows.length === 0) return null;
  return rows.map((r) => ({
    month: r.month,
    monthLabel: MONTH_LABELS[((r.month - 1) % 12 + 12) % 12] ?? String(r.month),
    crowdLevel: r.crowdLevel,
    rating: r.rating,
  }));
}

// ─── Upcoming events (destination_events, approved only) ───────────────────────────────────────

export interface UpcomingEventRow {
  id: string;
  title: string;
  eventType: string | null;
  startMonth: number | null;
  endMonth: number | null;
  specificDate: string | null;
}

/** Approved destination_events for the market. A dated event counts as "upcoming" only when its
 *  date is still ahead of today; a recurring month-scoped event (no specific date) is always
 *  "upcoming" somewhere in the annual cycle. Null when nothing matches (§13 — never invented). */
async function getUpcomingEvents(market: string): Promise<UpcomingEventRow[] | null> {
  const now = new Date();
  const rows = await db
    .select({
      id: destinationEvents.id,
      title: destinationEvents.title,
      eventType: destinationEvents.eventType,
      startMonth: destinationEvents.startMonth,
      endMonth: destinationEvents.endMonth,
      specificDate: destinationEvents.specificDate,
      isRecurring: destinationEvents.isRecurring,
    })
    .from(destinationEvents)
    .where(and(ilike(destinationEvents.city, market), eq(destinationEvents.status, "approved")));

  const upcoming = rows
    .filter((r) => {
      if (r.specificDate) return new Date(r.specificDate as unknown as string) >= now;
      return !!(r.isRecurring && r.startMonth);
    })
    .sort((a, b) => (a.startMonth ?? 99) - (b.startMonth ?? 99))
    .map((r) => ({
      id: r.id,
      title: r.title,
      eventType: r.eventType,
      startMonth: r.startMonth,
      endMonth: r.endMonth,
      specificDate: r.specificDate as unknown as string | null,
    }));

  return upcoming.length > 0 ? upcoming : null;
}

router.get("/api/me/demand-signals", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const market = await deriveMarket(userId);
    if (!market) {
      return res.json({ market: null, lowSignal: true, signals: [], crowd: null, events: null });
    }

    const [{ signals, lowSignal }, crowd, events] = await Promise.all([
      getDemandSignals(market),
      getCrowd(market),
      getUpcomingEvents(market),
    ]);

    res.json({ market, lowSignal, signals, crowd, events });
  } catch (error) {
    console.error("[demand] demand-signals error:", error);
    res.status(500).json({ message: "Failed to load demand signals" });
  }
});

// ─── Business Advisor facts assembly (listing health + benchmarks + link stats + demand) ───────

// Checks mirrored per service: photo, description, pricing, approval (universal) + exact_pin
// (place-anchored services only — D2 method-aware fundamentals, shared/service-fundamentals.ts;
// availability is not mirrored here, matching provider-listing-health.routes.ts's own omission
// posture) + delivery_asset (artifact-delivery services only — pdf; D3). The per-service
// applicable count is computed in the loop — no fixed constant.
const DESCRIPTION_MIN_LENGTH = 80;

interface ListingHealthSummary {
  serviceCount: number;
  passed: number;
  total: number;
  topGaps: Array<{ key: string; count: number }>;
}

/**
 * Mirrors the per-service checks in `server/routes/provider-listing-health.routes.ts`
 * (GET /api/provider/services/health: photo, exact_pin, description, pricing, availability,
 * approval) into a single business-advisor-facing aggregate. That route doesn't export its
 * handler as a callable service (route stays the source of truth for the per-listing UI), so
 * this is a minimal, deliberately kept-in-sync-by-hand reuse — see that file for the canonical
 * per-check definitions. §18: explicit column list, revenueShareRate never selected.
 */
async function getListingHealthSummary(userId: string): Promise<ListingHealthSummary | null> {
  const rows = await db
    .select({
      id: providerServices.id,
      description: providerServices.description,
      price: providerServices.price,
      approvalStatus: providerServices.approvalStatus,
      serviceImage: providerServices.serviceImage,
      galleryImages: providerServices.galleryImages,
      latitude: providerServices.latitude,
      longitude: providerServices.longitude,
      locationPrecision: providerServices.locationPrecision,
      deliveryMethod: providerServices.deliveryMethod,
      productShape: providerServices.productShape,
      serviceFile: providerServices.serviceFile,
    })
    .from(providerServices)
    .where(eq(providerServices.userId, userId));

  if (rows.length === 0) return null;

  const gapCounts: Record<string, number> = { photo: 0, exact_pin: 0, description: 0, pricing: 0, approval: 0, delivery_asset: 0 };
  let passedTotal = 0;
  let applicableTotal = 0;

  for (const s of rows) {
    const gallery = Array.isArray(s.galleryImages) ? s.galleryImages : [];
    const hasPhoto = !!(s.serviceImage && s.serviceImage.trim().length > 0) || gallery.length > 0;
    const descOk = (s.description ?? "").trim().length >= DESCRIPTION_MIN_LENGTH;
    const priceNum = s.price == null ? NaN : Number(s.price);
    const priceOk = Number.isFinite(priceNum) && priceNum > 0;
    const approvalOk = s.approvalStatus === "approved";

    const rowChecks = [hasPhoto, descOk, priceOk, approvalOk];

    // exact_pin only counts for/against place-anchored services (D2); an unclassifiable row
    // keeps the historical behavior, same as the canonical route.
    const shape = { deliveryMethod: s.deliveryMethod, productShape: s.productShape };
    if (!isClassifiable(shape) || isPlaceAnchored(shape)) {
      const hasCoords = s.latitude != null && s.longitude != null;
      const isExact = hasCoords && s.locationPrecision === "exact";
      rowChecks.push(isExact);
      if (!isExact) gapCounts.exact_pin++;
    }

    // delivery_asset (D3): artifact-delivery services only (pdf) — same applicability-gated
    // shape as exact_pin above. No entry at all for a non-applicable row.
    if (isArtifactDelivery(shape)) {
      const hasFile = !!(s.serviceFile && s.serviceFile.trim().length > 0);
      rowChecks.push(hasFile);
      if (!hasFile) gapCounts.delivery_asset++;
    }

    if (!hasPhoto) gapCounts.photo++;
    if (!descOk) gapCounts.description++;
    if (!priceOk) gapCounts.pricing++;
    if (!approvalOk) gapCounts.approval++;

    applicableTotal += rowChecks.length;
    passedTotal += rowChecks.filter(Boolean).length;
  }

  const topGaps = Object.entries(gapCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, count]) => ({ key, count }));

  return { serviceCount: rows.length, passed: passedTotal, total: applicableTotal, topGaps };
}

interface BenchmarkFacts {
  activeServiceCount: number;
  totalRevenue: number;
  totalBookings: number;
  avgBookingValue: number;
  status: "ok" | "no_data";
  sampleSize: number;
  categoryAvg: number | null;
  topPerformerAvg: number | null;
}

/**
 * Mirrors GET /api/provider/analytics/dashboard's benchmark computation (server/routes.ts) —
 * primary category by mode among the caller's own listings, compared against OTHER providers'
 * approved+active priced listings in that category. Below a 5-listing sample the numbers are
 * too noisy to be honest, so `status: "no_data"` with no fabricated fallback (§13), same posture
 * as the source endpoint.
 */
async function getBenchmarkFacts(userId: string): Promise<BenchmarkFacts> {
  const services = await db
    .select({
      categoryId: providerServices.categoryId,
      totalRevenue: providerServices.totalRevenue,
      bookingsCount: providerServices.bookingsCount,
      status: providerServices.status,
    })
    .from(providerServices)
    .where(eq(providerServices.userId, userId));

  const totalRevenue = services.reduce((sum, s) => sum + Number(s.totalRevenue || 0), 0);
  const totalBookings = services.reduce((sum, s) => sum + (s.bookingsCount || 0), 0);

  const categoryCounts = new Map<string, number>();
  for (const s of services) {
    if (s.categoryId) categoryCounts.set(s.categoryId, (categoryCounts.get(s.categoryId) ?? 0) + 1);
  }
  let primaryCategoryId: string | null = null;
  let primaryCategoryCount = 0;
  for (const [catId, cnt] of Array.from(categoryCounts.entries())) {
    if (cnt > primaryCategoryCount) {
      primaryCategoryId = catId;
      primaryCategoryCount = cnt;
    }
  }

  let sampleSize = 0;
  let categoryAvg: number | null = null;
  let topPerformerAvg: number | null = null;
  if (primaryCategoryId) {
    const statsResult = await db.execute(sql`
      WITH priced AS (
        SELECT price::numeric AS price
        FROM provider_services
        WHERE category_id = ${primaryCategoryId}
          AND approval_status = 'approved'
          AND status = 'active'
          AND user_id != ${userId}
          AND price IS NOT NULL
      ),
      stats AS (
        SELECT
          COUNT(*)::int AS sample_size,
          AVG(price) AS category_avg,
          percentile_cont(0.75) WITHIN GROUP (ORDER BY price) AS p75
        FROM priced
      )
      SELECT
        s.sample_size,
        s.category_avg,
        (SELECT AVG(price) FROM priced WHERE price >= s.p75) AS top_quartile_avg
      FROM stats s
    `);
    const row = statsResult.rows?.[0] as any;
    sampleSize = row ? Number(row.sample_size) || 0 : 0;
    if (sampleSize >= 5) {
      categoryAvg = row.category_avg != null ? Math.round(Number(row.category_avg)) : null;
      topPerformerAvg = row.top_quartile_avg != null ? Math.round(Number(row.top_quartile_avg)) : null;
    }
  }

  return {
    activeServiceCount: services.filter((s) => s.status === "active").length,
    totalRevenue,
    totalBookings,
    avgBookingValue: totalBookings > 0 ? totalRevenue / totalBookings : 0,
    status: sampleSize >= 5 ? "ok" : "no_data",
    sampleSize,
    categoryAvg,
    topPerformerAvg,
  };
}

interface LinkStatsFacts {
  totalClicks: number;
  totalBookings: number;
  totalRevenue: number;
  conversionRate: number | null;
}

/**
 * Mirrors GET /api/me/link-analytics's totals (server/routes/short-links.routes.ts) — the
 * widest range that rail offers (365 days), the closest honest approximation of "lifetime" for
 * bookings/revenue (clicks themselves ARE a true lifetime counter server-side).
 */
async function getLinkStatsFacts(userId: string): Promise<LinkStatsFacts> {
  const links = await db.select({ code: shortLinks.code, clicks: shortLinks.clicks }).from(shortLinks).where(eq(shortLinks.ownerUserId, userId));
  if (links.length === 0) return { totalClicks: 0, totalBookings: 0, totalRevenue: 0, conversionRate: null };

  const codes = links.map((l) => l.code);
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const bookingRows = await db
    .select({
      bookings: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${serviceBookings.totalAmount}), 0)::numeric`,
    })
    .from(serviceBookings)
    .where(and(eq(serviceBookings.providerId, userId), inArray(serviceBookings.acquisitionRef, codes), gte(serviceBookings.createdAt, since)));

  const totalClicks = links.reduce((sum, l) => sum + (l.clicks ?? 0), 0);
  const totalBookings = Number(bookingRows[0]?.bookings ?? 0);
  const totalRevenue = Number(bookingRows[0]?.revenue ?? 0);

  return { totalClicks, totalBookings, totalRevenue, conversionRate: totalClicks > 0 ? totalBookings / totalClicks : null };
}

interface BusinessAdvisorFacts {
  market: string | null;
  listingHealth: ListingHealthSummary | null;
  benchmarks: BenchmarkFacts;
  linkStats: LinkStatsFacts;
  demand: { signals: DemandSignalRow[]; crowd: CrowdMonthRow[] | null; events: UpcomingEventRow[] | null };
}

/** Assembles the FACTS object server-side and a stable factsHash over it, in one pass — mirrors
 *  assembleFacts() in advisor.routes.ts's narration pattern (no AI call here). */
async function assembleBusinessAdvisorFacts(userId: string): Promise<{ facts: BusinessAdvisorFacts; factsHash: string }> {
  const market = await deriveMarket(userId);
  const [listingHealth, benchmarks, linkStats, demandResult, crowd, events] = await Promise.all([
    getListingHealthSummary(userId),
    getBenchmarkFacts(userId),
    getLinkStatsFacts(userId),
    market ? getDemandSignals(market) : Promise.resolve({ signals: [] as DemandSignalRow[], lowSignal: true }),
    market ? getCrowd(market) : Promise.resolve(null),
    market ? getUpcomingEvents(market) : Promise.resolve(null),
  ]);

  const facts: BusinessAdvisorFacts = {
    market,
    listingHealth,
    benchmarks,
    linkStats,
    demand: { signals: demandResult.signals, crowd, events },
  };
  const factsHash = crypto.createHash("sha1").update(JSON.stringify(facts)).digest("hex");
  return { facts, factsHash };
}

// Process-lifetime cache only (same honest posture as advisor.routes.ts's narrationCache — a
// server restart clears every entry; the next request simply regenerates and re-caches).
const businessAdvisorCache = new Map<string, { factsHash: string; narration: string; generatedAt: string }>();

const BUSINESS_ADVISOR_SYSTEM_PROMPT = `You are a business advisor for a travel-services provider/expert on this platform. You will be given a JSON object of computed facts about their business: listing health checks across their catalog, price/booking benchmarks against comparable listings in their category, their referral-link performance, and local demand signals from real traveler search/build activity in their market (crowd/seasonality data and upcoming destination events where available). Write 3-5 sentences of concrete, prioritized advice for the PROVIDER/EXPERT running this business.

Rules:
- Use ONLY the facts provided. NEVER invent a number, category, place, or fact not present in the facts object.
- If listingHealth.topGaps is non-empty, mention closing the biggest gap first.
- If benchmarks.status is "no_data", say so honestly rather than comparing to a number.
- If demand.signals is non-empty, connect at least one signal to a concrete next step.
- Write plain prose. No markdown, no bullet lists, no headers.`;

router.post("/api/me/business-advisor", aiRateLimit, isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { facts, factsHash } = await assembleBusinessAdvisorFacts(userId);

    // Transparency + testability: assembled facts with no AI call — mirrors advisor.routes.ts's
    // `?factsOnly=1` seam for verifying fact assembly independent of model access.
    if (req.query.factsOnly === "1") {
      return res.json({ facts, factsHash });
    }

    const cached = businessAdvisorCache.get(userId);
    if (cached && cached.factsHash === factsHash) {
      return res.json({ narration: cached.narration, generatedAt: cached.generatedAt, cached: true, stale: false });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(502).json({ message: "Advice unavailable right now" });
    }

    let narration: string;
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 400,
        system: BUSINESS_ADVISOR_SYSTEM_PROMPT,
        messages: [{ role: "user", content: JSON.stringify(facts) }],
      });

      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;
      if (inputTokens > 0 || outputTokens > 0) {
        trackAICost({
          sourceType: "business_advisor",
          modelUsed: "claude-sonnet-4-5",
          userId,
          costUsd: calculateAnthropicCost(inputTokens, outputTokens),
          tokensIn: inputTokens,
          tokensOut: outputTokens,
        }).catch((err) => console.error("[business-advisor] cost tracking failed:", err));
      }

      const textBlock = response.content.find((b) => b.type === "text");
      const text = textBlock && "text" in textBlock ? textBlock.text.trim() : "";
      if (!text) throw new Error("Empty narration response");
      narration = text;
    } catch (err) {
      console.error("[business-advisor] AI call failed:", err);
      // Failure -> nothing cached, keyless/failure both surface the same honest 502.
      return res.status(502).json({ message: "Advice unavailable right now" });
    }

    const generatedAt = new Date().toISOString();
    businessAdvisorCache.set(userId, { factsHash, narration, generatedAt });
    res.json({ narration, generatedAt, factsHash, cached: false });
  } catch (error) {
    console.error("[demand] business-advisor POST error:", error);
    res.status(500).json({ message: "Failed to generate business advice" });
  }
});

// GET is free — no AI call ever. Facts are reassembled (DB reads only) purely to compute the
// current factsHash so staleness can be reported against whatever is cached. 204 when nothing
// has ever been generated for this session earner (client renders the "Get advice" button).
router.get("/api/me/business-advisor", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const cached = businessAdvisorCache.get(userId);
    if (!cached) return res.status(204).end();

    const { factsHash } = await assembleBusinessAdvisorFacts(userId);
    res.json({ narration: cached.narration, generatedAt: cached.generatedAt, stale: cached.factsHash !== factsHash });
  } catch (error) {
    console.error("[demand] business-advisor GET error:", error);
    res.status(500).json({ message: "Failed to fetch business advice" });
  }
});

export default router;
