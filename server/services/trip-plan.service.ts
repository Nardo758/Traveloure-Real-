/**
 * TripPlan assembler — the ONE server-side home of the circulating plan object, with one adapter per
 * PRODUCER (§3 "producers normalize INTO TripPlan"):
 *
 *   • `assembleTripPlan(tripId, level)`            — `trips` + `itinerary_items` (+ the selected
 *     variant's legs, + the trip's own expert-CONFIRMED `transport_legs` (§18 L4), + the
 *     `generated_itineraries` JSON fallback). LIVE by reference. Consumed by
 *     `GET /api/trips/:tripId/plancard` (L3a).
 *   • `assembleTripPlanFromVariant(variantId, …)`  — `itinerary_variants` +
 *     `itinerary_variant_items` + `transport_legs`. A SNAPSHOT: it never reads the live trip.
 *     Consumed by the itinerary-share / OG family, which is keyed on `shared_itineraries.variantId`
 *     (L3b′).
 *
 * Governing contract: `docs/EXECUTION_MAP.md` §3 + CLAUDE.md §18. This service formalizes the
 * assembly that previously lived inline in `GET /api/trips/:tripId/plancard` and in the
 * itinerary-share handlers. Both producers emit the same envelope, so a renderer written against
 * TripPlan renders either home; shared internals (leg builder, booking resolution, day labels) exist
 * ONCE so the two cannot drift.
 *
 * ── WHAT THIS SERVICE DOES NOT DO: AUTHORIZATION ──────────────────────────────────────────────
 * The redaction level is the CHANNEL contract, not an auth check. Callers MUST gate access
 * themselves (the plancard route's `getTripRole` / assigned-expert / author checks are unchanged and
 * remain authoritative). Passing `'full'` does not grant `full` — it only says "this surface renders
 * the full body". Never call with `'full'` from an unauthenticated surface.
 *
 * ── INVARIANTS ────────────────────────────────────────────────────────────────────────────────
 * §18 L4 — a trip-scoped transport leg reaches this object ONLY in `proposal_status='confirmed'`.
 *        Engine `proposed` legs are never read here, so no traveler surface can render a machine
 *        proposal (the D1a born-approved lesson). Variant-scoped legs are unaffected.
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
  type VariantFullTripPlan,
} from "@shared/trip-plan";
import { geocodeAddress } from "../utils/geocode";
import { getTripTransportLegs } from "./trip-transport-legs.service";

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
 * Machine `YYYY-MM-DD` for day N counted from a plan start date. Null without a start date — no
 * date is ever guessed (§13). Same arithmetic the itinerary-share family has always used.
 */
function dayDateIso(startDate: Date | null, dayNum: number): string | null {
  if (!startDate) return null;
  const d = new Date(startDate);
  d.setDate(d.getDate() + dayNum - 1);
  return d.toISOString().split("T")[0];
}

/**
 * The primary booking option per transport leg — shared by both producers (the booking rows hang off
 * `transport_legs.id`, so they are the LEG's own data in either data home). Drives the badge display,
 * the §3 `booked` block and the §16 `bookVia` marker.
 */
interface LegBookingInfo {
  bookingSource: "platform" | "affiliate";
  partnerName: string | null;
  isBooked: boolean;
  confirmationRef: string | null;
}

async function resolveLegBookings(legs: any[]): Promise<Record<string, LegBookingInfo>> {
  const map: Record<string, LegBookingInfo> = {};
  if (legs.length === 0) return map;
  const legIds = legs.map((l: any) => l.id).filter(Boolean);
  if (legIds.length === 0) return map;

  const bookingOpts = await storage.getBookingOptionsByLegIds(legIds);
  for (const opt of bookingOpts) {
    if (!opt.transportLegId) continue;
    if (map[opt.transportLegId]) continue;
    map[opt.transportLegId] = {
      bookingSource: opt.bookingType === "platform" ? "platform" : "affiliate",
      partnerName: opt.source !== "traveloure" ? opt.source : null,
      // A REAL booking only — "available" is not booked (§13).
      isBooked: opt.bookingStatus === "booked" || opt.bookingStatus === "confirmed",
      confirmationRef: opt.confirmationRef ?? null,
    };
  }
  return map;
}

