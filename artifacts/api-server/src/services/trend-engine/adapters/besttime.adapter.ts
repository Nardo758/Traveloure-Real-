/**
 * besttime.adapter.ts — BestTime.app foot-traffic adapter (Forecasting + Live APIs).
 *
 * Source: besttime | resale_class: licensed_no_resale
 * Requires: BESTTIME_API_KEY (api_key_private, 36+ chars starting with pri_)
 *
 * APIs used:
 *   POST /api/v1/forecasts          — Create/update weekly forecast; returns day_raw arrays.
 *   POST /api/v1/forecasts/live     — Real-time + forecasted busyness for current hour.
 *
 * Metrics written:
 *   foot_traffic_forecast_mean  — weekly-pattern mean for yesterday's day-of-week (0–100)
 *   foot_traffic_forecast_peak  — weekly-pattern peak for yesterday's day-of-week (0–100)
 *   foot_traffic_live           — real-time busyness at run time (0–100) [daily only]
 *
 * Entity requirement: trend_entities row with entity_type='market', and
 *   besttime_venue_id set (or the adapter will resolve + store it on first run).
 *
 * Anchor venue per market: one representative high-footfall venue. Stored in
 *   trend_entities.besttime_venue_id after first successful search.
 *
 * Backfill: BestTime has no historical time-series — the weekly forecast is a
 *   rolling pattern model, not day-specific history. Backfill call returns an empty
 *   result (not an error) and explains why in the result errors list.
 *
 * ToS retention rule: BestTime forecast data must not be stored beyond 90 days.
 * No pre_launch flag (licensed_no_resale, not first_party).
 *
 * Idempotency: ON CONFLICT DO NOTHING.
 */

import { db } from "../../../db";
import { trendEntities, trendSignals } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { TrendEngineAdapter, AdapterRunResult, emptyResult } from "./base.adapter";
import { trendEngineCostEnforcer, TrendEngineCeilingError } from "../cost-enforcement";
import { OPERATING_MARKETS } from "../operating-markets";

const SOURCE = "besttime";
const RESALE_CLASS = "licensed_no_resale";
const BASE = "https://besttime.app/api/v1";

// Rough cost model: BestTime charges per "foot-traffic update" (venue search = 1 credit).
// Live calls are free against an existing venue_id. Forecast creation ≈ $0.01 per call
// at standard tier. We refresh forecasts weekly, not daily, to conserve credits.
const FORECAST_COST_CENTS = 1; // 1 cent per venue forecast creation
const LIVE_COST_CENTS = 0;     // live calls are free

/** One recognizable high-footfall landmark per market for BestTime anchor. */
const MARKET_ANCHORS: Record<string, { name: string; address: string }> = {
  kyoto:     { name: "Fushimi Inari Taisha",                               address: "Kyoto, Japan" },
  // Airports confirmed to return valid forecasts for cities BestTime covers indirectly
  goa:       { name: "Goa Airport",                                        address: "Dabolim, Goa, India" },
  mumbai:    { name: "Chhatrapati Shivaji Maharaj International Airport",  address: "Mumbai, India" },
  jaipur:    { name: "Amber Fort",                                         address: "Jaipur, India" },
  edinburgh: { name: "Edinburgh Castle",                                   address: "Edinburgh, Scotland" },
  porto:     { name: "Mercado do Bolhão",                                  address: "Porto, Portugal" },
  bogota:    { name: "Plaza de Bolivar",                                   address: "Bogota, Colombia" },
  cartagena: { name: "Plaza de los Coches",                                address: "Cartagena, Colombia" },
};

/** JS day-of-week (0=Sunday) → BestTime day index (0=Monday). */
function jsDayToBestTime(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1; // Sun=6, Mon=0, …, Sat=5
}

function yesterday(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

async function btPost(path: string, body: Record<string, string | number>): Promise<any> {
  const apiKey = process.env.BESTTIME_API_KEY;
  if (!apiKey) throw new Error("BESTTIME_API_KEY not set");

  const params = new URLSearchParams({ api_key_private: apiKey, ...Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)])) });
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`BestTime API ${res.status} at ${path}`);
  const data = await res.json() as any;
  if (data.status !== "OK") throw new Error(`BestTime error: ${JSON.stringify(data.message ?? data.status).slice(0, 200)}`);
  return data;
}

/** Create/update forecast for a venue; returns venueId + weekly day_raw arrays. */
async function createForecast(venueName: string, venueAddress: string): Promise<{
  venueId: string;
  weekRaw: number[][]; // [7 days][24 hours], indexed by BestTime day (0=Monday)
  dayMeans: number[];
  dayPeaks: number[];
}> {
  const data = await btPost("/forecasts", { venue_name: venueName, venue_address: venueAddress });
  const venueId: string = data.venue_info?.venue_id ?? "";
  const analysis = data.analysis ?? {};

  const weekRaw: number[][] = [];
  const dayMeans: number[] = [];
  const dayPeaks: number[] = [];

  for (let i = 0; i < 7; i++) {
    const day = analysis[String(i)] ?? {};
    weekRaw.push(Array.isArray(day.day_raw) ? day.day_raw : new Array(24).fill(0));
    dayMeans.push(Number(day.day_info?.day_mean ?? 0));
    dayPeaks.push(Number(day.day_info?.day_max ?? 0));
  }

  return { venueId, weekRaw, dayMeans, dayPeaks };
}

