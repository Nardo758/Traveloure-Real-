/**
 * S1-d-2 — THE LITEAPI RATES GATE (ledger `2026-10-10-s1-d2-liteapi-rates`), the R299 shape: the counter
 * and the usage row are BOTH `api_usage_logs` rows (provider `liteapi`, endpoint `hotels_rates`), so the
 * daily cap counts exactly what was recorded. Checked BEFORE the call; a cap of 0, an unreadable counter
 * or a spent cap refuses with `paused` and makes no request. Every call that ran is recorded — a thrown
 * one as a failure that still counts toward the cap.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { apiUsageLogs } from "@shared/schema";
import { LITEAPI_PROVIDER } from "@shared/liteapi";
import { liteapiRatesDailyCap } from "../config/liteapi.config";

export const LITEAPI_RATES_ENDPOINT = "hotels_rates";

export interface LiteapiRatesGateDeps {
  dailyCap: () => number;
  /** Rates calls since the start of the UTC day; null = unreadable. */
  countToday: () => Promise<number | null>;
  record: (r: { success: boolean; ms: number; userId: string | null; env: string; error?: string }) => Promise<void>;
}

function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export const defaultLiteapiRatesGateDeps: LiteapiRatesGateDeps = {
  dailyCap: () => liteapiRatesDailyCap(),
  async countToday() {
    try {
      const [row] = await db
        .select({ n: sql<number>`COALESCE(SUM(${apiUsageLogs.requestCount}), 0)::int` })
        .from(apiUsageLogs)
        .where(and(eq(apiUsageLogs.provider, LITEAPI_PROVIDER), eq(apiUsageLogs.endpoint, LITEAPI_RATES_ENDPOINT), gte(apiUsageLogs.createdAt, startOfUtcDay())));
      return Number(row?.n ?? 0);
    } catch (err: any) {
      console.error("[liteapi-rates] counter unreadable:", err?.message ?? err);
      return null;
    }
  },
  async record(r) {
    try {
      await db.insert(apiUsageLogs).values({
        provider: LITEAPI_PROVIDER,
        endpoint: LITEAPI_RATES_ENDPOINT,
        operation: "POST /hotels/rates",
        userId: r.userId,
        requestCount: 1,
        estimatedCostCents: 0,
        costPerCallCents: 0,
        responseTimeMs: r.ms,
        success: r.success,
        errorMessage: r.error ?? null,
        resultCount: r.success ? 1 : 0,
        metadata: { env: r.env, stored: false },
      } as any);
    } catch (err: any) {
      console.error("[liteapi-rates] usage row not written:", err?.message ?? err);
    }
  },
};

/** May a rates call run now? */
export async function liteapiRatesGate(deps: LiteapiRatesGateDeps): Promise<boolean> {
  const cap = deps.dailyCap();
  if (!(cap > 0)) return false;
  const used = await deps.countToday();
  return used !== null && used < cap;
}

/** Run one rates call through the gate. Refused ⇒ no request and no row. */
export async function gatedLiteapiRatesCall<T>(
  call: () => Promise<T>,
  opts: { userId: string | null; env: string; deps?: LiteapiRatesGateDeps },
): Promise<{ value: T } | { refused: "paused" }> {
  const deps = opts.deps ?? defaultLiteapiRatesGateDeps;
  if (!(await liteapiRatesGate(deps))) return { refused: "paused" };
  const started = Date.now();
  try {
    const value = await call();
    await deps.record({ success: true, ms: Date.now() - started, userId: opts.userId, env: opts.env });
    return { value };
  } catch (err: any) {
    await deps.record({ success: false, ms: Date.now() - started, userId: opts.userId, env: opts.env, error: String(err?.message ?? err).slice(0, 300) });
    throw err;
  }
}
