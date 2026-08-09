/**
 * market-geography.service.ts — DB-first lookup for a market's self-rendered geography layer
 * (CLAUDE.md market-geography ruling, migration 186; Aug 9 2026). Replaces the old
 * shared/geo/market-geography.ts MARKET_GEOGRAPHIES literal lookup: the `market_geography` table
 * is now the primary source (written by the admin "Add market" flow via market-extract.service.ts),
 * with the committed server/geo/kyoto-geography.ts KYOTO_GEOGRAPHY literal as the fallback for
 * markets no admin has extracted yet. Same contains-match semantics as the old
 * `getMarketGeography()` so callers migrate with no behavior change on day one (an empty table is
 * behavior-neutral — every destination that used to match "kyoto" still matches it, via fallback).
 *
 * §13: an absent match (no DB row, no fallback match) returns null — callers render without a
 * geography layer, never another market's shapes.
 */
import { db } from "../db";
import { marketGeography } from "@shared/schema";
import type { MarketGeography } from "@shared/geo/market-geography";
import { KYOTO_GEOGRAPHY } from "../geo/kyoto-geography";

const CACHE_TTL_MS = 5 * 60 * 1000; // §-none (display data, no money concern) — just keeps admin writes from a 5-min gap to prod reads

type MarketGeographyRow = typeof marketGeography.$inferSelect;

/** Server-side fallback set — today just the one committed literal, keyed the same way a DB row
 *  would be (by its `market` slug), so the contains-match logic is identical for both sources. */
const FALLBACK_GEOGRAPHIES: ReadonlyMap<string, MarketGeography> = new Map([
  ["kyoto", KYOTO_GEOGRAPHY],
]);

function rowToGeography(row: MarketGeographyRow): MarketGeography {
  return {
    market: row.market,
    bbox: row.bbox as [number, number, number, number],
    water: (row.water as [number, number][][] | null) ?? [],
    parks: (row.parks as [number, number][][] | null) ?? [],
    roads: (row.roads as [number, number][][] | null) ?? [],
  };
}

interface CacheState {
  byMarket: Map<string, MarketGeography>;
  loadedAt: number;
}

let cache: CacheState | null = null;
let loadingPromise: Promise<CacheState> | null = null;

async function loadCache(): Promise<CacheState> {
  const rows = await db.select().from(marketGeography);
  const byMarket = new Map<string, MarketGeography>();
  for (const row of rows) byMarket.set(row.market, rowToGeography(row));
  const state: CacheState = { byMarket, loadedAt: Date.now() };
  cache = state;
  return state;
}

async function ensureCache(): Promise<CacheState> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache;
  if (!loadingPromise) {
    loadingPromise = loadCache().finally(() => {
      loadingPromise = null;
    });
  }
  return loadingPromise;
}

// Best-effort eager warm at module load — non-blocking, failures swallowed (the DB pool may not
// be ready yet in every import order). Real callers always go through ensureCache()/await below,
// so a failed warm here only means the FIRST real call pays the load cost instead of this one.
ensureCache().catch((err) => {
  console.warn("[market-geography] eager cache warm failed (will retry on first real lookup):", err?.message ?? err);
});

function matchContains(destination: string, byMarket: ReadonlyMap<string, MarketGeography>): MarketGeography | null {
  const d = destination.toLowerCase();
  // Array.from(...).find(...) rather than `for...of` over a Map — the repo's tsconfig target
  // doesn't have downlevelIteration on (the same constraint shared/selection-controls.ts and
  // server/storage.ts already work around elsewhere).
  const hit = Array.from(byMarket.entries()).find(([slug]) => d.includes(slug));
  return hit ? hit[1] : null;
}

/** Async DB-first lookup — the primary entry point for any caller that can await (routes,
 *  the admin console, etc). Case-insensitive contains-match of each `market_geography` row's slug
 *  against `destination` (same semantics the old shared getMarketGeography() used); falls back to
 *  FALLBACK_GEOGRAPHIES (today: kyoto) when no DB row matches; null when nothing matches at all. */
export async function getMarketGeographyForDestination(
  destination: string | null | undefined,
): Promise<MarketGeography | null> {
  if (!destination) return null;
  const state = await ensureCache();
  return matchContains(destination, state.byMarket) ?? matchContains(destination, FALLBACK_GEOGRAPHIES);
}

/** Sync best-effort lookup for callers that cannot await a DB round-trip — specifically
 *  server/services/ready-made-teaser-map.service.ts, whose exported render function has a
 *  synchronous signature consumed by a caller outside this build's file-ownership scope
 *  (server/routes/ready-made.routes.ts). Reads whatever this module already has cached (real DB
 *  rows, once the cache has warmed — which happens within moments of server start via the eager
 *  warm above, and again on every admin write via invalidateMarketGeographyCache) plus the same
 *  literal fallback, and NEVER blocks on a query. If the cache genuinely has not warmed yet (the
 *  first instant after boot, or the DB is unreachable), only the fallback is available — the same
 *  honest-absence posture (§13) as "no row matches", just applied to "not loaded yet" instead of
 *  "doesn't exist". */
export function getMarketGeographyForDestinationSync(
  destination: string | null | undefined,
): MarketGeography | null {
  if (!destination) return null;
  if (cache) {
    const fromDb = matchContains(destination, cache.byMarket);
    if (fromDb) return fromDb;
  }
  return matchContains(destination, FALLBACK_GEOGRAPHIES);
}

/** Invalidate the in-process cache — called by the admin write path (POST /api/admin/markets,
 *  POST /api/admin/markets/:slug/refresh-geography) after an upsert so the next read (DB-first
 *  async, or the sync best-effort path once it reloads) picks up the new row within this process
 *  instead of waiting out the TTL. Drops the whole cache rather than patching one key — simplest
 *  correct behavior, and market_geography writes are an admin-rate action, not a hot path. */
export function invalidateMarketGeographyCache(): void {
  cache = null;
  loadingPromise = null;
}
