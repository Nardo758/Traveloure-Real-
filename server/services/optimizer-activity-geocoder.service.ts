import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../db";
import { optimizerGeocodeCache } from "@shared/schema";
import { geocodeAddress, type GeocodeResult } from "../utils/geocode";

export interface OptimizerGeocodeActivity {
  name: string;
  location?: string;
  providerServiceId?: string;
  latitude?: number;
  longitude?: number;
}

export interface OptimizerCoordinateSource {
  name: string;
  providerServiceId?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
}

interface CacheEntry {
  status: string;
  latitude: string | null;
  longitude: string | null;
}

interface GeocodeCacheAdapter {
  get(provider: string, queryHash: string): Promise<CacheEntry | null>;
  put(entry: {
    provider: string;
    queryHash: string;
    normalizedQuery: string;
    status: "success" | "miss";
    result: GeocodeResult | null;
    expiresAt: Date;
  }): Promise<void>;
}

export interface OptimizerGeocodeBudget {
  reserve(): boolean;
  used(): number;
}

const SUCCESS_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const inFlightGeocodes = new Map<string, Promise<GeocodeResult | null>>();

export function createOptimizerGeocodeBudget(maxLookups = 12): OptimizerGeocodeBudget {
  let count = 0;
  return {
    reserve() {
      if (count >= maxLookups) return false;
      count += 1;
      return true;
    },
    used: () => count,
  };
}

const databaseCache: GeocodeCacheAdapter = {
  async get(provider, queryHash) {
    const [row] = await db
      .select({
        status: optimizerGeocodeCache.status,
        latitude: optimizerGeocodeCache.latitude,
        longitude: optimizerGeocodeCache.longitude,
      })
      .from(optimizerGeocodeCache)
      .where(and(
        eq(optimizerGeocodeCache.provider, provider),
        eq(optimizerGeocodeCache.queryHash, queryHash),
        gt(optimizerGeocodeCache.expiresAt, new Date()),
      ))
      .limit(1);
    return row ?? null;
  },
  async put(entry) {
    const values = {
      provider: entry.provider,
      queryHash: entry.queryHash,
      normalizedQuery: entry.normalizedQuery,
      status: entry.status,
      latitude: entry.result ? String(entry.result.lat) : null,
      longitude: entry.result ? String(entry.result.lng) : null,
      formattedAddress: entry.result?.formattedAddress ?? null,
      locationType: entry.result?.locationType ?? null,
      resultTypes: entry.result?.types ?? [],
      expiresAt: entry.expiresAt,
      updatedAt: new Date(),
    };
    await db.insert(optimizerGeocodeCache).values(values).onConflictDoUpdate({
      target: [optimizerGeocodeCache.provider, optimizerGeocodeCache.queryHash],
      set: values,
    });
  },
};

