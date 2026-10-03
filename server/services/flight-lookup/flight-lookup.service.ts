/**
 * "Getting there" — ONE lookup per (flight, date) (surface spec §5, R-j; ledger
 * `2026-10-03-surface-step2-tools-tray`).
 *
 *   · OFF unless `FLIGHT_LOOKUP_ENABLED=1` with a key — then the sheet takes a manual time (§13: no
 *     time is invented for a flight we did not look up).
 *   · CACHED per (flight, date) in the shared cache, so entering the same flight twice — on this plan
 *     or another — spends one lookup.
 *   · CAPPED per UTC day across the platform; the cap COUNTS the cost rows this service writes to
 *     `api_usage_logs` (one source for spend and for the cap), so a cache hit is never counted.
 *   · Every billed call writes its cost row, success or failure.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../../db";
import { apiUsageLogs } from "@shared/schema";
import type { FlightInfo } from "@shared/getting-there";
import { sharedCache } from "../shared-cache.service";
import {
  flightLookupCacheHours,
  flightLookupCostCents,
  flightLookupDailyCap,
  flightLookupEnabled,
} from "../../config/flight-lookup.config";
import { aeroDataBoxAdapter } from "./adapter";
import { lookupFlight as lookupFlightCore, type FlightLookupDeps, type FlightLookupResult } from "./flight-lookup.core";
export type { FlightLookupDeps, FlightLookupResult } from "./flight-lookup.core";

const CACHE_NS = "flight-lookup";

function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export const defaultFlightLookupDeps: FlightLookupDeps = {
  adapter: aeroDataBoxAdapter,
  enabled: flightLookupEnabled,
  cap: flightLookupDailyCap,
  costCents: flightLookupCostCents,
  cacheGet: (key) => sharedCache.get<{ flight: FlightInfo | null }>(CACHE_NS, key),
  cacheSet: (key, value) => sharedCache.set(CACHE_NS, key, value, flightLookupCacheHours() * 3600_000),
  async countToday(provider) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(apiUsageLogs)
      .where(and(eq(apiUsageLogs.provider, provider), eq(apiUsageLogs.endpoint, "flight_lookup"), gte(apiUsageLogs.createdAt, startOfUtcDay())));
    return Number(row?.n ?? 0);
  },
  async logUsage(r) {
    try {
      await db.insert(apiUsageLogs).values({
        provider: r.provider,
        endpoint: "flight_lookup",
        operation: "get",
        userId: r.userId,
        requestCount: 1,
        estimatedCostCents: r.costCents,
        costPerCallCents: r.costCents,
        responseTimeMs: r.ms,
        success: r.success,
        errorMessage: r.error ?? null,
        resultCount: r.found ? 1 : 0,
        metadata: {},
      } as any);
    } catch (err: any) {
      console.error("[flight-lookup] cost row not written:", err?.message ?? err);
    }
  },
};

export async function lookupFlight(
  input: { flightNumber: string; date: string; userId: string | null },
  deps: FlightLookupDeps = defaultFlightLookupDeps,
): Promise<FlightLookupResult> {
  return lookupFlightCore(input, deps);
}
