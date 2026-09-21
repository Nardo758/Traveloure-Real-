/**
 * ONE Tavily client for the whole codebase (§18 rule 1 — ONE implementation, many callers).
 *
 * Before this module, four call sites each built their own `tavily({apiKey})` SDK client
 * (`dmo-ingestion.service.ts`, `booking-verification.service.ts`, `evidence-scorer.service.ts`,
 * `content/scrapers/DMOCrawler.ts`) and none of them logged a call anywhere. `TAVILY_MONTHLY_CAP_USD`
 * (`server/config/trailhead.config.ts`) has therefore been an unobservable hard cap since it was
 * ratified (FOLLOWUPS.md `tavily-spend-unlogged` / `web-gap-spend-logging`, F4). This module wraps
 * the SDK's `search` and `extract` and logs EVERY call — success or throw — to `api_usage_logs`
 * through the existing `apiUsageService.logApiCall` writer (`server/services/api-usage.service.ts`,
 * the same writer/table the Amadeus `logAmadeusCall` wrapper uses, `*_PRICING_TENTHS` shape copied
 * below), so the cap finally has something to read against (ledger `2026-09-18-tavily-spend-logged`).
 *
 * §15b (an ancillary write may not break the operation it is logging): a throwing LOGGER is caught
 * and warned, never surfaced — the Tavily call's own result/throw is what the caller sees. A
 * throwing SDK call is still logged (the credit was spent, or the attempt was made, either way) and
 * then rethrown UNCHANGED — this module never swallows or reshapes a Tavily error.
 *
 * §8 (no fee/price literal outside config): the tenths-of-cents pricing table below is DERIVED from
 * the two USD constants in `server/config/trailhead.config.ts` — never restated as a literal here or
 * at any call site.
 *
 * Two constructors, one null-vs-always split, because the four call sites do not all have the same
 * "no key" posture today and this module preserves each one rather than unifying them:
 *   - `getTavilyClient()` reads `TAVILY_API_KEY` and returns `null` when it is absent — the posture
 *     `dmo-ingestion.service.ts` (`isDmoIngestReady()`), `booking-verification.service.ts`
 *     (`isBookingVerificationReady()`) and `evidence-scorer.service.ts` (`defaultSearch()` returning
 *     `null`) already have and keep.
 *   - `createTavilyClient(apiKey)` ALWAYS constructs a client, even with an empty key — the posture
 *     `DMOCrawler` already has (it warns and continues; a bad/absent key fails at the real Tavily
 *     call, not before). Both funnel through the same `wrapClient` — one wrapping/logging
 *     implementation, two "what if there's no key" policies over it.
 */
import { tavily as createTavilySdkClient, type TavilyClient as TavilySdkClient } from "tavily";
import {
  TAVILY_PRICE_PER_SEARCH_USD,
  TAVILY_PRICE_PER_EXTRACT_USD,
  TAVILY_MONTHLY_CAP_USD,
} from "../config/trailhead.config";
import { apiUsageService, type ApiUsageLogParams } from "./api-usage.service";
import { resolveSpendAuthorization, SpendCapExceededError } from "./spend-guard.service";

export type TavilyEndpoint = "search" | "extract";

/**
 * Tenths-of-cents-per-call — the same unit `AMADEUS_PRICING_TENTHS` uses in
 * `api-usage.service.ts` (i.e. $0.001 = 1). Derived from the two USD constants in
 * `trailhead.config.ts`; never restated as a bare number here or at any call site (§8).
 */
export const TAVILY_PRICING_TENTHS: Readonly<Record<TavilyEndpoint, number>> = Object.freeze({
  search: Math.round(TAVILY_PRICE_PER_SEARCH_USD * 1000),
  extract: Math.round(TAVILY_PRICE_PER_EXTRACT_USD * 1000),
});

type TavilySearchFn = TavilySdkClient["search"];
type TavilyExtractFn = TavilySdkClient["extract"];

