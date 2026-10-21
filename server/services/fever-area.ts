/**
 * fever-area.ts — a Fever event's Kyoto area (ledger `2026-10-21-blog-checks-fever-area`).
 *
 * Keep Fever's own coordinates when it sends them. When it does not, and it does send an address,
 * geocode that address once with OpenStreetMap Nominatim (at most one request a second, an honest
 * User-Agent) and cache the answer permanently — a miss included, a network failure not. The point
 * is then matched to a Kyoto neighbourhood by centre and radius. The card is given the area name
 * and, when OpenStreetMap was used, the ODbL credit. The street address is never returned.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { cityNeighborhoods, feverAddressGeocodes } from "@shared/schema";
import type { NeighborhoodRow } from "@shared/neighborhood-placement";
import { parseCoord } from "@shared/neighborhood-placement";
import {
  FEVER_OSM_CREDIT,
  feverAddressKey,
  kyotoAreaName,
  nominatimSearchQuery,
  parseNominatimPoint,
} from "@shared/fever-area";
import { NOMINATIM_MIN_INTERVAL_MS } from "./venue-geocode.service";
import { PUBLIC_NOMINATIM_BASE_URL } from "../config/geocoder.config";
import type { FeverEvent } from "./fever.service";

export { FEVER_OSM_CREDIT, NOMINATIM_MIN_INTERVAL_MS };

/** Nominatim's usage policy: identify the application. No email, no secret. */
export const FEVER_NOMINATIM_USER_AGENT = "Traveloure/1.0 (Kyoto event area match; +https://traveloure.com)";

export interface FeverArea {
  areaName: string | null;
  osmCredit: string | null;
}

export interface CachedGeocode {
  addressKey: string;
  latitude: number | null;
  longitude: number | null;
  attribution: string | null;
}

export interface FeverGeocodeCache {
  get(addressKey: string): Promise<CachedGeocode | null>;
  put(row: CachedGeocode): Promise<void>;
}

type FetchLike = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

