/**
 * TripPlan assembler — the ONE server-side producer of the circulating plan object.
 *
 * Governing contract: `docs/EXECUTION_MAP.md` §3 + CLAUDE.md §18. This service formalizes the
 * assembly that previously lived inline in `GET /api/trips/:tripId/plancard`; that route is now a
 * thin caller passing `'full'`. Every future renderer/channel (share view, OG injection, store
 * teaser, social pack) consumes THIS assembler at its channel's redaction level instead of building
 * its own trip shape (lane L3b).
 *
 * ── WHAT THIS SERVICE DOES NOT DO: AUTHORIZATION ──────────────────────────────────────────────
 * The redaction level is the CHANNEL contract, not an auth check. Callers MUST gate access
 * themselves (the plancard route's `getTripRole` / assigned-expert / author checks are unchanged and
 * remain authoritative). Passing `'full'` does not grant `full` — it only says "this surface renders
 * the full body". Never call with `'full'` from an unauthenticated surface.
 *
 * ── INVARIANTS ────────────────────────────────────────────────────────────────────────────────
 * §13 — never fabricate. Absent vendor phone / confirmation number / meeting point / expert note /
 *        transport leg / booking stays `null` (or the array stays empty). The
 *        `generated_itineraries` adapter has no vendor linkage at all, so it emits those fields
 *        `null` and says so in comments — a capability gap, not a placeholder.
 * §14 — every value is derived from server-side rows. This service takes no request body and no
 *        client-supplied amount or identity.
 * §16 — a leg NEVER carries an affiliate/deep-link URL. Chauffeured-but-unbooked legs are marked
 *        `bookVia: 'agent-rail'` so the CTA routes through the in-platform booking-agent rail.
 */

import { db } from "../db";
import { storage } from "../storage";
import { providerServices, tripExpertAdvisors, tripTransactions } from "@shared/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { contentOriginFor } from "@shared/content-origin";
import {
  TRIP_PLAN_VERSION,
  isChauffeuredMode,
  type AssembledRedactionLevel,
  type FullTripPlan,
  type PreviewTripPlan,
  type RedactionLevel,
  type TeaserTripPlan,
  type TripPlanActivity,
  type TripPlanActivitySource,
  type TripPlanBudget,
  type TripPlanBudgetCategory,
  type TripPlanChange,
  type TripPlanDay,
  type TripPlanExpertAttribution,
  type TripPlanFor,
  type TripPlanLeg,
  type TripPlanMeta,
  type TripPlanMetrics,
} from "@shared/trip-plan";
import { geocodeAddress } from "../utils/geocode";

/** Raised when a level is requested that v1 cannot honestly produce (`social`). */
export class TripPlanLevelUnsupportedError extends Error {
  constructor(level: string) {
    super(
      `TripPlan redaction level '${level}' is not implemented in v1 — it is type-defined only ` +
        `(docs/EXECUTION_MAP.md §3). Refusing rather than emitting a partial pack (§13).`,
    );
    this.name = "TripPlanLevelUnsupportedError";
  }
}

/** Raised when the trip row does not exist. Callers map this to their own 404. */
export class TripPlanNotFoundError extends Error {
  constructor(tripId: string) {
    super(`Trip ${tripId} not found`);
    this.name = "TripPlanNotFoundError";
  }
}

export interface AssembleTripPlanOptions {
  /**
   * The viewer, used ONLY for the legacy `plancard.tripRole` fallback (owner-vs-expert display).
   * Not an authorization input — see the header note.
   */
  viewerId?: string | null;
  /** Role already resolved by the caller's gate; passed through so auth is not duplicated here. */
  tripRole?: string | null;
}

// ── Display mappings (moved verbatim from plancard.routes.ts — the existing contract) ──────────

const ITEM_TYPE_MAP: Record<string, string> = {
  activity: "attraction",
  dining: "dining",
  attraction: "attraction",
  shopping: "shopping",
  transport: "transport",
  accommodation: "accommodation",
  meal: "dining",
  sightseeing: "attraction",
  entertainment: "attraction",
  spa: "attraction",
  tour: "attraction",
};

export function mapItemType(itemType: string | null): string {
  return ITEM_TYPE_MAP[itemType || "activity"] || "attraction";
}

const ITEM_STATUS_MAP: Record<string, string> = {
  planned: "confirmed",
  confirmed: "confirmed",
  pending: "pending",
  suggested: "suggested",
  cancelled: "pending",
};

