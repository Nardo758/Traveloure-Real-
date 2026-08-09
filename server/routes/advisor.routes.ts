/**
 * Advisor Phases 2-4 (server side) — expert-facing route-quality / stay-anchor / on-demand
 * narration surfaces for a trip's Workstation build. Three endpoints, all READS except the
 * narration POST which also grants readers (owner ‖ assigned expert ‖ author ‖ admin — the
 * same `authorizeTripLogistics` read gate the itinerary reads use, default `requireWriteAccess:
 * false` so a pending advisor can still see these, matching GET /itinerary/analyze etc.).
 *
 * §13 (no-fabrication) governs this whole file: every number here is derived from real rows —
 * no invented distances, prices, or neighborhood names. See inline notes at each such boundary.
 */
import { Router } from "express";
import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { getUserId } from "../utils/auth";
import { isAuthenticated } from "../replit_integrations/auth";
import { authorizeTripLogistics } from "../utils/trip-logistics-auth";
import { aiRateLimit } from "../middleware/rateLimiter";
import { db } from "../db";
import { itineraryItems, trips, transportLegs, providerServices, serviceCategories, cityNeighborhoods } from "@shared/schema";
import { eq, and, asc, isNull, isNotNull, ilike } from "drizzle-orm";
import { trackAICost, calculateAnthropicCost } from "../services/ai-cost-tracker";
// The ONE ordering algorithm the pre-existing POST /api/trips/:tripId/itinerary/optimize-order
// endpoint uses (server/routes.ts, itineraryIntelligenceService.optimizeOrder — see that file's
// header comment). Called here, not re-implemented — "one author, not two". Note honestly: this
// algorithm sorts by item type / meal timing / energy level, NOT by geographic distance, so the
// straight-line optimizedKm below can occasionally come out worse than currentKm — that is the
// correct, honest outcome of comparing against the SAME order a caller of optimize-order would
// actually get, rather than against a distance-minimizing order nobody can apply from the UI.
import { itineraryIntelligenceService } from "../services/itinerary-intelligence.service";

const router = Router();

// ─── Geometry helpers (local to this router — shared/ and the geocode util are untouched) ────

interface Coord {
  lat: number;
  lng: number;
}

/** Finite, in-range, non-(0,0) coordinate — the LOCATED-item predicate this whole file shares. */
function parseCoord(latRaw: unknown, lngRaw: unknown): Coord | null {
  if (latRaw === null || latRaw === undefined || lngRaw === null || lngRaw === undefined) return null;
  const lat = parseFloat(String(latRaw));
  const lng = parseFloat(String(lngRaw));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null; // Null Island — never a real located item
  return { lat, lng };
}

