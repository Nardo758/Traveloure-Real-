#!/usr/bin/env tsx

/**
 * Backfill travel_pulse_hidden_gems.neighborhood from lat/lng (v2 spec §5.1, §10).
 *
 * For each gem with latitude/longitude and no neighborhood set, find the
 * nearest city_neighborhoods centroid (within its radiusKm) and write the
 * neighborhood SLUG to the gem. Slug — not name — because slugs are stable
 * across renames and align with the soft-FK design noted on the column.
 *
 * Idempotent: only touches rows where neighborhood IS NULL. Re-runs safely
 * after the seed grows.
 *
 * Run: `tsx server/scripts/backfill-gem-neighborhoods.ts`
 *      `tsx server/scripts/backfill-gem-neighborhoods.ts --dry-run`
 */

import { db } from "../db";
import { cityNeighborhoods, travelPulseHiddenGems } from "@shared/schema";
import { and, isNull, isNotNull, eq } from "drizzle-orm";

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Haversine distance in km between two lat/lng points. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

interface BackfillResult {
  scanned: number;
  matched: number;
  unmatched: number;
  skipped: number;
}

export async function backfillGemNeighborhoods(opts: { dryRun?: boolean } = {}): Promise<BackfillResult> {
  const dryRun = opts.dryRun ?? false;

  // Pull every neighborhood once — small table (16 rows at launch), reasonable
  // to keep up to a few hundred without paginating.
  const neighborhoods = await db.select().from(cityNeighborhoods);
  if (neighborhoods.length === 0) {
    console.warn("[backfill-gems] No neighborhoods seeded. Run server/seeds/city-neighborhoods.seed.ts first.");
    return { scanned: 0, matched: 0, unmatched: 0, skipped: 0 };
  }

  // Index by city for cheaper per-gem candidate filtering.
  const byCity = new Map<string, typeof neighborhoods>();
  for (const n of neighborhoods) {
    const key = n.city.toLowerCase();
    if (!byCity.has(key)) byCity.set(key, []);
    byCity.get(key)!.push(n);
  }

  // Candidate gems: have coords, missing neighborhood.
  const gems = await db
    .select()
    .from(travelPulseHiddenGems)
    .where(
      and(
        isNull(travelPulseHiddenGems.neighborhood),
        isNotNull(travelPulseHiddenGems.latitude),
        isNotNull(travelPulseHiddenGems.longitude),
      ),
    );

  let matched = 0;
  let unmatched = 0;
  let skipped = 0;

  for (const gem of gems) {
    const lat = gem.latitude ? Number(gem.latitude) : null;
    const lng = gem.longitude ? Number(gem.longitude) : null;
    if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) {
      skipped++;
      continue;
    }

    // Prefer same-city candidates, fall back to global if gem.city is unknown.
    const candidates = byCity.get(gem.city.toLowerCase()) ?? neighborhoods;

    let bestSlug: string | null = null;
    let bestDistance = Infinity;
    for (const n of candidates) {
      const nLat = Number(n.centroidLat);
      const nLng = Number(n.centroidLng);
      const radius = Number(n.radiusKm ?? "1.5");
      const dist = haversineKm(lat, lng, nLat, nLng);
      if (dist <= radius && dist < bestDistance) {
        bestDistance = dist;
        bestSlug = n.slug;
      }
    }

    if (bestSlug === null) {
      unmatched++;
      continue;
    }

    if (!dryRun) {
      await db
        .update(travelPulseHiddenGems)
        .set({ neighborhood: bestSlug })
        .where(eq(travelPulseHiddenGems.id, gem.id));
    }
    matched++;
  }

  return { scanned: gems.length, matched, unmatched, skipped };
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const dryRun = process.argv.includes("--dry-run");
  backfillGemNeighborhoods({ dryRun })
    .then((r) => {
      console.log(
        `[backfill-gems] ${dryRun ? "DRY RUN " : ""}scanned=${r.scanned} matched=${r.matched} unmatched=${r.unmatched} skipped=${r.skipped}`,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error("[backfill-gems] Failed:", err);
      process.exit(1);
    });
}
