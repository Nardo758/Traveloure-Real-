#!/usr/bin/env tsx

/**
 * Location-cache seed (flight-repoint decision, Aug 2026).
 *
 * Populates `location_cache` from the vendored static IATA dataset
 * (server/data/iata-airports.json — OurAirports-derived: large airports + medium airports
 * with scheduled service, each carrying a real 3-letter IATA code). The airport/city
 * autocomplete read path (`GET /api/amadeus/locations` → storage.searchLocationCache) was
 * intact but starved: its only writer was the deleted Amadeus live-lookup, so the table
 * held nothing and autocomplete returned []. This seed makes the cache the durable source —
 * NO per-keystroke external API calls (DECISIONS.md ruling 34: Amadeus dropped;
 * location_cache is the only location source).
 *
 * Two row shapes, matching the read path's `locationType` filter:
 *   - AIRPORT: one row per IATA airport.
 *   - CITY:    one row per (municipality, country), keyed by its busiest airport's IATA
 *              (used as the city code) — serves the hotel/city autocomplete (`subType=CITY`).
 *
 * Idempotent + cheap on re-run: rows are written through storage.upsertLocationCache
 * (keyed on iataCode+locationType), and a count fast-path skips the whole pass once the
 * table already holds at least the dataset's row count of non-expired rows.
 *
 * Seeded rows get a far-future expiresAt: this is static reference data (airports don't
 * churn), and the read path filters `expires_at > now()` — a 30-day default would silently
 * starve autocomplete again a month after deploy.
 *
 * Run standalone: `tsx server/seeds/location-cache.seed.ts`
 */

import { db } from "../db";
import { locationCache } from "@workspace/db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import airports from "../data/iata-airports.json";

interface SeedAirport {
  iata: string;
  name: string;
  city: string | null;
  country: string;
  cc: string;
  region: string | null;
  lat: number | null;
  lon: number | null;
  score: number;
}

// Static reference data — never let it fall out of the read path's expiry window.
const SEED_EXPIRES_AT = new Date("2099-12-31T00:00:00Z");
const CONCURRENCY = 10;

function deriveCities(rows: SeedAirport[]): SeedAirport[] {
  const byCity = new Map<string, SeedAirport>();
  for (const a of rows) {
    if (!a.city) continue;
    const key = `${a.city.toLowerCase()}|${a.cc}`;
    const existing = byCity.get(key);
    if (!existing || a.score > existing.score) byCity.set(key, a);
  }
  return Array.from(byCity.values());
}

export async function seedLocationCache(): Promise<{ upserted: number; skipped: boolean }> {
  const rows = airports as SeedAirport[];
  const cities = deriveCities(rows);
  const expectedTotal = rows.length + cities.length;

  // Fast path: dataset already fully present (count of non-expired rows >= dataset size).
  const [{ count: existing }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(locationCache)
    .where(sql`${locationCache.expiresAt} > now()`);
  if (existing >= expectedTotal) {
    return { upserted: 0, skipped: true };
  }

  let upserted = 0;

  const upsertBatch = async (batch: Array<Parameters<typeof storage.upsertLocationCache>[0]>) => {
    await Promise.all(batch.map((row) => storage.upsertLocationCache(row)));
    upserted += batch.length;
  };

  const airportRows = rows.map((a) => ({
    iataCode: a.iata,
    locationType: "AIRPORT",
    name: a.name,
    detailedName: [a.city, a.country].filter(Boolean).join(", ") || null,
    cityName: a.city,
    cityCode: a.iata,
    countryName: a.country,
    countryCode: a.cc,
    regionCode: a.region,
    stateCode: a.region ? a.region.split("-")[1] ?? null : null,
    latitude: a.lat != null ? String(a.lat) : null,
    longitude: a.lon != null ? String(a.lon) : null,
    travelerScore: a.score,
    expiresAt: SEED_EXPIRES_AT,
  }));

  const cityRows = cities.map((a) => ({
    iataCode: a.iata,
    locationType: "CITY",
    name: a.city!,
    detailedName: `${a.city}, ${a.country}`,
    cityName: a.city,
    cityCode: a.iata,
    countryName: a.country,
    countryCode: a.cc,
    regionCode: a.region,
    stateCode: a.region ? a.region.split("-")[1] ?? null : null,
    latitude: a.lat != null ? String(a.lat) : null,
    longitude: a.lon != null ? String(a.lon) : null,
    travelerScore: a.score,
    expiresAt: SEED_EXPIRES_AT,
  }));

  const all = [...airportRows, ...cityRows];
  for (let i = 0; i < all.length; i += CONCURRENCY) {
    await upsertBatch(all.slice(i, i + CONCURRENCY));
  }

  return { upserted, skipped: false };
}

const isMainModule = /location-cache\.seed\.(?:ts|js|mjs)$/.test(process.argv[1] ?? "");
if (isMainModule) {
  seedLocationCache()
    .then((result) => {
      console.log(`Location cache seed: upserted=${result.upserted} skipped=${result.skipped}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Location cache seed failed:", err);
      process.exit(1);
    });
}