function haversineKm(a: Coord, b: Coord): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function sumRouteKm(points: Coord[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) total += haversineKm(points[i], points[i + 1]);
  return total;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─── #1 Route efficiency (shared by the endpoint AND the narration facts assembly) ────────────

interface RouteEfficiencyDay {
  dayNumber: number;
  itemCount: number;
  currentKm: number;
  optimizedKm: number;
  savingsKm: number;
  savingsPct: number;
  materiallyImprovable: boolean;
  optimizedOrder: string[];
}

async function computeRouteEfficiencyDays(tripId: string): Promise<RouteEfficiencyDay[]> {
  const items = await db
    .select()
    .from(itineraryItems)
    .where(eq(itineraryItems.tripId, tripId))
    .orderBy(asc(itineraryItems.dayNumber), asc(itineraryItems.sortOrder));

  const byDay = new Map<number, typeof items>();
  for (const it of items) {
    if (!byDay.has(it.dayNumber)) byDay.set(it.dayNumber, []);
    byDay.get(it.dayNumber)!.push(it);
  }

  const days: RouteEfficiencyDay[] = [];
  const dayNumbers = Array.from(byDay.keys()).sort((a, b) => a - b);

  for (const dayNumber of dayNumbers) {
    const dayItems = byDay.get(dayNumber)!;
    const located = dayItems
      .map((it) => ({ id: it.id, coord: parseCoord(it.latitude, it.longitude) }))
      .filter((x): x is { id: string; coord: Coord } => x.coord !== null);

    // Per spec: only days with >=3 located items are reported.
    if (located.length < 3) continue;

    const currentKm = sumRouteKm(located.map((l) => l.coord));

    // Reuse the exact ordering algorithm optimize-order uses; it operates over the FULL day
    // (including unlocated items) so we filter its output down to the located subset, preserving
    // the relative order it produced — same metric, same algorithm, honest comparison.
    const fullOrder = await itineraryIntelligenceService.optimizeOrder(tripId, dayNumber);
    const locatedIds = new Set(located.map((l) => l.id));
    const coordById = new Map(located.map((l) => [l.id, l.coord]));
    const optimizedOrder = fullOrder.filter((id) => locatedIds.has(id));
    const optimizedKm = sumRouteKm(optimizedOrder.map((id) => coordById.get(id)!));

    const savingsKmRaw = currentKm - optimizedKm;
    const savingsPctRaw = currentKm > 0 ? (savingsKmRaw / currentKm) * 100 : 0;
    const savingsKm = round1(savingsKmRaw);
    const savingsPct = round1(savingsPctRaw);

    days.push({
      dayNumber,
      itemCount: located.length,
      currentKm: round1(currentKm),
      optimizedKm: round1(optimizedKm),
      savingsKm,
      savingsPct,
      // §13: savings are only CLAIMED as material when both thresholds clear — a day below
      // threshold still appears with its real numbers, flag false (never hidden, never inflated).
      materiallyImprovable: savingsKm >= 1 && savingsPct >= 20,
      optimizedOrder,
    });
  }

  return days;
}

router.get("/api/trips/:tripId/advisor/route-efficiency", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { tripId } = req.params;
    const denied = await authorizeTripLogistics(
      tripId, userId, "GET /api/trips/:tripId/advisor/route-efficiency",
    );
    if (denied) return res.status(denied.status).json({ message: denied.message });

    const days = await computeRouteEfficiencyDays(tripId);
    res.json({ metric: "straight_line", days });
  } catch (error) {
    console.error("[advisor] route-efficiency error:", error);
    res.status(500).json({ message: "Failed to compute route efficiency" });
  }
});

// ─── #2 Stay anchor (also shared by narration facts assembly) ─────────────────────────────────

interface PlatformStay {
  providerServiceId: string;
  name: string;
  distanceKm: number;
  price?: string;
  location?: string;
}

interface StayAnchorResult {
  anchor: { lat: number; lng: number; spreadKm: number; neighborhood?: string } | null;
  platformStays: PlatformStay[];
  placesHint: { source: "google"; category: "hotels" };
}

// Lodging-shaped predicate. §16 funnel doctrine: platform inventory only, this NEVER reaches
// external listings. Grepped real data before writing this (see task notes): provider_services
// seed rows use serviceType in {consultation, planning, experience, photography, specialty,
// transportation, concierge} — none literal "hotel"/"lodging" today — while
// shared/constants/providerCategories.ts's `hotels`/`accommodations` tab mapping (the
// /api/search/experiences category bridge) keys off the words hotel/accommodation/lodging/
// resort/hostel/inn, so we match those same words case-insensitively against serviceType AND
// the joined service_categories name/slug. We ALSO treat `productShape = 'property'` as
// lodging-shaped — that column is the actual structural marker for an accommodation storefront
// listing (migration 153; "a property IS a provider_services row", server/routes/provider.routes.ts:407)
// — so a real property listing matches even before/without a text-keyword category. No serviceType
// value is invented to make this match; if the catalog has no lodging-shaped approved+active row
// with real coordinates, platformStays is honestly empty.
const LODGING_PATTERN = /hotel|lodg|accommodat|resort|hostel|\binn\b/i;

function isLodgingShaped(row: {
  serviceType: string | null;
  productShape: string | null;
  categoryName: string | null;
  categorySlug: string | null;
}): boolean {
  if (row.productShape === "property") return true;
  if (row.serviceType && LODGING_PATTERN.test(row.serviceType)) return true;
  if (row.categoryName && LODGING_PATTERN.test(row.categoryName)) return true;
  if (row.categorySlug && LODGING_PATTERN.test(row.categorySlug)) return true;
  return false;
}

