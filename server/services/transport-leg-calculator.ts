import { db } from "../db";
import { transportLegs, mapsExportCache, itineraryVariantItems } from "../../shared/schema";
import { propagateActivitySchedule } from "./activity-schedule.service";
import { getDestinationProfile, type DestinationTransportProfile, type TransportModeConfig } from "../data/transport-profiles";
import { populateBookingOptionsForVariant } from "./transport-booking-options.service";
import {
  buildGoogleMapsUrl,
  buildAppleMapsUrl,
  buildAppleMapsWebUrl,
  type ActivityPoint,
} from "./maps-url-builder";
import { eq } from "drizzle-orm";
import { getTrafficAwareDrivingRoute } from "./routes.service";

export interface ActivityLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  scheduledTime: string;
  dayNumber: number;
  order: number;
  /** RFC 3339 departure computed from the trip date/schedule when available. */
  departureTime?: string;
}

interface TransportAlternative {
  mode: string;
  durationMinutes: number;
  costUsd: number | null;
  energyCost: number;
  reason: string;
}

export interface TransportLegResult {
  fromActivityId: string;
  fromName: string;
  fromLat: number;
  fromLng: number;
  toActivityId: string;
  toName: string;
  toLat: number;
  toLng: number;
  dayNumber: number;
  legOrder: number;
  distanceMeters: number;
  distanceDisplay: string;
  recommendedMode: string;
  estimatedDurationMinutes: number;
  estimatedCostUsd: number | null;
  alternativeModes: TransportAlternative[];
  energyCost: number;
  linkedProductId?: string;
  linkedProductUrl?: string;
  routeProvider: "google_routes";
  routeRetrievedAt: string;
  userSelectedMode?: string | null;
}

export interface UserTransportPrefs {
  prioritize: "time" | "cost" | "comfort" | "scenic";
  avoidModes: string[];
  maxWalkMinutes: number;
  accessibility: boolean;
  budgetTier: "budget" | "moderate" | "luxury";
}

export interface SameDayActivityPair {
  from: ActivityLocation;
  to: ActivityLocation;
  dayNumber: number;
  legOrder: number;
}

/** Activity legs never bridge overnight boundaries; an inter-day transfer needs explicit intent. */
export function buildSameDayActivityPairs(activities: ActivityLocation[]): SameDayActivityPair[] {
  const dayGroups: Record<number, ActivityLocation[]> = {};
  for (const activity of activities) {
    if (!dayGroups[activity.dayNumber]) dayGroups[activity.dayNumber] = [];
    dayGroups[activity.dayNumber].push(activity);
  }

  const pairs: SameDayActivityPair[] = [];
  for (const dayNumber of Object.keys(dayGroups).map(Number).sort((a, b) => a - b)) {
    const sorted = dayGroups[dayNumber].sort((a, b) => a.order - b.order);
    for (let index = 0; index < sorted.length - 1; index++) {
      pairs.push({
        from: sorted[index],
        to: sorted[index + 1],
        dayNumber,
        legOrder: index + 1,
      });
    }
  }
  return pairs;
}

const DEFAULT_PREFS: UserTransportPrefs = {
  prioritize: "time",
  avoidModes: [],
  maxWalkMinutes: 15,
  accessibility: false,
  budgetTier: "moderate",
};

const REGIONAL_DISTANCE_KM = 20;
const REGIONAL_SPEED_KMH = {
  road: 70,
  transit: 55,
  rail: 90,
  water: 35,
} as const;

function regionalModeSpeed(mode: string, configuredSpeed: number): number | null {
  const normalized = mode.toLowerCase();
  if (normalized.includes("train") || normalized.includes("rail")) {
    return Math.max(configuredSpeed, REGIONAL_SPEED_KMH.rail);
  }
  if (
    normalized.includes("taxi") ||
    normalized.includes("rideshare") ||
    normalized.includes("car") ||
    normalized.includes("driver")
  ) {
    return Math.max(configuredSpeed, REGIONAL_SPEED_KMH.road);
  }
  if (
    normalized.includes("transit") ||
    normalized.includes("bus") ||
    normalized.includes("coach")
  ) {
    return Math.max(configuredSpeed, REGIONAL_SPEED_KMH.transit);
  }
  if (
    normalized.includes("ferry") ||
    normalized.includes("boat")
  ) {
    return Math.max(configuredSpeed, REGIONAL_SPEED_KMH.water);
  }
  return null;
}