export interface FeverAreaDeps {
  fetchImpl?: FetchLike;
  cache?: FeverGeocodeCache;
  neighborhoods?: () => Promise<readonly NeighborhoodRow[]>;
  pace?: () => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

function numOrNull(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const dbFeverGeocodeCache: FeverGeocodeCache = {
  async get(addressKey) {
    const [row] = await db.select().from(feverAddressGeocodes).where(eq(feverAddressGeocodes.addressKey, addressKey)).limit(1);
    if (!row) return null;
    return {
      addressKey: row.addressKey,
      latitude: numOrNull(row.latitude),
      longitude: numOrNull(row.longitude),
      attribution: row.attribution,
    };
  },
  async put(row) {
    await db.insert(feverAddressGeocodes).values({
      addressKey: row.addressKey,
      latitude: row.latitude == null ? null : String(row.latitude),
      longitude: row.longitude == null ? null : String(row.longitude),
      attribution: row.attribution,
      lookedUpAt: new Date(),
    }).onConflictDoNothing();
  },
};

async function loadKyotoNeighborhoods(): Promise<NeighborhoodRow[]> {
  return db.select({
    id: cityNeighborhoods.id,
    city: cityNeighborhoods.city,
    name: cityNeighborhoods.name,
    slug: cityNeighborhoods.slug,
    centroidLat: cityNeighborhoods.centroidLat,
    centroidLng: cityNeighborhoods.centroidLng,
    radiusKm: cityNeighborhoods.radiusKm,
  }).from(cityNeighborhoods).where(sql`lower(${cityNeighborhoods.city}) = 'kyoto'`);
}

/** One shared pacer so two requests in one process still stay under one Nominatim call a second. */
export function createNominatimPacer(opts?: { now?: () => number; sleep?: (ms: number) => Promise<void> }): () => Promise<void> {
  const now = opts?.now ?? Date.now;
  const sleep = opts?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let last = 0;
  let chain: Promise<void> = Promise.resolve();
  return () => {
    const ticket = chain.then(async () => {
      const wait = last + NOMINATIM_MIN_INTERVAL_MS - now();
      if (wait > 0) await sleep(wait);
      last = now();
    });
    chain = ticket.then(() => undefined, () => undefined);
    return ticket;
  };
}

const sharedPacer = createNominatimPacer();

function feverPoint(event: FeverEvent): { lat: number; lng: number } | null {
  const c = event.venue?.coordinates;
  if (!c) return null;
  return parseCoord(c.lat, c.lng);
}

async function geocodeAddress(
  query: string,
  fetchImpl: FetchLike,
  pace: () => Promise<void>,
): Promise<{ lat: number; lng: number } | null | "unreachable"> {
  await pace();
  const url = `${PUBLIC_NOMINATIM_BASE_URL}/search?${new URLSearchParams({ q: query, format: "jsonv2", limit: "1" })}`;
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": FEVER_NOMINATIM_USER_AGENT, "Accept-Language": "en" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return "unreachable";
    return parseNominatimPoint(await res.json());
  } catch {
    return "unreachable";
  }
}

function creditFor(fromOsm: boolean, areaName: string | null): string | null {
  return fromOsm || areaName ? FEVER_OSM_CREDIT : null;
}

async function oneArea(
  event: FeverEvent,
  neighborhoods: readonly NeighborhoodRow[],
  cache: FeverGeocodeCache,
  fetchImpl: FetchLike,
  pace: () => Promise<void>,
): Promise<FeverArea> {
  const own = feverPoint(event);
  if (own) {
    const areaName = kyotoAreaName(own.lat, own.lng, neighborhoods);
    return { areaName, osmCredit: creditFor(false, areaName) };
  }
  const address = typeof event.venue?.address === "string" ? event.venue.address.trim() : "";
  if (!address) return { areaName: null, osmCredit: null };
  const query = nominatimSearchQuery(address, event.city, event.country);
  const key = feverAddressKey(query);
  if (!key) return { areaName: null, osmCredit: null };
  const cached = await cache.get(key);
  if (cached) {
    const point = cached.latitude != null && cached.longitude != null ? { lat: cached.latitude, lng: cached.longitude } : null;
    const areaName = point ? kyotoAreaName(point.lat, point.lng, neighborhoods) : null;
    return { areaName, osmCredit: creditFor(point != null, areaName) };
  }
  const hit = await geocodeAddress(query, fetchImpl, pace);
  if (hit === "unreachable") return { areaName: null, osmCredit: null };
  await cache.put({
    addressKey: key,
    latitude: hit?.lat ?? null,
    longitude: hit?.lng ?? null,
    attribution: hit ? FEVER_OSM_CREDIT : null,
  });
  const areaName = hit ? kyotoAreaName(hit.lat, hit.lng, neighborhoods) : null;
  return { areaName, osmCredit: creditFor(hit != null, areaName) };
}

/** One area per event, in order. Neighborhoods are read once. Geocoding is paced. */
export async function resolveFeverAreas(events: readonly FeverEvent[], deps: FeverAreaDeps = {}): Promise<FeverArea[]> {
  if (events.length === 0) return [];
  const neighborhoods = await (deps.neighborhoods ?? loadKyotoNeighborhoods)();
  const cache = deps.cache ?? dbFeverGeocodeCache;
  const fetchImpl = deps.fetchImpl ?? ((url, init) => fetch(url, init) as Promise<{ ok: boolean; json(): Promise<unknown> }>);
  const pace = deps.pace ?? (deps.sleep || deps.now ? createNominatimPacer({ sleep: deps.sleep, now: deps.now }) : sharedPacer);
  const out: FeverArea[] = [];
  for (const event of events) out.push(await oneArea(event, neighborhoods, cache, fetchImpl, pace));
  return out;
}