async function computeStayAnchor(tripId: string): Promise<StayAnchorResult> {
  const placesHint = { source: "google" as const, category: "hotels" as const };

  const items = await db
    .select({ latitude: itineraryItems.latitude, longitude: itineraryItems.longitude })
    .from(itineraryItems)
    .where(eq(itineraryItems.tripId, tripId));

  const located = items
    .map((it) => parseCoord(it.latitude, it.longitude))
    .filter((c): c is Coord => c !== null);

  if (located.length < 2) {
    return { anchor: null, platformStays: [], placesHint };
  }

  const centroid: Coord = {
    lat: located.reduce((s, c) => s + c.lat, 0) / located.length,
    lng: located.reduce((s, c) => s + c.lng, 0) / located.length,
  };
  // "Maximum spread" = furthest located item from the centroid (a radius, not a diameter) —
  // the natural companion metric to a centroid.
  const spreadKm = round1(Math.max(...located.map((c) => haversineKm(centroid, c))));

  // Optional neighborhood name (§13 — never guessed). Only attempted when the trip's market has
  // ANY city_neighborhoods rows; that table's centroid columns are NOT NULL so "has rows" IS
  // "has usable coords" here — no separate coord-nullness check needed.
  let neighborhood: string | undefined;
  const [trip] = await db.select({ destination: trips.destination }).from(trips).where(eq(trips.id, tripId));
  const cityKey = trip?.destination ? trip.destination.split(",")[0].trim() : "";
  if (cityKey) {
    const neighborhoods = await db
      .select({
        name: cityNeighborhoods.name,
        centroidLat: cityNeighborhoods.centroidLat,
        centroidLng: cityNeighborhoods.centroidLng,
      })
      .from(cityNeighborhoods)
      .where(ilike(cityNeighborhoods.city, cityKey));

    let bestDist = Infinity;
    let bestName: string | undefined;
    for (const n of neighborhoods) {
      const c = parseCoord(n.centroidLat, n.centroidLng);
      if (!c) continue; // defensive only — column is NOT NULL, so this never actually trips
      const d = haversineKm(centroid, c);
      if (d < bestDist) {
        bestDist = d;
        bestName = n.name;
      }
    }
    if (bestName) neighborhood = bestName; // omitted entirely when the market has no rows at all
  }

  // Platform-first stays (§16): provider_services only, approved + active, real coords
  // (migration-129 columns), within 5km of the centroid, top 5 by distance.
  const rows = await db
    .select({
      id: providerServices.id,
      name: providerServices.serviceName,
      serviceType: providerServices.serviceType,
      productShape: providerServices.productShape,
      latitude: providerServices.latitude,
      longitude: providerServices.longitude,
      price: providerServices.price,
      location: providerServices.location,
      categoryName: serviceCategories.name,
      categorySlug: serviceCategories.slug,
    })
    .from(providerServices)
    .leftJoin(serviceCategories, eq(providerServices.categoryId, serviceCategories.id))
    .where(
      and(
        eq(providerServices.status, "active"),
        eq(providerServices.approvalStatus, "approved"),
        isNotNull(providerServices.latitude),
        isNotNull(providerServices.longitude),
      ),
    );

  const platformStays: PlatformStay[] = rows
    .filter((r) => isLodgingShaped(r))
    .map((r) => {
      const coord = parseCoord(r.latitude, r.longitude);
      if (!coord) return null;
      const distanceKm = haversineKm(centroid, coord);
      if (distanceKm > 5) return null;
      const stay: PlatformStay = {
        providerServiceId: r.id,
        name: r.name,
        distanceKm: round1(distanceKm),
      };
      if (r.price != null) stay.price = String(r.price);
      // `location` defaults to the literal string "Unknown" on rows that never set it — that
      // default is a column artifact, not a real place name, so it is not surfaced as one.
      if (r.location && r.location.toLowerCase() !== "unknown") stay.location = r.location;
      return stay;
    })
    .filter((s): s is PlatformStay => s !== null)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 5);

  return {
    anchor: { lat: centroid.lat, lng: centroid.lng, spreadKm, ...(neighborhood ? { neighborhood } : {}) },
    platformStays,
    placesHint,
  };
}

