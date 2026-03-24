import { db } from "../db";
import { transportLegs, mapsExportCache } from "../../shared/schema";
import { getDestinationProfile, type DestinationTransportProfile, type TransportModeConfig } from "../data/transport-profiles";
import {
  buildGoogleMapsUrl,
  buildAppleMapsUrl,
  buildAppleMapsWebUrl,
  type ActivityPoint,
} from "./maps-url-builder";
import { eq } from "drizzle-orm";

export interface ActivityLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  scheduledTime: string;
  dayNumber: number;
  order: number;
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
}

export interface UserTransportPrefs {
  prioritize: "time" | "cost" | "comfort" | "scenic";
  avoidModes: string[];
  maxWalkMinutes: number;
  accessibility: boolean;
  budgetTier: "budget" | "moderate" | "luxury";
}

const DEFAULT_PREFS: UserTransportPrefs = {
  prioritize: "time",
  avoidModes: [],
  maxWalkMinutes: 15,
  accessibility: false,
  budgetTier: "moderate",
};

export async function calculateTransportLegs(
  variantId: string,
  activities: ActivityLocation[],
  destination: string,
  userPrefs: Partial<UserTransportPrefs> = {}
): Promise<TransportLegResult[]> {
  const prefs = { ...DEFAULT_PREFS, ...userPrefs };
  const profile = getDestinationProfile(destination);

  const dayGroups: Record<number, ActivityLocation[]> = {};
  for (const act of activities) {
    if (!dayGroups[act.dayNumber]) dayGroups[act.dayNumber] = [];
    dayGroups[act.dayNumber].push(act);
  }

  const allLegs: TransportLegResult[] = [];

  for (const dayNum of Object.keys(dayGroups).map(Number).sort((a, b) => a - b)) {
    const sorted = dayGroups[dayNum].sort((a, b) => a.order - b.order);

    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i];
      const to = sorted[i + 1];
      const leg = computeSingleLeg(from, to, dayNum, i + 1, profile, prefs);
      allLegs.push(leg);
    }
  }

  await persistTransportLegs(variantId, allLegs, destination);
  await generateAndCacheMapsUrls(variantId, activities, allLegs);

  return allLegs;
}

function computeSingleLeg(
  from: ActivityLocation,
  to: ActivityLocation,
  dayNumber: number,
  legOrder: number,
  profile: DestinationTransportProfile,
  userPrefs: UserTransportPrefs
): TransportLegResult {
  const distanceMeters = haversineDistance(from.lat, from.lng, to.lat, to.lng);
  const distanceKm = distanceMeters / 1000;
  const departureHour = parseHour(from.scheduledTime);

  const evaluations: Array<TransportAlternative & { _score: number }> = [];

  for (const modeConfig of profile.availableModes) {
    if (!modeConfig.available) continue;
    if (userPrefs.avoidModes.includes(modeConfig.mode)) continue;

    const endHour = modeConfig.availableHours.end === 24 ? 24 : modeConfig.availableHours.end;
    if (departureHour < modeConfig.availableHours.start || departureHour >= endHour) continue;

    if (userPrefs.accessibility && modeConfig.accessibilityScore < 50) continue;

    const realDistanceKm = distanceKm * 1.3;
    const travelMinutes = (realDistanceKm / modeConfig.averageSpeedKmh) * 60;
    const totalMinutes = Math.max(1, Math.ceil(travelMinutes + modeConfig.waitTimeMinutes));

    let costUsd: number | null = null;
    if (modeConfig.baseCostPerKm > 0 || modeConfig.flagFall > 0) {
      costUsd = Math.round((modeConfig.flagFall + realDistanceKm * modeConfig.baseCostPerKm) * 100) / 100;
    }

    const energyCost = Math.min(20, Math.ceil(realDistanceKm * modeConfig.energyCostPerKm));
    const score = scoreModeForUser(modeConfig, totalMinutes, costUsd, energyCost, userPrefs);

    evaluations.push({
      mode: modeConfig.mode,
      durationMinutes: totalMinutes,
      costUsd,
      energyCost,
      reason: "",
      _score: score,
    });
  }

  if (evaluations.length === 0) {
    const walkMins = Math.max(1, Math.ceil((distanceKm * 1.3 / 4.5) * 60));
    evaluations.push({
      mode: "walk",
      durationMinutes: walkMins,
      costUsd: null,
      energyCost: Math.min(20, Math.ceil(distanceKm * 3)),
      reason: "Only available mode",
      _score: 50,
    });
  }

  evaluations.sort((a, b) => b._score - a._score);

  evaluations.forEach((e, i) => {
    if (i === 0) {
      e.reason = "Best match for your preferences";
    } else if (e.costUsd === null || e.costUsd === 0) {
      e.reason = "Free option";
    } else if (evaluations[0].durationMinutes > e.durationMinutes) {
      e.reason = "Fastest option";
    } else if (e.costUsd !== null && evaluations[0].costUsd !== null && e.costUsd < evaluations[0].costUsd) {
      e.reason = "Cheapest option";
    } else {
      e.reason = "Alternative option";
    }
  });

  const best = evaluations[0];
  const alternatives = evaluations.slice(1).map(e => ({
    mode: e.mode,
    durationMinutes: e.durationMinutes,
    costUsd: e.costUsd,
    energyCost: e.energyCost,
    reason: e.reason,
  }));

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
    recommendedMode: best.mode,
    estimatedDurationMinutes: best.durationMinutes,
    estimatedCostUsd: best.costUsd,
    alternativeModes: alternatives,
    energyCost: best.energyCost,
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