export async function calculateTransportLegs(
  variantId: string,
  activities: ActivityLocation[],
  destination: string,
  userPrefs: Partial<UserTransportPrefs> = {}
): Promise<TransportLegResult[]> {
  const prefs = { ...DEFAULT_PREFS, ...userPrefs };
  const profile = getDestinationProfile(destination);

  const allLegs: TransportLegResult[] = [];
  for (const pair of buildSameDayActivityPairs(activities)) {
    const leg = await computeSingleLeg(
      pair.from,
      pair.to,
      pair.dayNumber,
      pair.legOrder,
      profile,
      prefs,
    );
    if (leg) allLegs.push(leg);
  }

  await persistTransportLegs(variantId, allLegs, destination);
  await persistRoutedVariantSchedule(variantId, allLegs);
  await generateAndCacheMapsUrls(variantId, activities, allLegs);

  // Populate booking options for all persisted legs (fire and complete)
  try {
    await populateBookingOptionsForVariant(variantId, destination);
  } catch (err) {
    console.error("[TransportLegCalculator] Failed to populate booking options:", err);
  }

  return allLegs;
}

async function persistRoutedVariantSchedule(
  variantId: string,
  legs: TransportLegResult[],
): Promise<void> {
  const items = await db
    .select()
    .from(itineraryVariantItems)
    .where(eq(itineraryVariantItems.variantId, variantId))
    .orderBy(itineraryVariantItems.dayNumber, itineraryVariantItems.sortOrder);
  const { updates, unresolved } = propagateActivitySchedule(
    items.map((item, index) => ({
      id: item.id,
      dayNumber: item.dayNumber,
      order: item.sortOrder ?? index,
      startTime: item.startTime,
      endTime: item.endTime,
      durationMinutes: item.duration,
    })),
    legs,
  );
  const unresolvedByActivity = new Map(
    unresolved.map((entry) => [entry.activityId, entry.reason]),
  );

  await Promise.all(
    updates.map((update) => {
      const item = items.find((candidate) => candidate.id === update.id);
      const existingMetadata =
        item?.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
          ? item.metadata as Record<string, unknown>
          : {};
      const unresolvedReason = unresolvedByActivity.get(update.id);
      return db
        .update(itineraryVariantItems)
        .set({
          startTime: update.startTime,
          endTime: update.endTime,
          // Google route output is authoritative. Model-supplied travelTimeFromPrevious is
          // overwritten with the routed value, or NULL when no honest route exists.
          travelTimeFromPrevious: update.travelTimeFromPrevious,
          metadata: {
            ...existingMetadata,
            logisticsSchedule: unresolvedReason
              ? { status: "unresolved", reason: unresolvedReason }
              : { status: "resolved" },
          },
        })
        .where(eq(itineraryVariantItems.id, update.id));
    }),
  );
}

/**
 * THE leg-computation entry point for callers that persist legs themselves (§18 L4 trip-scoped
 * legs). It is the SAME engine `calculateTransportLegs` uses — `computeSingleLeg` below, with the
 * same destination profile resolution and the same preference defaults — deliberately exposed
 * rather than forked, so trip-scoped and variant-scoped legs can never diverge in how
 * distance/mode/duration/alternatives are derived.
 *
 * Pure: no DB write, no maps cache, no booking-option population. Callers own persistence (the
 * trip path writes trip-scoped rows born 'proposed'; the variant path keeps its own pipeline).
 */
export async function computeTransportLeg(
  from: ActivityLocation,
  to: ActivityLocation,
  dayNumber: number,
  legOrder: number,
  destination: string,
  userPrefs: Partial<UserTransportPrefs> = {}
): Promise<TransportLegResult | null> {
  return await computeSingleLeg(
    from,
    to,
    dayNumber,
    legOrder,
    getDestinationProfile(destination),
    { ...DEFAULT_PREFS, ...userPrefs }
  );
}