/**
 * ONE leg builder for both producers — `transport_legs` rows are literally the same table on the trip
 * and variant paths, so there is no second mapping to drift. Producer-specific extras (the raw
 * `distanceMeters`/`energyCost`/nullable `alternativeModes` the variant snapshot passes through) are
 * spread on by the caller so this core's output stays byte-identical for the trip producer.
 *
 * §16: never carries `linked_product_url` or any other affiliate/deep-link URL — a chauffeured leg
 * that is not really booked is marked `bookVia: 'agent-rail'` and the URL stays server-side.
 */
function buildTripPlanLegCore(leg: any, booking?: LegBookingInfo | null): TripPlanLeg {
  const mode = leg.userSelectedMode || leg.recommendedMode || "walk";
  const isBooked = !!booking?.isBooked;
  // §18 L4: a TRIP-scoped leg the expert CONFIRMED is settled even when they kept the engine's
  // recommended mode (confirming never required touching `userSelectedMode`) — so it must not
  // render as an open "AI suggested" proposal on the traveler's plan. `proposalStatus` is NULL on
  // every legacy variant leg, so this is a no-op for the variant producer.
  const settled = !!leg.userSelectedMode || leg.proposalStatus === "confirmed";
  return {
    id: leg.id,
    dayNumber: leg.dayNumber,
    fromActivityId: leg.fromActivityId ?? null,
    toActivityId: leg.toActivityId ?? null,
    mode,
    durationMin: leg.estimatedDurationMinutes || 0,
    distance: leg.distanceDisplay ?? null,
    // Real booking data only — `booked` still means a REAL booked/confirmed booking option. The
    // expert's stated arrangement (migration 154) refines the pickup fields when they wrote one;
    // absent that, the leg's own origin name and a null time, never a guess (§13).
    booked: isBooked
      ? {
          pickupPoint: leg.pickupPoint ?? leg.fromName ?? null,
          pickupTime: leg.pickupTime ?? null,
          rideRef: booking?.confirmationRef ?? null,
        }
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
    status: settled ? "confirmed" : "suggested",
    suggestedBy: settled ? null : "ai",
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

    // ADDITIVE, PRESENT-ONLY-WHEN-REAL (§13): the expert's stated pickup arrangement. A leg with
    // neither field written — which is EVERY legacy variant leg — carries neither key, so existing
    // producers' output is unchanged key-for-key.
    ...(leg.pickupPoint || leg.pickupTime
      ? { pickupPoint: leg.pickupPoint ?? null, pickupTime: leg.pickupTime ?? null }
      : {}),
  };
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
    // §13: an item with NO location of its own must never geocode to the bare city centre and
    // persist that as if it were the item's location. Require at least one item-level component
    // (locationName OR locationAddress) before geocoding at all; `destination` is only a
    // disambiguation SUFFIX on top of a real item-level address, never the sole address. An item
    // with no location stays un-pinned — the honest state.
    const hasItemLocation =
      (item.locationName && String(item.locationName).trim().length > 0) ||
      (item.locationAddress && String(item.locationAddress).trim().length > 0);
    if (!hasItemLocation) continue;
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
    // LIVE-by-reference producer: re-assembling always reflects the current trip (contrast the
    // variant adapter below, which is a snapshot).
    sourceRef: { kind: "trip", id: trip.id },
    tripId: trip.id,
    title: trip.title ?? null,
    // CAPABILITY GAP (§13): `trips` has no description column, so this producer has none to give.
    description: null,
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

  // ── §18 L4: trip-scoped legs — CONFIRMED ONLY ─────────────────────────────────────────────
  // The engine's `proposed` legs are machine output the expert has not approved, so this producer
  // does not read them AT ALL: a traveler surface can never receive one, whatever it renders (the
  // D1a born-approved lesson applied to machine transport). The Workstation editor reads proposals
  // through its own endpoint, never through the plan object.
  const tripLegs = await getTripTransportLegs(tripId, { includeProposed: false });

  // transportLegId → primary booking option (badge display + the §3 `booked` block). Booking rows
  // hang off `transport_legs.id`, so trip-scoped legs resolve through the same shared helper.
  const legBookingMap = await resolveLegBookings([...variantLegs, ...tripLegs]);

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

  const buildLeg = (leg: any): TripPlanLeg => buildTripPlanLegCore(leg, legBookingMap[leg.id]);

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
    const dayLegs = [
      ...variantLegs.filter((l) => l.dayNumber === dayNum && l.userSelectedMode !== "dismissed"),
      // Expert-confirmed trip legs for the same day (already ordered by legOrder). A trip with no
      // optimizer comparison — the expert-built Workstation case L4 exists for — gets its legs
      // from here alone; a legacy variant-only trip gets nothing extra, so its output is unchanged.
      ...tripLegs.filter((l: any) => l.dayNumber === dayNum),
    ];
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
    // L6 fix: `itinerary_variant_metrics`'s value column is `value` (shared/schema.ts:1136), not
    // `metricValue` — that field doesn't exist on the row, so every entry was `undefined` and
    // `metrics` silently serialized as `{}` on the live endpoint. Read the real column.
    rawMetrics[m.metricKey] = m.value;
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

  // Transport totals count every leg really on the plan: undismissed variant legs plus the
  // expert-CONFIRMED trip legs (proposals are not on the plan, so they are not counted).
  const activeLegs = [
    ...variantLegs.filter((l) => l.userSelectedMode !== "dismissed"),
    ...tripLegs,
  ];
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

// ── Producer adapter 2: the VARIANT snapshot (L3b′) ───────────────────────────────────────────
//
// Data home: `itinerary_variants` + `itinerary_variant_items` + `transport_legs` (+ the variant's
// `itinerary_comparisons` parent for destination/dates/budget/tripId). This is the home the
// itinerary-share / OG family serves — `shared_itineraries.variant_id` — which is a DIFFERENT home
// from `assembleTripPlan`'s `trips` + `itinerary_items`.
//
// ── THE SEMANTIC RULE (the whole point of this adapter) ───────────────────────────────────────
// It reads the VARIANT'S OWN ROWS and NEVER the live trip. A share link keyed on `variantId` keeps
// rendering exactly the plan that was shared, forever — even after the traveler edits (or deletes
// items from) the trip the variant was applied to. Anything that lives only on the live trip
// (itinerary items, trip transactions, the change log, expert notes, completion state) is therefore
// NOT read here; where the envelope has a field for it, the field is null/empty and says why (§13).
//
// ── CAPABILITY GAPS, stated once (§13 — null, never fabricated) ───────────────────────────────
//  • vendorPhone / confirmationNumber — `itinerary_variant_items` has no vendorContractId and no
//    confirmation column. A variant is a PROPOSAL; nothing is booked on it.
//  • expertNote / tripNote — no expert-note column. (`shared_itineraries.expertNotes` is
//    SHARE-scoped private review commentary, gated per-share by the route; it is deliberately kept
//    out of the plan object so it can never ride a plan to a surface that has not gated it.)
//  • mapsUrl — no `google_place_id` on variant items.
//  • meetingPoint — a variant item's `provider_service_id` points at a LIVE `provider_services` row;
//    reading it would break the snapshot rule above, so it is not read.
//  • visited — no completion column on a snapshot.
//  • deliveredBy — a variant carries no expert attribution. (`shared_itineraries.sharedByUserId` is
//    the TRAVELER who shared it, not an expert — emitting them as "delivered by" would misattribute.)
//  • budget.spentBreakdown — real spend is trip-scoped live state (`trip_transactions`); not read.

/** Raised when the variant row does not exist. Callers map this to their own 404. */
export class TripPlanVariantNotFoundError extends Error {
  constructor(variantId: string) {
    super(`Itinerary variant ${variantId} not found`);
    this.name = "TripPlanVariantNotFoundError";
  }
}

export interface AssembleVariantTripPlanOptions {
  /**
   * Reserved. The variant adapter needs no viewer input: it authorizes nothing (the share-token gate
   * is the caller's, as with the trip producer) and its output does not vary by viewer.
   */
  viewerId?: string | null;
}

export async function assembleTripPlanFromVariant(
  variantId: string,
  level: "full",
  options?: AssembleVariantTripPlanOptions,
): Promise<VariantFullTripPlan>;
export async function assembleTripPlanFromVariant(
  variantId: string,
  level: "teaser",
  options?: AssembleVariantTripPlanOptions,
): Promise<TeaserTripPlan>;
export async function assembleTripPlanFromVariant(
  variantId: string,
  level: "preview",
  options?: AssembleVariantTripPlanOptions,
): Promise<PreviewTripPlan>;
export async function assembleTripPlanFromVariant(
  variantId: string,
  level: RedactionLevel,
  _options: AssembleVariantTripPlanOptions = {},
): Promise<VariantFullTripPlan | TeaserTripPlan | PreviewTripPlan> {
  if (level === "social") throw new TripPlanLevelUnsupportedError(level);

  const variant = await storage.getItineraryVariantById(variantId);
  if (!variant) throw new TripPlanVariantNotFoundError(variantId);

  // The comparison is the variant's own parent row (NOT the live trip): it carries the snapshot's
  // destination, date range, budget and — nullably — the trip it was applied to.
  const comparison = await storage.getItineraryComparison(variant.comparisonId);
  const startDate = comparison?.startDate ? new Date(comparison.startDate) : null;

  const baseMeta = (dayCount: number): TripPlanMeta => ({
    tripPlanVersion: TRIP_PLAN_VERSION,
    sourceRef: { kind: "variant", id: variant.id },
    // Nullable by design — an optimizer comparison need never have been applied to a trip.
    tripId: comparison?.tripId ?? null,
    title: variant.name ?? null,
    description: variant.description ?? null,
    destination: comparison?.destination ?? null,
    dates: {
      start: comparison?.startDate != null ? String(comparison.startDate) : null,
      end: comparison?.endDate != null ? String(comparison.endDate) : null,
    },
    // The VARIANT's own status (pending/selected/…), not a trip status.
    status: variant.status ?? null,
    // A generated itinerary variant is platform-originated content, same as a trip.
    origin: contentOriginFor("itinerary_variant"),
    // See the capability-gap note above: never the sharer.
    deliveredBy: null,
    dayCount,
    // No hero-image column on a variant; emitted null rather than invented (§13).
    heroImageUrl: null,
  });

  // ── preview: meta ONLY. Reads the item rows solely to COUNT days (a real figure meta emits);
  //    no activity, leg, booking or comparison-budget work happens. ──────────────────────────────
  if (level === "preview") {
    const items = await storage.getItineraryVariantItemsByVariantId(variantId);
    const dayCount = Array.from(new Set(items.map((i: any) => i.dayNumber))).length;
    return { redactionLevel: "preview", meta: baseMeta(dayCount) };
  }

  const items = await storage.getItineraryVariantItemsByVariantId(variantId);

  // ── teaser: day + title ONLY (the §10 redactTemplateContent posture). Items are read solely to
  //    derive the day list + headline; NO activity is emitted, and legs are never loaded. ─────────
  if (level === "teaser") {
    const dayNumbers = Array.from(new Set(items.map((i: any) => i.dayNumber))).sort(
      (a: number, b: number) => a - b,
    );
    const days = dayNumbers.map((dayNum: number) => {
      const dayItems = items
        .filter((i: any) => i.dayNumber === dayNum)
        .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));
      // `generateDayLabel` reads `.title`; variant items name the column `name`.
      const titled = dayItems.map((i: any) => ({ title: i.name }));
      return {
        dayNumber: dayNum,
        title: generateDayLabel(
          dayItems.map((i: any) => i.serviceType || "activity"),
          titled,
        ),
      };
    });
    return { redactionLevel: "teaser", meta: baseMeta(days.length), days };
  }

  // ── full ──────────────────────────────────────────────────────────────────────────────────
  // Ordered by (dayNumber, legOrder) so both the flat `legs` list and each day's `transports` are
  // deterministic.
  const legRows = await storage.getOrderedTransportLegsByVariantId(variantId);
  const legBookingMap = await resolveLegBookings(legRows);

  /** Shared core + the raw snapshot columns the variant home carries (see TripPlanLeg docs). */
  const buildLeg = (leg: any): TripPlanLeg => ({
    ...buildTripPlanLegCore(leg, legBookingMap[leg.id]),
    distanceMeters: leg.distanceMeters ?? null,
    energyCost: leg.energyCost ?? null,
    // RAW: preserves NULL (never computed) vs [] (computed none) — see TripPlanLeg.alternativeModes.
    alternativeModes: leg.alternativeModes ?? null,
  });

  const buildActivity = (item: any): TripPlanActivity => {
    const title = item.name;
    return {
      id: item.id,
      title,
      name: title,
      startTime: item.startTime || null,
      endTime: item.endTime || null,
      time: item.startTime || "",
      // RAW: null stays null (the row genuinely has no location) — see TripPlanActivity.location.
      location: item.location ?? null,
      lat: item.latitude ? parseFloat(item.latitude.toString()) : null,
      lng: item.longitude ? parseFloat(item.longitude.toString()) : null,
      // Capability gaps — see the block comment above this adapter. Never placeholders.
      mapsUrl: null,
      meetingPoint: null,
      confirmationNumber: null,
      vendorPhone: null,
      expertNote: null,
      visited: false,
      // Variant items are optimizer output; the platform authored them.
      source: "platform",

      type: mapItemType(item.serviceType),
      // A variant item is a PROPOSAL — the snapshot has no status column, so no "confirmed" claim is
      // made (§13). `mapItemStatus(null)` would say "confirmed", which would be a fabrication here.
      status: "suggested",
      cost: item.price ? parseFloat(item.price.toString()) : 0,
      // Comments and the change log are trip-scoped live state; a snapshot has neither.
      comments: 0,
      suggestedBy: null,
      changes: [],

      // Producer-native extras this home really does carry.
      description: item.description ?? null,
      durationMinutes: item.duration ?? null,
      category: item.serviceType ?? null,
    };
  };

  const dayNumbers = Array.from(new Set(items.map((i: any) => i.dayNumber))).sort(
    (a: number, b: number) => a - b,
  );

  const days: TripPlanDay[] = dayNumbers.map((dayNum: number) => {
    const dayItems = items
      .filter((i: any) => i.dayNumber === dayNum)
      .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const dayLegs = legRows.filter((l: any) => l.dayNumber === dayNum);
    return {
      dayNumber: dayNum,
      dayNum,
      // Empty when the snapshot has no start date — never today's date (§13).
      date: startDate ? dayDateLabel(startDate, dayNum) : "",
      dateIso: dayDateIso(startDate, dayNum),
      label: generateDayLabel(
        dayItems.map((i: any) => i.serviceType || "activity"),
        dayItems.map((i: any) => ({ title: i.name })),
      ),
      activities: dayItems.map(buildActivity),
      transports: dayLegs.map(buildLeg),
    };
  });

  // EVERY leg of the snapshot, not just the day-placed ones: a leg whose day carries no items is
  // still part of the plan's transport totals (and dropping it would change what the share surface
  // has always reported). No "dismissed" filter either — that is a live-trip display rule; a
  // snapshot renders what was shared.
  const legs: TripPlanLeg[] = legRows.map(buildLeg);

  const plannedBudget = comparison?.budget != null ? parseFloat(String(comparison.budget)) : null;

  return {
    redactionLevel: "full",
    meta: baseMeta(days.length),
    days,
    legs,
    // No expert-note column on a variant (and share-scoped notes stay out of the plan — see above).
    tripNote: null,
    budget:
      plannedBudget != null && !isNaN(plannedBudget)
        ? // `spentBreakdown` stays empty: real spend is trip-scoped live state, deliberately not
          // read by a snapshot producer. Empty is honest; it is never an estimate (§13).
          { currency: "USD", planned: plannedBudget, spentBreakdown: [] }
        : null,
    // Only when a trip actually backs this variant — otherwise there is no log to point at.
    changeLogRef: comparison?.tripId
      ? { tripId: comparison.tripId, endpoint: `/api/trips/${comparison.tripId}/changes` }
      : null,
    // RAW pass-through of the variant's own optimizer figures (see TripPlanSourceFigures).
    sourceFigures: {
      totalCost: variant.totalCost ?? null,
      optimizationScore: variant.optimizationScore ?? null,
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