router.get("/api/trips/:tripId/advisor/stay-anchor", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { tripId } = req.params;
    const denied = await authorizeTripLogistics(
      tripId, userId, "GET /api/trips/:tripId/advisor/stay-anchor",
    );
    if (denied) return res.status(denied.status).json({ message: denied.message });

    const result = await computeStayAnchor(tripId);
    res.json(result);
  } catch (error) {
    console.error("[advisor] stay-anchor error:", error);
    res.status(500).json({ message: "Failed to compute stay anchor" });
  }
});

// ─── #3 On-demand narration ─────────────────────────────────────────────────────────────────

interface AdvisorDayFacts {
  dayNumber: number;
  locatedCount: number;
  unlocatedCount: number;
  legDistanceKm: number | null; // null = no confirmed trip-scoped transport legs for this day
  itemTitles: string[];
}

interface AdvisorFacts {
  tripId: string;
  days: AdvisorDayFacts[];
  routeEfficiency: RouteEfficiencyDay[];
  stayAnchor: StayAnchorResult;
}

const TITLE_BUDGET = 40;
const TITLE_MAX_LEN = 60;

/**
 * Assembles the FACTS object server-side and a stable planHash over it in one pass over the
 * trip's items (plus one for transport legs) — never re-derives the same rows twice. No AI call
 * happens in this function; both `?factsOnly=1` and the plain GET rely on that.
 */
async function assembleFacts(tripId: string): Promise<{ facts: AdvisorFacts; planHash: string }> {
  const items = await db
    .select()
    .from(itineraryItems)
    .where(eq(itineraryItems.tripId, tripId))
    .orderBy(asc(itineraryItems.dayNumber), asc(itineraryItems.sortOrder));

  // Trip-scoped, CONFIRMED legs only (variantId IS NULL is the trip-scope discriminator — see
  // server/storage.ts's identical predicate for the same table).
  const legs = await db
    .select({ dayNumber: transportLegs.dayNumber, distanceMeters: transportLegs.distanceMeters })
    .from(transportLegs)
    .where(and(eq(transportLegs.tripId, tripId), isNull(transportLegs.variantId)));

  const legKmByDay = new Map<number, number>();
  for (const leg of legs) {
    legKmByDay.set(leg.dayNumber, (legKmByDay.get(leg.dayNumber) ?? 0) + leg.distanceMeters / 1000);
  }

  const byDay = new Map<number, typeof items>();
  for (const it of items) {
    if (!byDay.has(it.dayNumber)) byDay.set(it.dayNumber, []);
    byDay.get(it.dayNumber)!.push(it);
  }
  const dayNumbers = Array.from(byDay.keys()).sort((a, b) => a - b);

  const hash = crypto.createHash("sha1");
  let titleBudget = TITLE_BUDGET;
  const days: AdvisorDayFacts[] = [];

  for (const dayNumber of dayNumbers) {
    const dayItems = byDay.get(dayNumber)!;
    let locatedCount = 0;
    const itemTitles: string[] = [];

    for (const it of dayItems) {
      // planHash inputs: item id + dayNumber + coords + updatedAt — the exact staleness surface
      // the narration should invalidate on (a move, a coordinate fix, or a re-save all count).
      const updatedAtKey = it.updatedAt instanceof Date ? it.updatedAt.toISOString() : String(it.updatedAt ?? "");
      hash.update(`${it.id}|${it.dayNumber}|${it.latitude ?? ""}|${it.longitude ?? ""}|${updatedAtKey}\n`);

      if (parseCoord(it.latitude, it.longitude)) locatedCount++;
      if (titleBudget > 0) {
        itemTitles.push((it.title || "").slice(0, TITLE_MAX_LEN));
        titleBudget--;
      }
    }

    days.push({
      dayNumber,
      locatedCount,
      unlocatedCount: dayItems.length - locatedCount,
      legDistanceKm: legKmByDay.has(dayNumber) ? round1(legKmByDay.get(dayNumber)!) : null,
      itemTitles,
    });
  }

  const planHash = hash.digest("hex");
  // Reuse #1 and #2 verbatim — one author for each computation, not a narration-only copy.
  const [routeEfficiency, stayAnchor] = await Promise.all([
    computeRouteEfficiencyDays(tripId),
    computeStayAnchor(tripId),
  ]);

  return { facts: { tripId, days, routeEfficiency, stayAnchor }, planHash };
}