export function mapItemStatus(status: string | null): string {
  return ITEM_STATUS_MAP[status || "planned"] || "pending";
}

export function generateDayLabel(types: string[], items: any[]): string {
  if (items.length === 0) return "Free Day";
  const firstItem = items[0]?.title || "";
  const lastItem = items[items.length - 1]?.title || "";
  if (items.length <= 2) return firstItem;
  return `${firstItem} & more`;
}

export function formatTimeAgo(date: Date | string | null): string {
  if (!date) return "recently";
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function toNum(raw: Record<string, string>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = raw[k];
    if (v != null) {
      const n = parseFloat(v);
      if (!isNaN(n)) return n;
    }
  }
  return undefined;
}

function dayDateLabel(startDate: Date, dayNum: number): string {
  const dayDate = new Date(startDate);
  dayDate.setDate(dayDate.getDate() + dayNum - 1);
  return dayDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Resolve-on-write: populate latitude/longitude for itinerary items that lack them, once, via the
 * single server geocode path, and persist back to the row so subsequent reads use the stored value.
 * Bounded per request so a cold trip can't stall the response; safe to fail (the map simply omits a
 * pin without coordinates). The PlanCard client never geocodes — pins read these columns.
 *
 * Only runs for levels that actually emit coordinates (`full`); `teaser`/`preview` carry no pins,
 * so they must not trigger geocode spend or writes.
 */
async function resolveMissingItemCoordinates(
  items: Array<{ id: string; latitude: any; longitude: any; locationName: any; locationAddress: any }>,
  destination: string | null | undefined,
): Promise<void> {
  const MAX_PER_REQUEST = 12;
  let resolved = 0;
  for (const item of items) {
    if (resolved >= MAX_PER_REQUEST) break;
    if (item.latitude != null && item.longitude != null) continue;
    const address = [item.locationName, item.locationAddress, destination]
      .filter((p) => p && String(p).trim().length > 0)
      .join(", ");
    if (!address) continue;
    try {
      const geo = await geocodeAddress(address);
      if (!geo) continue;
      const lat = geo.lat.toString();
      const lng = geo.lng.toString();
      await storage.updateItineraryItemCoordinates(item.id, lat, lng);
      // Reflect in the in-memory row so this same response carries the pin.
      item.latitude = lat;
      item.longitude = lng;
      resolved++;
    } catch {
      // best-effort; leave this item un-pinned
    }
  }
}

/**
 * Activity origin (§3 `source`). HONEST derivation only:
 *   • `expert`   — the expert authored/suggested the item (`suggested_by = 'expert'`).
 *   • `platform` — everything else (traveler-added, AI-optimizer-added, or a linked platform
 *                  `provider_services` row). Trips are platform-origin content in the central
 *                  taxonomy.
 * `affiliate` / `sourced-derived` are NOT derivable in v1 — `itinerary_items` carries no affiliate
 * product link and no DMO lineage column — so they are never emitted (§13).
 */
function activitySource(item: { suggestedBy?: string | null }): TripPlanActivitySource {
  return (item.suggestedBy || "").toLowerCase() === "expert" ? "expert" : "platform";
}

