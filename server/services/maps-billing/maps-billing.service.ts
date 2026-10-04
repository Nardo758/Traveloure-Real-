/**
 * THE MAPS BILLING GATE — the I/O half (R298, ledger `2026-10-04-maps-billing-audit`).
 *
 * The counter and the cost row are BOTH `api_usage_logs` rows with provider `google_maps` and the
 * caller key as the endpoint, so the daily cap counts exactly what was recorded. `estimated_cost_cents`
 * on these rows holds TENTHS of a cent (an integer column; a $5/1,000 call is half a cent) — the same
 * convention the Tavily rows use, and `metadata.costUnit` says so on every row. A caller whose cost is
 * already recorded elsewhere (`costRecordedOn` ≠ api_usage_logs: Places facts on `place_facts`, the
 * matrix on its refresh row) writes its counter row with 0 so a reader never sums the spend twice.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../../db";
import { apiUsageLogs } from "@shared/schema";
import { MAPS_CALLERS, MAPS_USAGE_PROVIDER, type MapsCallerKey } from "@shared/maps-billing";
import { mapsApiKey, mapsCallerCostTenthsOfCent, mapsCallerDailyCap, mapsCallerEnabled } from "../../config/maps-billing.config";
import { withMapsGate, type MapsCallRecord, type MapsGateDeps, type MapsGateRefusal } from "./maps-billing.core";

export type { MapsGateRefusal } from "./maps-billing.core";

function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export const defaultMapsGateDeps: MapsGateDeps = {
  enabled: mapsCallerEnabled,
  apiKey: mapsApiKey,
  dailyCap: mapsCallerDailyCap,
  async countToday(key) {
    try {
      const [row] = await db
        .select({ n: sql<number>`COALESCE(SUM(${apiUsageLogs.requestCount}), 0)::int` })
        .from(apiUsageLogs)
        .where(and(eq(apiUsageLogs.provider, MAPS_USAGE_PROVIDER), eq(apiUsageLogs.endpoint, key), gte(apiUsageLogs.createdAt, startOfUtcDay())));
      return Number(row?.n ?? 0);
    } catch (err: any) {
      console.error(`[maps-billing] ${key} counter unreadable:`, err?.message ?? err);
      return null;
    }
  },
  async record(r: MapsCallRecord) {
    const c = MAPS_CALLERS[r.key];
    const tenths = c.costRecordedOn === "api_usage_logs" ? mapsCallerCostTenthsOfCent(r.key, r.units) : 0;
    try {
      await db.insert(apiUsageLogs).values({
        provider: MAPS_USAGE_PROVIDER,
        endpoint: r.key,
        operation: c.api,
        userId: r.userId ?? null,
        requestCount: r.units,
        estimatedCostCents: tenths,
        costPerCallCents: r.units > 0 ? Math.round(tenths / r.units) : 0,
        responseTimeMs: r.ms,
        success: r.success,
        errorMessage: r.error ?? null,
        resultCount: r.success ? 1 : 0,
        metadata: { sku: r.sku, costUnit: "tenths_of_cent", costRecordedOn: c.costRecordedOn },
      } as any);
    } catch (err: any) {
      console.error(`[maps-billing] ${r.key} cost row not written:`, err?.message ?? err);
    }
  },
};

/** Run one Maps call through the gate. Refused ⇒ no request was made. */
export function gatedMapsCall<T>(
  key: MapsCallerKey,
  call: (apiKey: string) => Promise<{ value: T; units?: number; success?: boolean }>,
  opts: { userId?: string | null; sku?: string; deps?: MapsGateDeps } = {},
): Promise<{ value: T } | { refused: MapsGateRefusal }> {
  return withMapsGate(key, opts.deps ?? defaultMapsGateDeps, call, opts);
}

/** Convenience for callers whose "no answer" is null: a refused call answers null and logs why once. */
export async function gatedMapsCallOrNull<T>(
  key: MapsCallerKey,
  call: (apiKey: string) => Promise<{ value: T | null; units?: number; success?: boolean }>,
  opts: { userId?: string | null; sku?: string; deps?: MapsGateDeps } = {},
): Promise<T | null> {
  const out = await gatedMapsCall(key, call, opts);
  if ("refused" in out) {
    if (out.refused !== "disabled") console.warn(`[maps-billing] ${key} refused: ${out.refused}`);
    return null;
  }
  return out.value;
}