/** The narrow shape every call site in this codebase actually uses. */
export interface TavilyLoggingClient {
  search: TavilySearchFn;
  extract: TavilyExtractFn;
}

/** Minimal logger shape this module needs — matches `apiUsageService`, injectable for tests. */
export interface TavilyUsageLogger {
  logApiCall(params: ApiUsageLogParams): Promise<void>;
}

export interface TavilyClientDeps {
  /** Explicit key. `getTavilyClient()` defaults this to `process.env.TAVILY_API_KEY`. */
  apiKey?: string;
  /** Injected Tavily SDK client (tests) — bypasses the real `tavily({apiKey})` construction. */
  sdk?: TavilySdkClient;
  /** Injected usage logger (tests). Defaults to the shared `apiUsageService`. */
  logger?: TavilyUsageLogger;
  /** Injected clock (tests) — used only to measure `responseTimeMs`. Defaults to `Date.now`. */
  now?: () => number;
  /**
   * Injected month-to-date spend reader (tests). Defaults to the cached reader below, which wraps
   * `getTavilyMonthToDateUsd()`. Returning `null` means THE METER COULD NOT BE READ, which the
   * guard answers by authorizing with `meter_unavailable` — see spend-guard.service.ts's stated
   * fail-open posture.
   */
  readMonthToDateUsd?: () => Promise<number | null>;
  /** Injected ceiling (tests). Defaults to the ratified `TAVILY_MONTHLY_CAP_USD` (R-T1-c). */
  capUsd?: number | null;
}

/**
 * The meter is CACHED, because the guard runs on every Tavily call and the underlying read is a
 * grouped aggregate over `api_usage_logs`. A per-call aggregate would make the cost guard itself
 * the expensive thing. The window is deliberately short — the overshoot it permits is bounded by
 * (calls in that window x per-call price), i.e. fractions of a cent, against saving one aggregate
 * per call. It is NOT a correctness mechanism: the guard is already non-atomic by construction
 * (spend-guard.service.ts's stated negative space), and this only widens that same window.
 */
const METER_CACHE_MS = 60_000;
let meterCache: { atMs: number; usd: number | null } | null = null;

/** Exported for tests ONLY — a cached meter across test cases would leak state between them. */
export function __resetTavilyMeterCacheForTests(): void {
  meterCache = null;
}

async function readCachedMonthToDateUsd(nowMs: number): Promise<number | null> {
  if (meterCache && nowMs - meterCache.atMs < METER_CACHE_MS) return meterCache.usd;
  try {
    const { getTavilyMonthToDateUsd } = await import("./api-costs.service");
    const { monthToDateUsd } = await getTavilyMonthToDateUsd();
    meterCache = { atMs: nowMs, usd: monthToDateUsd };
    return monthToDateUsd;
  } catch (err: any) {
    // A FAILED READ IS NOT A SPEND OF ZERO (§13). `null` tells the guard the meter is unreadable,
    // which it answers with `meter_unavailable` rather than with "you have spent nothing".
    console.error("[tavily-client] Tavily spend meter unreadable:", err?.message || err);
    meterCache = { atMs: nowMs, usd: null };
    return null;
  }
}

async function logTavilyCall(
  logger: TavilyUsageLogger,
  endpoint: TavilyEndpoint,
  success: boolean,
  responseTimeMs: number,
  resultCount: number | undefined,
  errorMessage: string | undefined,
): Promise<void> {
  try {
    await logger.logApiCall({
      provider: "tavily",
      endpoint,
      operation: `tavily_${endpoint}`,
      requestCount: 1,
      // Stored as tenths-of-cents, matching every other external-API row this table carries
      // (see api-usage.service.ts's own comment on the unit).
      estimatedCostCents: TAVILY_PRICING_TENTHS[endpoint],
      costPerCallCents: TAVILY_PRICING_TENTHS[endpoint],
      responseTimeMs,
      success,
      resultCount,
      errorMessage,
    });
  } catch (logErr: any) {
    // §15b: the Tavily call's own outcome is not this function's to change. The credit was already
    // spent (or the attempt already failed) regardless of whether this write lands.
    console.error("[tavily-client] Failed to log Tavily API usage:", logErr?.message || logErr);
  }
}