// Process-lifetime cache only (documented honestly, per task spec — no schema change for v1).
// A server restart clears every entry; the next request simply regenerates and re-caches.
const narrationCache = new Map<string, { planHash: string; narration: string; generatedAt: string }>();

const NARRATION_SYSTEM_PROMPT = `You are a seasoned local trip-planning advisor. You will be given a JSON object of computed facts about a trip's itinerary (per-day located/unlocated item counts, transport-leg distances, a straight-line route-efficiency analysis, and a stay-anchor/lodging summary). Write 3-5 sentences of concrete, prioritized advice for the EXPERT who is building this trip.

Rules:
- Use ONLY the facts provided. NEVER invent a place, distance, or fact not present in the facts object.
- If any route-efficiency day has materiallyImprovable = true, mention the biggest such saving FIRST.
- Write plain prose. No markdown, no bullet lists, no headers.`;

router.post("/api/trips/:tripId/advisor/narration", aiRateLimit, isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { tripId } = req.params;
    const denied = await authorizeTripLogistics(
      tripId, userId, "POST /api/trips/:tripId/advisor/narration",
    );
    if (denied) return res.status(denied.status).json({ message: denied.message });

    const { facts, planHash } = await assembleFacts(tripId);

    // Transparency + testability: assembled facts with no AI call — how a keyless environment
    // verifies fact assembly independent of model access.
    if (req.query.factsOnly === "1") {
      return res.json({ facts, planHash });
    }

    const cached = narrationCache.get(tripId);
    if (cached && cached.planHash === planHash) {
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
        system: NARRATION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: JSON.stringify(facts) }],
      });

      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;
      if (inputTokens > 0 || outputTokens > 0) {
        trackAICost({
          sourceType: "advisor_narration",
          modelUsed: "claude-sonnet-4-5",
          userId,
          costUsd: calculateAnthropicCost(inputTokens, outputTokens),
          tokensIn: inputTokens,
          tokensOut: outputTokens,
        }).catch((err) => console.error("[advisor-narration] cost tracking failed:", err));
      }

      const textBlock = response.content.find((b) => b.type === "text");
      const text = textBlock && "text" in textBlock ? textBlock.text.trim() : "";
      if (!text) throw new Error("Empty narration response");
      narration = text;
    } catch (err) {
      console.error("[advisor-narration] AI call failed:", err);
      // Failure → nothing cached (spec f).
      return res.status(502).json({ message: "Advice unavailable right now" });
    }

    const generatedAt = new Date().toISOString();
    narrationCache.set(tripId, { planHash, narration, generatedAt });
    res.json({ narration, generatedAt, planHash, cached: false });
  } catch (error) {
    console.error("[advisor] narration POST error:", error);
    res.status(500).json({ message: "Failed to generate narration" });
  }
});

// GET is free — no AI call ever. Facts are reassembled (DB reads only) purely to compute the
// current planHash so staleness can be reported against whatever is cached.
router.get("/api/trips/:tripId/advisor/narration", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { tripId } = req.params;
    const denied = await authorizeTripLogistics(
      tripId, userId, "GET /api/trips/:tripId/advisor/narration",
    );
    if (denied) return res.status(denied.status).json({ message: denied.message });

    const cached = narrationCache.get(tripId);
    if (!cached) return res.status(204).end();

    const { planHash } = await assembleFacts(tripId);
    res.json({ narration: cached.narration, generatedAt: cached.generatedAt, stale: cached.planHash !== planHash });
  } catch (error) {
    console.error("[advisor] narration GET error:", error);
    res.status(500).json({ message: "Failed to fetch narration" });
  }
});

export default router;