async function computeSingleLeg(
  from: ActivityLocation,
  to: ActivityLocation,
  dayNumber: number,
  legOrder: number,
  profile: DestinationTransportProfile,
  userPrefs: UserTransportPrefs
): Promise<TransportLegResult | null> {
  // Google only accepts future departures for traffic-aware routing. A schedule without a usable
  // calendar timestamp is routed shortly in the future rather than silently converted from a
  // date-less wall clock in the server timezone.
  const requestedDeparture = from.departureTime ? new Date(from.departureTime) : null;
  const departureTime =
    requestedDeparture && Number.isFinite(requestedDeparture.getTime()) && requestedDeparture.getTime() > Date.now()
      ? requestedDeparture.toISOString()
      : new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const routed = await getTrafficAwareDrivingRoute({
    origin: { lat: from.lat, lng: from.lng },
    destination: { lat: to.lat, lng: to.lng },
    departureTime,
  });
  if (!routed) return null;
  const distanceMeters = routed.distanceMeters;
  const distanceKm = distanceMeters / 1000;
  const drivingConfig = profile.availableModes.find((mode) =>
    /drive|car|taxi|rideshare/i.test(mode.mode),
  );
  const estimatedCostUsd = drivingConfig && (drivingConfig.baseCostPerKm > 0 || drivingConfig.flagFall > 0)
    ? Math.round((drivingConfig.flagFall + distanceKm * drivingConfig.baseCostPerKm) * 100) / 100
    : null;

  return {
    fromActivityId: from.id,
    fromName: from.name,
    fromLat: from.lat,
    fromLng: from.lng,
    toActivityId: to.id,
    toName: to.name,
    toLat: to.lat,
    toLng: to.lng,
    dayNumber,
    legOrder,
    distanceMeters: Math.round(distanceMeters),
    distanceDisplay: formatDistance(distanceMeters),
    recommendedMode: "driving",
    estimatedDurationMinutes: routed.durationMinutes,
    estimatedCostUsd,
    alternativeModes: [],
    energyCost: 0,
    routeProvider: routed.provider,
    routeRetrievedAt: routed.retrievedAt,
  };
}