function wrapClient(sdk: TavilySdkClient, deps: TavilyClientDeps): TavilyLoggingClient {
  const logger: TavilyUsageLogger = deps.logger ?? apiUsageService;
  const now = deps.now ?? Date.now;

  const readMeter = deps.readMonthToDateUsd ?? readCachedMonthToDateUsd.bind(null, now());
  const capUsd = deps.capUsd === undefined ? TAVILY_MONTHLY_CAP_USD : deps.capUsd;

  async function call(endpoint: TavilyEndpoint, run: () => Promise<any>): Promise<any> {
    // ── THE BREAKER, and note WHERE it sits ──────────────────────────────────
    // Before `run()`, and before the `start` clock: a refused call is not a slow call. It is also
    // deliberately OUTSIDE the try/catch below, so a refusal NEVER reaches `logTavilyCall`.
    // Logging a blocked call to `api_usage_logs` would be wrong twice over: no Tavily credit was
    // spent, so the row would be a §13 falsehood — and because the meter this guard reads IS that
    // table, every refusal would inflate the very number that caused it, ratcheting the breaker
    // shut on its own output.
    const authorization = resolveSpendAuthorization({
      provider: "tavily",
      monthToDateUsd: await readMeter(),
      capUsd,
    });
    if (!authorization.authorized) {
      console.error(
        `[tavily-client] REFUSED ${endpoint} — month-to-date $${authorization.monthToDateUsd.toFixed(3)} ` +
          `of $${authorization.capUsd.toFixed(2)} (R-T1-c). No call made, nothing charged.`,
      );
      throw new SpendCapExceededError("tavily", authorization.monthToDateUsd, authorization.capUsd);
    }
    if (authorization.basis === "meter_unavailable") {
      // Loud by design — "the meter is broken" must never read as "we are under the cap".
      console.error(
        `[tavily-client] Spend meter unreadable; allowing ${endpoint} (fail-open, see spend-guard.service.ts).`,
      );
    }

    const start = now();
    try {
      const result = await run();
      const resultCount: number | undefined = Array.isArray(result?.results)
        ? result.results.length
        : undefined;
      await logTavilyCall(logger, endpoint, true, now() - start, resultCount, undefined);
      return result;
    } catch (err: any) {
      await logTavilyCall(logger, endpoint, false, now() - start, undefined, err?.message || String(err));
      throw err;
    }
  }

  return {
    search: ((...args: Parameters<TavilySearchFn>) =>
      call("search", () => sdk.search(...args))) as TavilySearchFn,
    extract: ((...args: Parameters<TavilyExtractFn>) =>
      call("extract", () => sdk.extract(...args))) as TavilyExtractFn,
  };
}

/**
 * The env-gated client. Returns `null` when no key is configured (`deps.apiKey` or
 * `process.env.TAVILY_API_KEY`) — preserving each existing "no key ⇒ skip" call site's posture,
 * now decided in ONE place instead of four.
 */
export function getTavilyClient(deps: TavilyClientDeps = {}): TavilyLoggingClient | null {
  const apiKey = deps.apiKey ?? process.env.TAVILY_API_KEY;
  if (!apiKey) return null;
  const sdk = deps.sdk ?? createTavilySdkClient({ apiKey });
  return wrapClient(sdk, deps);
}

/**
 * ALWAYS constructs a client, even with an empty/absent key — for `DMOCrawler`, whose existing
 * behaviour is to warn-and-continue rather than skip (a bad/absent key fails at the real Tavily
 * call, unchanged by this module).
 */
export function createTavilyClient(apiKey: string, deps: TavilyClientDeps = {}): TavilyLoggingClient {
  const sdk = deps.sdk ?? createTavilySdkClient({ apiKey });
  return wrapClient(sdk, deps);
}
