/**
 * THE MAPS BILLING GATE — the I/O half (R299, ledger `2026-10-04-maps-billing-audit`).
 *
 * The counter and the cost row are BOTH `api_usage_logs` rows with provider `google_maps` and the
 * caller key as the endpoint, so the daily cap counts exactly what was recorded. `estimated_cost_cents`
 * on these rows holds TENTHS of a cent (an integer column; a $5/1,000 call is half a cent) — the same
 * convention the Tavily rows use, and `metadata.costUnit` says so on every row. A caller whose cost is
 * already recorded elsewhere (`costRecordedOn` ≠ api_usage_logs: Places facts on `place_facts`, the
 * matrix on its refresh row) writes its counter row with 0 so a reader never sums the spend twice. A call
 * that has no such row passes `costHere` and records its cost here (FU-S1-1: the stay pick's matrix requests,
 * ledger `2026-10-09-fu-s1-1-stay-pick-cost`) — its elements count against the same caller's cap either way.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../../db";
import { apiUsageLogs } from "@shared/schema";
import { MAPS_CALLERS, MAPS_USAGE_PROVIDER, type MapsCallerKey } from "@shared/maps-billing";
import { mapsApiKey, mapsCallRecordedTenths, mapsCallerDailyCap, mapsCallerEnabled } from "../../config/maps-billing.config";
import { withMapsGate, type MapsCallRecord, type MapsCostHere, type MapsGateDeps, type MapsGateRefusal } from "./maps-billing.core";

export type { MapsCostHere, MapsGateRefusal } from "./maps-billing.core";

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
    // Step 9a ruling 7 (ledger `2026-10-07-step9a-routing-engine`): a failed call costs 0; its row still
    // carries `request_count`, so it counts toward the cap.
    const tenths = mapsCallRecordedTenths(r.key, r.units, r.success, r.costHere);
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
        metadata: r.costHere
          ? { sku: r.sku, costUnit: "tenths_of_cent", costRecordedOn: "api_usage_logs", purpose: r.costHere.purpose, ref: r.costHere.ref ?? null }
          : { sku: r.sku, costUnit: "tenths_of_cent", costRecordedOn: c.costRecordedOn },
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
  opts: { userId?: string | null; sku?: string; costHere?: MapsCostHere; deps?: MapsGateDeps } = {},
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

/**
 * Today's Maps spend per caller (step 9a ruling 8, ledger `2026-10-07-step9a-routing-engine`), for
 * `/internal/jobs/health`. Read from the SAME `api_usage_logs` rows the gate counts and records, so the
 * cap and the spend cannot disagree. `spendTenthsOfCent` is what was RECORDED (a failed call is 0; a
 * caller whose cost lives on another table is 0 here and says where — except the calls that passed their
 * own price, FU-S1-1's stay pick on `route_matrix`, whose dollars are here). null = the read failed — never 0.
 */
export interface MapsCallerSpend {
  caller: MapsCallerKey;
  calls: number;
  failed: number;
  spendTenthsOfCent: number;
  dailyCap: number;
  enabled: boolean;
  costRecordedOn: string;
}
export async function mapsSpendToday(): Promise<MapsCallerSpend[] | null> {
  try {
    const rows = await db
      .select({
        caller: apiUsageLogs.endpoint,
        calls: sql<number>`COALESCE(SUM(${apiUsageLogs.requestCount}), 0)::int`,
        failed: sql<number>`COALESCE(SUM(CASE WHEN ${apiUsageLogs.success} = false THEN ${apiUsageLogs.requestCount} ELSE 0 END), 0)::int`,
        spend: sql<number>`COALESCE(SUM(${apiUsageLogs.estimatedCostCents}), 0)::int`,
      })
      .from(apiUsageLogs)
      .where(and(eq(apiUsageLogs.provider, MAPS_USAGE_PROVIDER), gte(apiUsageLogs.createdAt, startOfUtcDay())))
      .groupBy(apiUsageLogs.endpoint);
    const byCaller = new Map(rows.map((r) => [r.caller, r]));
    return (Object.keys(MAPS_CALLERS) as MapsCallerKey[]).map((caller) => {
      const r = byCaller.get(caller);
      return {
        caller,
        calls: Number(r?.calls ?? 0),
        failed: Number(r?.failed ?? 0),
        spendTenthsOfCent: Number(r?.spend ?? 0),
        dailyCap: mapsCallerDailyCap(caller),
        enabled: mapsCallerEnabled(caller),
        costRecordedOn: MAPS_CALLERS[caller].costRecordedOn,
      };
    });
  } catch (err: any) {
    console.error("[maps-billing] spend read failed:", err?.message ?? err);
    return null;
  }
}

/** The routing engine's three Routes callers (step 9a; the R299 rows the adapter calls by name). */
const ROUTING_CALLERS: readonly MapsCallerKey[] = ["routes_mode", "routes_transit", "routes_drive"];

/**
 * Is any switched-on routing caller paused today (its daily cap reached)? Step 9a, L5 (ledger
 * `2026-10-07-step9a-routing-engine`): the plan then says "Travel times paused today — resumes tomorrow"
 * and keeps its legs as last computed; edits are never blocked. An unreadable counter reads as paused,
 * the gate's own posture. A caller that is switched off is not "paused" — it is off.
 */
export async function routingPausedToday(deps: MapsGateDeps = defaultMapsGateDeps): Promise<boolean> {
  for (const key of ROUTING_CALLERS) {
    if (!deps.enabled(key) || !deps.apiKey()) continue;
    const cap = deps.dailyCap(key);
    const used = await deps.countToday(key);
    if (cap <= 0 || used === null || used >= cap) return true;
  }
  return false;
}