function finiteCoordinate(value: unknown): number | null {
  if (value == null || (typeof value === "string" && value.trim() === "")) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function copyCoordinates(
  activity: OptimizerGeocodeActivity,
  source: OptimizerCoordinateSource | undefined,
): boolean {
  const latitude = finiteCoordinate(source?.latitude);
  const longitude = finiteCoordinate(source?.longitude);
  if (latitude == null || longitude == null) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
  activity.latitude = latitude;
  activity.longitude = longitude;
  return true;
}

function isSpecificResult(result: GeocodeResult): boolean {
  if (!Number.isFinite(result.lat) || !Number.isFinite(result.lng)) return false;
  if (result.lat < -90 || result.lat > 90 || result.lng < -180 || result.lng > 180) return false;
  if (result.locationType === "ROOFTOP" || result.locationType === "RANGE_INTERPOLATED") return true;
  const types = new Set(result.types ?? []);
  return [
    "establishment",
    "point_of_interest",
    "premise",
    "subpremise",
    "street_address",
    "tourist_attraction",
    "park",
    "natural_feature",
    "lodging",
    "restaurant",
    "museum",
  ].some((type) => types.has(type));
}

function normalizedQueryFor(activity: OptimizerGeocodeActivity, destination: string): string | null {
  const name = activity.name?.trim();
  if (!name) return null;
  const parts = [name, activity.location?.trim(), destination?.trim()]
    .filter((part): part is string => Boolean(part));
  const deduped = parts.filter((part, index) =>
    parts.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index
  );
  if (deduped.length < 2) return null;
  return deduped.join(", ").replace(/\s+/g, " ").trim().toLowerCase();
}

export async function resolveOptimizerActivityCoordinates(
  activities: OptimizerGeocodeActivity[],
  baselineItems: OptimizerCoordinateSource[],
  catalogCoordinates: Map<string, {
    latitude: number | string | null;
    longitude: number | string | null;
  }>,
  destination: string,
  budget: OptimizerGeocodeBudget,
  dependencies: {
    cache?: GeocodeCacheAdapter;
    geocode?: (query: string) => Promise<GeocodeResult | null>;
    now?: () => Date;
  } = {},
): Promise<void> {
  const cache = dependencies.cache ?? databaseCache;
  const geocode = dependencies.geocode ?? geocodeAddress;
  const now = dependencies.now ?? (() => new Date());
  const baselineByService = new Map(
    baselineItems.filter((item) => item.providerServiceId).map((item) => [item.providerServiceId!, item]),
  );
  const baselineByName = new Map(
    baselineItems.map((item) => [item.name.trim().toLowerCase(), item]),
  );

  // Sequential within one variant; variants run in parallel, capping live Google calls at three.
  for (const activity of activities) {
    if (copyCoordinates(activity, activity)) continue;
    const catalog = activity.providerServiceId
      ? catalogCoordinates.get(activity.providerServiceId)
      : undefined;
    if (copyCoordinates(activity, catalog ? { name: activity.name, ...catalog } : undefined)) continue;
    const baseline = (activity.providerServiceId && baselineByService.get(activity.providerServiceId))
      || baselineByName.get(activity.name.trim().toLowerCase());
    if (copyCoordinates(activity, baseline)) continue;

    // An AI-created activity has no trusted identity behind its name/location text. Do not turn
    // that text into a guessed pin. A providerServiceId is only accepted by the optimizer after
    // it has been matched to an offered catalog service, so linked activities retain the existing
    // geocoding fallback when their trusted source has no stored coordinates.
    if (!activity.providerServiceId) continue;

    const normalizedQuery = normalizedQueryFor(activity, destination);
    if (!normalizedQuery) continue;
    const queryHash = createHash("sha256").update(normalizedQuery).digest("hex");
    try {
      const cached = await cache.get("google", queryHash);
      if (cached) {
        if (cached.status === "success") copyCoordinates(activity, {
          name: activity.name,
          latitude: cached.latitude,
          longitude: cached.longitude,
        });
        continue;
      }
      let request = inFlightGeocodes.get(queryHash);
      if (!request) {
        if (!budget.reserve()) continue;
        request = geocode(normalizedQuery)
          .then((result) => result && isSpecificResult(result) ? result : null);
        inFlightGeocodes.set(queryHash, request);
        void request.then(
          () => inFlightGeocodes.delete(queryHash),
          () => inFlightGeocodes.delete(queryHash),
        );
      }
      const accepted = await request;
      try {
        await cache.put({
          provider: "google",
          queryHash,
          normalizedQuery,
          status: accepted ? "success" : "miss",
          result: accepted,
          expiresAt: new Date(now().getTime() + (accepted ? SUCCESS_TTL_MS : MISS_TTL_MS)),
        });
      } catch (cacheError) {
        console.warn(`[optimizer] could not cache geocode for "${activity.name}"`, cacheError);
      }
      if (accepted) copyCoordinates(activity, {
        name: activity.name,
        latitude: accepted.lat,
        longitude: accepted.lng,
      });
    } catch (error) {
      console.warn(`[optimizer] geocode failed for "${activity.name}"; leaving coordinates NULL`, error);
    }
  }
}