/** Provider-canonical Maps link. Derived from a REAL `googlePlaceId`; null without one. */
function placeMapsUrl(googlePlaceId: string | null | undefined): string | null {
  if (!googlePlaceId) return null;
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(googlePlaceId)}`;
}

/**
 * Expert attribution for `meta.deliveredBy`. Prefers the accepted advisory assignment (the expert
 * who is actually working the trip), falling back to `trips.expertId`. Returns null when no real
 * user row backs either — never a name placeholder (§13).
 */
async function resolveDeliveredBy(
  tripId: string,
  tripExpertId: string | null | undefined,
): Promise<TripPlanExpertAttribution | null> {
  let expertId: string | null = null;

  const advisorRows = await db
    .select({ localExpertId: tripExpertAdvisors.localExpertId })
    .from(tripExpertAdvisors)
    .where(and(eq(tripExpertAdvisors.tripId, tripId), eq(tripExpertAdvisors.status, "accepted")))
    .orderBy(desc(tripExpertAdvisors.assignedAt))
    .limit(1);

  if (advisorRows.length > 0) expertId = advisorRows[0].localExpertId;
  if (!expertId && tripExpertId) expertId = tripExpertId;
  if (!expertId) return null;

  const expert = await storage.getUser(expertId);
  if (!expert) return null;

  const name = [expert.firstName, expert.lastName].filter(Boolean).join(" ").trim();
  return {
    expertId,
    name: name.length > 0 ? name : null,
    avatar: expert.profileImageUrl ?? null,
  };
}

/**
 * Budget (§3). `planned` is the trip's own budget column; `spentBreakdown` is REAL paid
 * `trip_transactions` grouped by category. No transactions ⇒ empty array (never a projected or
 * estimated spend — §13). Single platform currency today (CLAUDE.md §10 Currency); multi-currency
 * is Stage-2 and deliberately not modelled here.
 */
async function resolveBudget(
  tripId: string,
  rawBudget: string | number | null | undefined,
): Promise<TripPlanBudget | null> {
  const planned = rawBudget != null ? parseFloat(String(rawBudget)) : null;

  const rows = await db
    .select({
      category: tripTransactions.category,
      total: sql<string>`SUM(${tripTransactions.amount})`,
    })
    .from(tripTransactions)
    .where(and(eq(tripTransactions.tripId, tripId), eq(tripTransactions.status, "paid")))
    .groupBy(tripTransactions.category);

  const spentBreakdown: TripPlanBudgetCategory[] = rows
    .map((r) => ({
      category: r.category ?? "other",
      amount: parseFloat(String(r.total ?? "0")),
    }))
    .filter((c) => !isNaN(c.amount));

  if ((planned == null || isNaN(planned)) && spentBreakdown.length === 0) return null;
  return {
    currency: "USD",
    planned: planned != null && !isNaN(planned) ? planned : null,
    spentBreakdown,
  };
}

/** Meeting points for items linked to a platform service. Bulk-read once per assembly. */
async function resolveMeetingPoints(serviceIds: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  if (serviceIds.length === 0) return out;
  const rows = await db
    .select({ id: providerServices.id, meetingPoint: providerServices.meetingPoint })
    .from(providerServices)
    .where(inArray(providerServices.id, serviceIds));
  for (const row of rows) out[row.id] = row.meetingPoint ?? null;
  return out;
}

// ── The assembler ─────────────────────────────────────────────────────────────────────────────

export async function assembleTripPlan(
  tripId: string,
  level: "full",
  options?: AssembleTripPlanOptions,
): Promise<FullTripPlan>;
export async function assembleTripPlan(
  tripId: string,
  level: "teaser",
  options?: AssembleTripPlanOptions,
): Promise<TeaserTripPlan>;
export async function assembleTripPlan(
  tripId: string,
  level: "preview",
  options?: AssembleTripPlanOptions,
): Promise<PreviewTripPlan>;
export async function assembleTripPlan<L extends AssembledRedactionLevel>(
  tripId: string,
  level: L,
  options?: AssembleTripPlanOptions,
): Promise<TripPlanFor<L>>;
export async function assembleTripPlan(
  tripId: string,
  level: RedactionLevel,
  options: AssembleTripPlanOptions = {},
): Promise<FullTripPlan | TeaserTripPlan | PreviewTripPlan> {
  if (level === "social") throw new TripPlanLevelUnsupportedError(level);

  const trip = await storage.getTrip(tripId);
  if (!trip) throw new TripPlanNotFoundError(tripId);

  const startDate = trip.startDate ? new Date(trip.startDate) : new Date();
  const deliveredBy = await resolveDeliveredBy(tripId, trip.expertId);

  const baseMeta = (dayCount: number): TripPlanMeta => ({
    tripPlanVersion: TRIP_PLAN_VERSION,
    tripId: trip.id,
    title: trip.title ?? null,
    destination: trip.destination ?? null,
    dates: {
      start: trip.startDate != null ? String(trip.startDate) : null,
      end: trip.endDate != null ? String(trip.endDate) : null,
    },
    status: trip.status ?? null,
    // Single source of truth for origin — a trip is platform-originated content.
    origin: contentOriginFor("trip"),
    deliveredBy,
    dayCount,
    // No trip-level hero-image column exists; emitted null rather than invented (§13).
    heroImageUrl: null,
  });

  // ── preview: meta ONLY. No itinerary body of any kind, so nothing below is read. ──────────
  if (level === "preview") {
    const dayCount = await countTripDays(tripId);
    return { redactionLevel: "preview", meta: baseMeta(dayCount) };
  }

  const items = await storage.getItineraryItems(tripId);

  // ── teaser: day + title ONLY (the §10 redactTemplateContent posture). ─────────────────────
  // Items are read solely to derive the day list + day headline; NO activity is emitted.
  if (level === "teaser") {
    const dayNumbers = Array.from(new Set(items.map((i) => i.dayNumber))).sort((a, b) => a - b);
    let days = dayNumbers.map((dayNum) => {
      const dayItems = items.filter((i) => i.dayNumber === dayNum);
      const types = dayItems.map((i) => i.itemType || "activity");
      return { dayNumber: dayNum, title: generateDayLabel(types, dayItems) };
    });

    if (days.length === 0) {
      // generated_itineraries adapter (no structured rows yet) — same day+title redaction.
      const genItinerary = await storage.getGeneratedItineraryByTripId(tripId);
      const genDays = ((genItinerary?.itineraryData as any)?.days ?? []) as any[];
      days = genDays.map((d: any, idx: number) => ({
        dayNumber: d?.day || idx + 1,
        title: d?.title ?? d?.theme ?? null,
      }));
    }

    return { redactionLevel: "teaser", meta: baseMeta(days.length), days };
  }

  // ── full ──────────────────────────────────────────────────────────────────────────────────

  // Resolve-on-write: fill + persist any missing pin coordinates via the single server geocode
  // path, so the client never geocodes.
  await resolveMissingItemCoordinates(items as any, trip.destination);

  const comparison = await storage.getItineraryComparisonByTripId(tripId);

  let variantLegs: any[] = [];
  let variantMetrics: any[] = [];

  if (comparison) {
    const variantId = comparison.selectedVariantId;
    let variant;
    if (variantId) {
      variant = await storage.getItineraryVariantById(variantId);
    }
    if (!variant) {
      variant = await storage.getFirstVariantByComparisonId(comparison.id);
    }
    if (variant) {
      variantLegs = await storage.getOrderedTransportLegsByVariantId(variant.id);
      variantMetrics = await storage.getVariantMetricsAllByVariantId(variant.id);
    }
  }

  // transportLegId → primary booking option (badge display + the §3 `booked` block).
  const legBookingMap: Record<
    string,
    {
      bookingSource: "platform" | "affiliate";
      partnerName: string | null;
      isBooked: boolean;
      confirmationRef: string | null;
    }
  > = {};
  if (variantLegs.length > 0) {
    const legIds = variantLegs.map((l: any) => l.id).filter(Boolean);
    if (legIds.length > 0) {
      const bookingOpts = await storage.getBookingOptionsByLegIds(legIds);
      for (const opt of bookingOpts) {
        if (!opt.transportLegId) continue;
        if (legBookingMap[opt.transportLegId]) continue;
        legBookingMap[opt.transportLegId] = {
          bookingSource: opt.bookingType === "platform" ? "platform" : "affiliate",
          partnerName: opt.source !== "traveloure" ? opt.source : null,
          // A REAL booking only — "available" is not booked (§13).
          isBooked: opt.bookingStatus === "booked" || opt.bookingStatus === "confirmed",
          confirmationRef: opt.confirmationRef ?? null,
        };
      }
    }
  }

  const changes = await storage.getItineraryChanges(tripId, 20);
  const commentCounts = await storage.getActivityCommentCounts(tripId);

  // Mobile-lens audit §5: surface real vendor phone (vendor_contracts) + confirmation number
  // (itinerary_items, already stored) on the activity row. Bulk-fetch once per assembly; render
  // only when present (§13 — no placeholders for items with neither).
  const vendorContractIds = Array.from(
    new Set(items.map((i) => (i as any).vendorContractId).filter((id): id is string => !!id)),
  );
  const vendorContractRows = vendorContractIds.length
    ? await storage.getVendorContractsByIds(vendorContractIds)
    : [];
  const vendorPhoneById: Record<string, string | null> = {};
  for (const vc of vendorContractRows) vendorPhoneById[vc.id] = vc.vendorPhone ?? null;

  // §3 `meetingPoint`: real value from the linked platform service; null for free-text items.
  const meetingPointByServiceId = await resolveMeetingPoints(
    Array.from(
      new Set(items.map((i) => (i as any).providerServiceId).filter((id): id is string => !!id)),
    ),
  );

  const dayNumbers = Array.from(new Set(items.map((i) => i.dayNumber))).sort((a, b) => a - b);

  const buildLeg = (leg: any): TripPlanLeg => {
    const mode = leg.userSelectedMode || leg.recommendedMode || "walk";
    const booking = legBookingMap[leg.id];
    const isBooked = !!booking?.isBooked;
    return {
      id: leg.id,
      dayNumber: leg.dayNumber,
      fromActivityId: leg.fromActivityId ?? null,
      toActivityId: leg.toActivityId ?? null,
      mode,
      durationMin: leg.estimatedDurationMinutes || 0,
      distance: leg.distanceDisplay ?? null,
      // Real booking data only. pickupTime has no column → null, never derived from a guess (§13).
      booked: isBooked
        ? { pickupPoint: leg.fromName ?? null, pickupTime: null, rideRef: booking?.confirmationRef ?? null }
        : null,
      // §16: a chauffeured ride that is not really booked must be booked through the in-platform
      // booking-agent rail. No affiliate/deep-link URL is ever carried on this object.
      bookVia: !isBooked && isChauffeuredMode(mode) ? "agent-rail" : null,

      // legacy plancard contract
      from: leg.fromActivityId || "",
      to: leg.toActivityId || "",
      fromName: leg.fromName,
      toName: leg.toName,
      duration: leg.estimatedDurationMinutes || 0,
      cost: leg.estimatedCostUsd || 0,
      line: null,
      status: leg.userSelectedMode ? "confirmed" : "suggested",
      suggestedBy: leg.userSelectedMode ? null : "ai",
      bookingSource: booking?.bookingSource ?? null,
      partnerName: booking?.partnerName ?? null,
      legOrder: leg.legOrder,
      recommendedMode: leg.recommendedMode,
      userSelectedMode: leg.userSelectedMode ?? null,
      alternativeModes: leg.alternativeModes ?? [],
      fromLat: leg.fromLat,
      fromLng: leg.fromLng,
      toLat: leg.toLat,
      toLng: leg.toLng,
      distanceDisplay: leg.distanceDisplay,
      estimatedDurationMinutes: leg.estimatedDurationMinutes,
      estimatedCostUsd: leg.estimatedCostUsd ?? null,
    };
  };

  const buildActivity = (item: any): TripPlanActivity => {
    const title = item.title;
    const startTime = item.startTime || null;
    return {
      id: item.id,
      title,
      name: title,
      startTime,
      endTime: item.endTime || null,
      time: item.startTime || "",
      location: item.locationName || item.locationAddress || "",
      // Emitted as lat/lng to match the PlanCardActivity client contract so pins read coordinates
      // directly (no client-side geocoding).
      lat: item.latitude ? parseFloat(item.latitude.toString()) : null,
      lng: item.longitude ? parseFloat(item.longitude.toString()) : null,
      mapsUrl: placeMapsUrl(item.googlePlaceId),
      meetingPoint: item.providerServiceId
        ? (meetingPointByServiceId[item.providerServiceId] ?? null)
        : null,
      // §5: real data only — null when the item has no vendor contract / no confirmation yet,
      // never a placeholder string.
      confirmationNumber: item.confirmationNumber || item.bookingReference || null,
      vendorPhone: item.vendorContractId ? (vendorPhoneById[item.vendorContractId] ?? null) : null,
      // Workstation audit C-1: the durable expertNote column (migration 152) is the primary source
      // — an expert-authored tip written via the Workstation item editor. Falls back to the
      // pre-existing ephemeral `notes` reading only when the column is NULL, so builds that predate
      // the column (or only ever used the old path) keep rendering exactly as before.
      expertNote: item.expertNote || item.notes || null,
      // No dedicated column: derived from the RAW row status (the display status is mapped below).
      visited: item.status === "completed",
      source: activitySource(item),

      type: mapItemType(item.itemType),
      status: mapItemStatus(item.status),
      cost: parseFloat(item.estimatedCost?.toString() || "0"),
      comments: commentCounts[item.id] || 0,
      suggestedBy: item.suggestedBy || null,
      changes: changes
        .filter((c) => c.activityId === item.id)
        .slice(0, 1)
        .map((c) => ({ who: c.who, what: c.action, when: formatTimeAgo(c.createdAt) })),
    };
  };

  let days: TripPlanDay[] = dayNumbers.map((dayNum) => {
    const dayItems = items.filter((i) => i.dayNumber === dayNum);
    const dayLegs = variantLegs.filter(
      (l) => l.dayNumber === dayNum && l.userSelectedMode !== "dismissed",
    );
    const types = dayItems.map((i) => i.itemType || "activity");
    return {
      dayNumber: dayNum,
      dayNum,
      date: dayDateLabel(startDate, dayNum),
      label: generateDayLabel(types, dayItems),
      activities: dayItems.map(buildActivity),
      transports: dayLegs.map(buildLeg),
    };
  });

  const rawMetrics: Record<string, string> = {};
  for (const m of variantMetrics) {
    // PRESERVED VERBATIM from the pre-refactor route, including the key name. NOTE (reported, not
    // changed by this lane): `itinerary_variant_metrics` has no `metricValue` column — the value
    // column is `value` — so every entry is `undefined` today and `metrics` serializes as `{}`.
    // Correcting it would change the live response outside this refactor's scope.
    rawMetrics[m.metricKey] = m.metricValue;
  }

  const metricsMap: TripPlanMetrics = {
    traveloureScore: toNum(rawMetrics, "traveloureScore", "traveloure_score"),
    optimizationScore: toNum(rawMetrics, "optimizationScore", "optimization_score"),
    totalCost: toNum(rawMetrics, "totalCost", "total_cost"),
    perPersonCost: toNum(rawMetrics, "perPersonCost", "per_person_cost"),
    savings: toNum(rawMetrics, "savings"),
    savingsPercent: toNum(rawMetrics, "savingsPercent", "savings_percent"),
    wellnessMinutes: toNum(rawMetrics, "wellnessMinutes", "wellness_minutes"),
    travelDistanceMinutes: toNum(rawMetrics, "travelDistanceMinutes", "travel_distance_minutes"),
    starRatingDelta: toNum(rawMetrics, "starRatingDelta", "star_rating_delta"),
  };

  // Producer adapter: with no structured itinerary items, fall back to the generated_itineraries
  // JSON. CAPABILITY GAP (§13, honest): that shape has NO vendor linkage and no expert-note column,
  // so vendorPhone / confirmationNumber / meetingPoint / expertNote are null for every item — the
  // adapter says so rather than inventing them.
  let fallbackActivityCount = items.length;
  let fallbackDays = days.length;
  if (items.length === 0) {
    const genItinerary = await storage.getGeneratedItineraryByTripId(tripId);
    if (genItinerary?.itineraryData) {
      const data = genItinerary.itineraryData as { days?: Array<any> };
      const genDays = data.days ?? [];
      fallbackDays = genDays.length || fallbackDays;
      fallbackActivityCount = genDays.reduce(
        (s: number, d: any) => s + (d.activities?.length ?? 0),
        0,
      );
      days = genDays.map((d: any, idx: number) => {
        const dayNum: number = d.day || idx + 1;
        const acts: any[] = d.activities || [];
        const types: string[] = acts.map((a: any) => a.category || a.type || "activity");
        return {
          dayNumber: dayNum,
          dayNum,
          date: dayDateLabel(startDate, dayNum),
          label: generateDayLabel(types, []),
          activities: acts.map((a: any, ai: number) => {
            const title = a.name || a.title || "";
            return {
              id: a.id || `gen-${dayNum}-${ai}`,
              title,
              name: title,
              startTime: a.time || null,
              endTime: a.endTime || null,
              time: a.time || "",
              location: a.location || a.venue || "",
              type: a.category || a.type || "activity",
              status: a.status || "planned",
              cost: parseFloat(a.estimatedCost?.toString() || a.cost?.toString() || "0"),
              lat: a.lat ?? a.latitude ?? null,
              lng: a.lng ?? a.longitude ?? null,
              // Not available on this producer — null, never fabricated.
              mapsUrl: null,
              meetingPoint: null,
              confirmationNumber: null,
              vendorPhone: null,
              expertNote: null,
              visited: a.status === "completed",
              source: "platform" as TripPlanActivitySource,
              comments: 0,
              suggestedBy: null,
              changes: [],
            };
          }),
          transports: (d.transportLegs || []).map((l: any, li: number) => {
            const mode = l.userSelectedMode || l.recommendedMode || l.mode || "walk";
            return {
              id: l.id || `tleg-${dayNum}-${li}`,
              dayNumber: dayNum,
              fromActivityId: l.fromActivityId ?? null,
              toActivityId: l.toActivityId ?? null,
              mode,
              durationMin: l.estimatedDurationMinutes || l.duration || 0,
              distance: l.distanceDisplay ?? null,
              // This producer carries no booking rows at all — never a fabricated booking.
              booked: null,
              bookVia: isChauffeuredMode(mode) ? ("agent-rail" as const) : null,

              from: l.fromName || l.from || "",
              to: l.toName || l.to || "",
              fromName: l.fromName || l.from || "",
              toName: l.toName || l.to || "",
              duration: l.estimatedDurationMinutes || l.duration || 0,
              cost: l.estimatedCostUsd || l.cost || 0,
              line: null,
              status: "suggested",
              suggestedBy: "ai",
              bookingSource: "platform" as const,
              partnerName: null,
              legOrder: l.legOrder ?? li,
              recommendedMode: l.recommendedMode || l.mode || "walk",
              userSelectedMode: l.userSelectedMode ?? null,
              alternativeModes: l.alternativeModes ?? [],
              fromLat: l.fromLat ?? null,
              fromLng: l.fromLng ?? null,
              toLat: l.toLat ?? null,
              toLng: l.toLng ?? null,
              distanceDisplay: l.distanceDisplay ?? "",
              estimatedDurationMinutes: l.estimatedDurationMinutes ?? l.duration ?? 0,
              estimatedCostUsd: l.estimatedCostUsd ?? l.cost ?? null,
            };
          }),
        };
      });
    }
  }

  // optimizationDelta from the AI optimize changelog entry (set by apply-to-trip)
  const optimizeEntry = changes.find((c) => c.role === "ai" && c.changeType === "optimize");
  const optimizationDelta = optimizeEntry?.metadata
    ? ((optimizeEntry.metadata as any).delta ?? null)
    : null;
  const lastOptimizedAt = comparison?.optimizedAt ?? null;

  const changeLog: TripPlanChange[] = changes.slice(0, 10).map((c) => ({
    id: c.id,
    who: c.who,
    what: c.action,
    when: formatTimeAgo(c.createdAt),
    type: c.changeType,
    role: c.role,
  }));

  const activeLegs = variantLegs.filter((l) => l.userSelectedMode !== "dismissed");
  const budget = await resolveBudget(tripId, trip.budget);

  const legs: TripPlanLeg[] = [];
  for (const day of days) legs.push(...day.transports);

  return {
    redactionLevel: "full",
    meta: baseMeta(fallbackDays || days.length),
    days,
    legs,
    // Trip-level expert note (the §18 "Note from your expert" section). Null when unwritten.
    tripNote: trip.expertNotes ?? null,
    budget,
    changeLogRef: { tripId: trip.id, endpoint: `/api/trips/${trip.id}/changes` },
    plancard: {
      tripRole: options.tripRole ?? (trip.userId === options.viewerId ? "owner" : "expert"),
      trip: {
        id: trip.id,
        title: trip.title ?? null,
        destination: trip.destination ?? null,
        status: trip.status ?? null,
        eventType: trip.eventType ?? null,
        startDate: trip.startDate as any,
        endDate: trip.endDate as any,
        travelers: trip.numberOfTravelers || 1,
        budget: trip.budget ? `$${parseFloat(trip.budget.toString()).toLocaleString()}` : null,
      },
      changeLog,
      metrics: metricsMap,
      optimizationDelta,
      lastOptimizedAt,
      stats: {
        totalDays: fallbackDays || days.length,
        totalActivities: fallbackActivityCount,
        totalLegs: activeLegs.length,
        totalTransitMinutes: activeLegs.reduce(
          (s, l) => s + (l.estimatedDurationMinutes || 0),
          0,
        ),
        confirmedActivities: items.filter(
          (i) => i.status === "confirmed" || i.status === "planned",
        ).length,
        pendingExpertChanges: changes.filter(
          (c) => c.role === "expert" && c.changeType === "suggest",
        ).length,
      },
    },
  };
}

/**
 * Day count for `preview` without assembling any body. Prefers the real structured rows; falls back
 * to the generated_itineraries day list. Zero when the trip has neither (honest — no date-range
 * guess is made server-side).
 */
async function countTripDays(tripId: string): Promise<number> {
  const items = await storage.getItineraryItems(tripId);
  if (items.length > 0) {
    return Array.from(new Set(items.map((i) => i.dayNumber))).length;
  }
  const genItinerary = await storage.getGeneratedItineraryByTripId(tripId);
  const genDays = ((genItinerary?.itineraryData as any)?.days ?? []) as any[];
  return genDays.length;
}