function scoreModeForUser(
  config: TransportModeConfig,
  durationMinutes: number,
  costUsd: number | null,
  energyCost: number,
  prefs: UserTransportPrefs
): number {
  const weights: Record<string, Record<string, number>> = {
    time:    { time: 0.50, cost: 0.15, comfort: 0.20, scenic: 0.05, energy: 0.10 },
    cost:    { time: 0.15, cost: 0.50, comfort: 0.10, scenic: 0.05, energy: 0.20 },
    comfort: { time: 0.15, cost: 0.10, comfort: 0.50, scenic: 0.10, energy: 0.15 },
    scenic:  { time: 0.10, cost: 0.10, comfort: 0.15, scenic: 0.50, energy: 0.15 },
  };

  const w = weights[prefs.prioritize] || weights.time;

  const timeScore = Math.max(0, 100 - durationMinutes * 2);
  const costScore = costUsd === null ? 100 : Math.max(0, 100 - costUsd * 5);
  const comfortScore = config.comfortScore;
  const scenicScore = config.scenicScore;
  const energyScore = Math.max(0, 100 - energyCost * 5);

  return (
    timeScore * w.time +
    costScore * w.cost +
    comfortScore * w.comfort +
    scenicScore * w.scenic +
    energyScore * w.energy
  );
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function parseHour(scheduledTime: string): number {
  if (!scheduledTime) return 9;
  const match = scheduledTime.match(/T?(\d{2}):\d{2}/);
  if (match) return parseInt(match[1], 10);
  const parts = scheduledTime.split(":");
  if (parts.length >= 2) return parseInt(parts[0], 10);
  return 9;
}

async function persistTransportLegs(
  variantId: string,
  legs: TransportLegResult[],
  destination: string
): Promise<void> {
  await db.delete(transportLegs).where(eq(transportLegs.variantId, variantId));

  if (legs.length === 0) return;

  await db.insert(transportLegs).values(
    legs.map(leg => ({
      variantId,
      dayNumber: leg.dayNumber,
      legOrder: leg.legOrder,
      fromActivityId: leg.fromActivityId,
      fromName: leg.fromName,
      fromLat: leg.fromLat,
      fromLng: leg.fromLng,
      toActivityId: leg.toActivityId,
      toName: leg.toName,
      toLat: leg.toLat,
      toLng: leg.toLng,
      distanceMeters: leg.distanceMeters,
      distanceDisplay: leg.distanceDisplay,
      recommendedMode: leg.recommendedMode,
      estimatedDurationMinutes: leg.estimatedDurationMinutes,
      estimatedCostUsd: leg.estimatedCostUsd ?? null,
      alternativeModes: leg.alternativeModes,
      energyCost: leg.energyCost,
      destinationProfile: destination,
      linkedProductId: leg.linkedProductId ?? null,
      linkedProductUrl: leg.linkedProductUrl ?? null,
    }))
  );
}

async function generateAndCacheMapsUrls(
  variantId: string,
  activities: ActivityLocation[],
  legs: TransportLegResult[]
): Promise<void> {
  const dayGroups: Record<number, ActivityLocation[]> = {};
  for (const act of activities) {
    if (!dayGroups[act.dayNumber]) dayGroups[act.dayNumber] = [];
    dayGroups[act.dayNumber].push(act);
  }

  const googleMapsUrls: Record<number, string> = {};
  const appleMapsUrls: Record<number, string> = {};
  const appleMapsWebUrls: Record<number, string> = {};

  for (const [dayNumStr, dayActivities] of Object.entries(dayGroups)) {
    const dayNum = parseInt(dayNumStr);
    const sorted = dayActivities.sort((a, b) => a.order - b.order);
    const points: ActivityPoint[] = sorted.map(a => ({ lat: a.lat, lng: a.lng, name: a.name }));

    const dayLegs = legs.filter(l => l.dayNumber === dayNum);
    const dominantMode = getDominantMode(dayLegs);

    googleMapsUrls[dayNum] = buildGoogleMapsUrl(points, dominantMode);
    appleMapsUrls[dayNum] = buildAppleMapsUrl(points, dominantMode);
    appleMapsWebUrls[dayNum] = buildAppleMapsWebUrl(points, dominantMode);
  }

  const hash = createLegsHash(legs);

  await db.delete(mapsExportCache).where(eq(mapsExportCache.variantId, variantId));
  await db.insert(mapsExportCache).values({
    variantId,
    googleMapsUrls,
    appleMapsUrls,
    appleMapsWebUrls,
    transportLegsHash: hash,
  });
}

function getDominantMode(legs: TransportLegResult[]): string {
  if (legs.length === 0) return "transit";
  const counts: Record<string, number> = {};
  for (const leg of legs) {
    const mode = leg.userSelectedMode ?? leg.recommendedMode;
    counts[mode] = (counts[mode] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "transit";
}

function createLegsHash(legs: TransportLegResult[]): string {
  const data = legs.map(l => `${l.dayNumber}:${l.legOrder}:${l.recommendedMode}`).join("|");
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
  }
  return hash.toString(16);
}

interface TransportLegRow {
  userSelectedMode: string | null;
  recommendedMode: string;
}

export function getDominantModeFromRows(legs: TransportLegRow[]): string {
  if (legs.length === 0) return "transit";
  const counts: Record<string, number> = {};
  for (const leg of legs) {
    const mode = leg.userSelectedMode ?? leg.recommendedMode;
    counts[mode] = (counts[mode] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "transit";
}

/**
 * Regenerate Google/Apple Maps URLs from current DB transport legs and cache them.
 * Call after a mode change to keep maps URLs up to date.
 * Returns the maps cache row's URL maps for the affected day.
 */
export async function regenerateMapsUrlsFromLegs(
  variantId: string,
  dayNumber: number
): Promise<{ googleMapsUrls: Record<number, string>; appleMapsUrls: Record<number, string>; appleMapsWebUrls: Record<number, string> }> {
  const allLegs = await db
    .select()
    .from(transportLegs)
    .where(eq(transportLegs.variantId, variantId));

  const dayGroups: Record<number, typeof allLegs> = {};
  for (const leg of allLegs) {
    if (!dayGroups[leg.dayNumber]) dayGroups[leg.dayNumber] = [];
    dayGroups[leg.dayNumber].push(leg);
  }

  const googleMapsUrls: Record<number, string> = {};
  const appleMapsUrls: Record<number, string> = {};
  const appleMapsWebUrls: Record<number, string> = {};

  for (const [dayNumStr, dayLegs] of Object.entries(dayGroups)) {
    const dayNum = parseInt(dayNumStr);
    const sorted = dayLegs.sort((a, b) => a.legOrder - b.legOrder);
    const dominantMode = getDominantModeFromRows(sorted);

    const points: ActivityPoint[] = [];
    if (sorted.length > 0) {
      points.push({ lat: sorted[0].fromLat, lng: sorted[0].fromLng, name: sorted[0].fromName || "Start" });
      for (const leg of sorted) {
        points.push({ lat: leg.toLat, lng: leg.toLng, name: leg.toName || "Stop" });
      }
    }

    googleMapsUrls[dayNum] = buildGoogleMapsUrl(points, dominantMode);
    appleMapsUrls[dayNum] = buildAppleMapsUrl(points, dominantMode);
    appleMapsWebUrls[dayNum] = buildAppleMapsWebUrl(points, dominantMode);
  }

  const hash = allLegs.map(l => `${l.dayNumber}:${l.legOrder}:${l.userSelectedMode ?? l.recommendedMode}`).join("|");
  await db.delete(mapsExportCache).where(eq(mapsExportCache.variantId, variantId));
  await db.insert(mapsExportCache).values({
    variantId,
    googleMapsUrls,
    appleMapsUrls,
    appleMapsWebUrls,
    transportLegsHash: hash,
  });

  return { googleMapsUrls, appleMapsUrls, appleMapsWebUrls };
}
