/**
 * THE ROUTE CACHE — its one reader and one writer (step 9a, ledger `2026-10-07-step9a-routing-engine`;
 * brief L2, R-at). Cache-first: a fresh row (checked within ROUTE_CACHE_TTL_DAYS) answers without a
 * call; a miss calls the adapter and writes ONLY the five allowed facts through `toRouteCacheEntry`.
 * A paused or failed call writes nothing (failed calls cost 0 — ruling 7 — and are never cached as
 * "no route", so the next edit can try again). A hit keeps the source's ORIGINAL checked date.
 */
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { routeCache } from "@shared/schema";
import {
  routeCacheKey,
  routePointKey,
  toRouteCacheEntry,
  type RouteAnswer,
  type RouteOutcome,
  type RoutePoint,
  type RoutingAdapter,
  type RoutingMode,
} from "@shared/routing-engine";
import { routeCacheTtlDays } from "../../config/travel-time.config";

export interface RouteCacheStore {
  get(key: string): Promise<RouteAnswer | null>;
  put(key: string, parts: { originKey: string; destinationKey: string; mode: RoutingMode; hourBucket: number | null }, route: RouteAnswer): Promise<void>;
}

/** Is a cached answer still fresh? Pure. */
export function isRouteFresh(checkedAt: string | Date | null | undefined, ttlDays: number, now: Date = new Date()): boolean {
  if (!checkedAt || ttlDays <= 0) return false;
  const at = new Date(checkedAt).getTime();
  if (!Number.isFinite(at)) return false;
  return now.getTime() - at < ttlDays * 86_400_000;
}

export const dbRouteCacheStore: RouteCacheStore = {
  async get(key) {
    const [row] = await db.select().from(routeCache).where(eq(routeCache.cacheKey, key)).limit(1);
    if (!row || row.durationMin == null || row.distanceM == null || !row.source || !row.checkedAt) return null;
    if (!isRouteFresh(row.checkedAt, routeCacheTtlDays())) return null;
    const amount = row.fareAmount == null ? null : Number(row.fareAmount);
    return {
      durationMin: row.durationMin,
      distanceM: row.distanceM,
      line: row.line ?? null,
      fare: amount != null && Number.isFinite(amount) && row.fareCurrency ? { amount, currency: row.fareCurrency } : null,
      provenance: { source: row.source, checkedAt: new Date(row.checkedAt).toISOString() },
    };
  },
  async put(key, parts, route) {
    const e = toRouteCacheEntry(route);
    const values = {
      originKey: parts.originKey,
      destinationKey: parts.destinationKey,
      mode: parts.mode,
      hourBucket: parts.hourBucket,
      durationMin: e.durationMin,
      distanceM: e.distanceM,
      line: e.line,
      fareAmount: e.fare ? String(e.fare.amount) : null,
      fareCurrency: e.fare ? e.fare.currency : null,
      source: e.provenance.source,
      checkedAt: new Date(e.provenance.checkedAt),
    };
    await db.insert(routeCache).values({ cacheKey: key, ...values }).onConflictDoUpdate({ target: routeCache.cacheKey, set: values });
  },
};

export interface RoutedLegResult {
  outcome: RouteOutcome;
  cacheKey: string;
  /** True when the answer came from the cache (no call made). */
  cached: boolean;
}

/**
 * Answers in flight, by cache key: two concurrent asks for the same leg (the four Optimize versions run
 * in parallel and share most pairs) make ONE call. Process-local, so it bounds a burst, not the fleet.
 */
const inFlight = new Map<string, Promise<RoutedLegResult>>();

/** Cache-first resolution of one leg. Never throws: a store failure falls through to the adapter. */
export function routeLegCached(
  input: { origin: RoutePoint; destination: RoutePoint; mode: RoutingMode; departAt: Date | null; hourBucket: number | null },
  adapter: RoutingAdapter,
  store: RouteCacheStore = dbRouteCacheStore,
): Promise<RoutedLegResult> {
  const key = `${adapter.source}:${routeCacheKey(input.origin, input.destination, input.mode, input.hourBucket)}`;
  const pending = inFlight.get(key);
  if (pending) return pending.then((r) => ({ ...r, cached: true }));
  const p = routeLegCachedOnce(input, adapter, store).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

async function routeLegCachedOnce(
  input: { origin: RoutePoint; destination: RoutePoint; mode: RoutingMode; departAt: Date | null; hourBucket: number | null },
  adapter: RoutingAdapter,
  store: RouteCacheStore = dbRouteCacheStore,
): Promise<RoutedLegResult> {
  const { origin, destination, mode, departAt, hourBucket } = input;
  const key = routeCacheKey(origin, destination, mode, hourBucket);
  try {
    const hit = await store.get(key);
    if (hit) return { outcome: { kind: "ok", route: hit }, cacheKey: key, cached: true };
  } catch (err: any) {
    console.error("[routing] cache read failed:", err?.message ?? err);
  }
  const outcome = await adapter.route(origin, destination, mode, departAt);
  if (outcome.kind === "ok") {
    const entry = toRouteCacheEntry(outcome.route);
    try {
      await store.put(key, { originKey: routePointKey(origin), destinationKey: routePointKey(destination), mode, hourBucket }, entry);
    } catch (err: any) {
      console.error("[routing] cache write failed:", err?.message ?? err);
    }
    return { outcome: { kind: "ok", route: entry }, cacheKey: key, cached: false };
  }
  return { outcome, cacheKey: key, cached: false };
}