/** Get live busyness for a venue by ID. */
async function getLiveBusyness(venueId: string): Promise<{
  live: number;
  forecasted: number;
  liveAvailable: boolean;
}> {
  const data = await btPost("/forecasts/live", { venue_id: venueId });
  const a = data.analysis ?? {};
  return {
    live: Number(a.venue_live_busyness ?? 0),
    forecasted: Number(a.venue_forecasted_busyness ?? 0),
    liveAvailable: Boolean(a.venue_live_busyness_available),
  };
}

export class BestTimeAdapter implements TrendEngineAdapter {
  readonly source = SOURCE;

  async daily(): Promise<AdapterRunResult> {
    const result = emptyResult(SOURCE);

    if (!process.env.BESTTIME_API_KEY) {
      result.errors.push("BESTTIME_API_KEY not set — BestTime adapter cannot run.");
      return result;
    }

    const marketEntities = await db
      .select()
      .from(trendEntities)
      .where(eq(trendEntities.entityType, "market"));

    result.entitiesProcessed = marketEntities.length;
    const yd = yesterday();
    const ydDayBT = jsDayToBestTime(yd.getDay()); // BestTime day index for yesterday

    for (const entity of marketEntities) {
      const anchor = MARKET_ANCHORS[entity.internalId];
      if (!anchor) continue;

      try {
        // 1. Cost check + forecast (creates venue if needed, refreshes weekly pattern)
        await trendEngineCostEnforcer.recordAndCheck({
          source: SOURCE,
          operation: `forecast:${entity.internalId}`,
          costCents: FORECAST_COST_CENTS,
        });

        const { venueId, weekRaw, dayMeans, dayPeaks } = await createForecast(
          anchor.name,
          anchor.address,
        );

        // Store venue_id on entity if not already set
        if (venueId && entity.besttimeVenueId !== venueId) {
          await db
            .update(trendEntities)
            .set({ besttimeVenueId: venueId, updatedAt: new Date() })
            .where(eq(trendEntities.id, entity.id));
        }

        // 2. Forecast mean for yesterday's day-of-week
        const forecastMean = dayMeans[ydDayBT] ?? 0;
        const forecastPeak = dayPeaks[ydDayBT] ?? 0;

        try {
          const insM = await db.insert(trendSignals).values({
            trendEntityId: entity.id,
            source: SOURCE,
            metric: "foot_traffic_forecast_mean",
            value: String(forecastMean),
            observedAt: yd,
            resaleClass: RESALE_CLASS,
            rawRef: { venue_id: venueId, day_bt: ydDayBT, pattern: "weekly" },
          }).onConflictDoNothing().returning({ id: trendSignals.id });
          if (insM.length > 0) result.rowsInserted++; else result.rowsSkipped++;
        } catch { result.rowsSkipped++; }

        try {
          const insP = await db.insert(trendSignals).values({
            trendEntityId: entity.id,
            source: SOURCE,
            metric: "foot_traffic_forecast_peak",
            value: String(forecastPeak),
            observedAt: yd,
            resaleClass: RESALE_CLASS,
            rawRef: { venue_id: venueId, day_bt: ydDayBT, pattern: "weekly" },
          }).onConflictDoNothing().returning({ id: trendSignals.id });
          if (insP.length > 0) result.rowsInserted++; else result.rowsSkipped++;
        } catch { result.rowsSkipped++; }

        // 3. Live busyness (free call)
        if (venueId) {
          await trendEngineCostEnforcer.recordAndCheck({
            source: SOURCE,
            operation: `live:${entity.internalId}`,
            costCents: LIVE_COST_CENTS,
          });

          const { live, forecasted, liveAvailable } = await getLiveBusyness(venueId);
          const now = new Date();
          now.setUTCMinutes(0, 0, 0); // round to hour

          try {
            const insL = await db.insert(trendSignals).values({
              trendEntityId: entity.id,
              source: SOURCE,
              metric: "foot_traffic_live",
              value: String(liveAvailable ? live : forecasted),
              observedAt: now,
              resaleClass: RESALE_CLASS,
              rawRef: { venue_id: venueId, live_available: liveAvailable, raw_live: live, raw_forecast: forecasted },
            }).onConflictDoNothing().returning({ id: trendSignals.id });
            if (insL.length > 0) result.rowsInserted++; else result.rowsSkipped++;
          } catch { result.rowsSkipped++; }
        }

        console.log(`[BestTime] ${entity.internalId}: mean=${forecastMean} peak=${forecastPeak} live=${venueId ? "ok" : "no-venue-id"}`);
      } catch (err: any) {
        if (err instanceof TrendEngineCeilingError) {
          result.haltedByCeiling = true;
          break;
        }
        result.errors.push(`${entity.internalId}: ${err.message}`);
      }
    }

    return result;
  }

  async backfill(_from: Date, _to: Date): Promise<AdapterRunResult> {
    // BestTime provides a weekly *pattern* model, not a historical time-series.
    // There is no day-specific historical data to backfill — each forecast call
    // returns the same rolling weekly pattern regardless of the date requested.
    const result = emptyResult(SOURCE);
    result.errors.push(
      "BestTime backfill not supported: the API provides a rolling weekly pattern model, " +
      "not historical day-specific data. Use daily() going forward.",
    );
    return result;
  }
}

export const bestTimeAdapter = new BestTimeAdapter();
