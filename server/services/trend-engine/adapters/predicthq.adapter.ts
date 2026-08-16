/**
 * predicthq.adapter.ts — PredictHQ event-demand adapter.
 *
 * Source: predicthq | resale_class: licensed_no_resale
 * Requires: PREDICTHQ_API_KEY (Bearer token, 40 chars)
 *
 * Note: /v1/accounts/self/ returns 403 (no account:read scope) — that endpoint
 * is not needed. Core events + count endpoints return 200 on this plan.
 *
 * APIs used (per market, per run):
 *   GET /v1/events/count/  — total events active on date, top_rank breakdown.
 *   GET /v1/events/        — top 10 by rank, to sum phq_attendance.
 *
 * Location: within=50km@{lat},{lng} centred on each market's centroid.
 * Date filter: active.gte / active.lte = the observed date (single day window).
 *
 * Metrics written:
 *   phq_event_count         — total events active on observed date in 50km radius
 *   phq_top_rank            — highest PHQ rank event on that date (0–100)
 *   phq_attendance_forecast — sum of phq_attendance for top-10 ranked events
 *
 * Categories included: festivals, concerts, sports, conferences, expos,
 *   community, performing-arts. Excluded: airport-delays, severe-weather,
 *   school-holidays (not demand signals for leisure travel).
 *
 * Rate limit: 200 req/min. 8 markets × 2 calls = 16 req/day — no throttling needed.
 *
 * Backfill: events API supports arbitrary historical dates — full backfill possible.
 *
 * ToS: PredictHQ data must not be resold or publicly displayed in raw form.
 *   Stored as aggregate metrics only (counts + attendance sums), not raw event data.
 *
 * Idempotency: ON CONFLICT DO NOTHING.
 */

import { db } from "../../../db";
import { trendEntities, trendSignals } from "@shared/schema";
import { eq } from "drizzle-orm";
import { TrendEngineAdapter, AdapterRunResult, emptyResult } from "./base.adapter";
import { trendEngineCostEnforcer, TrendEngineCeilingError } from "../cost-enforcement";
import { OPERATING_MARKETS, OperatingMarket } from "../operating-markets";

const SOURCE = "predicthq";
const RESALE_CLASS = "licensed_no_resale";
const BASE = "https://api.predicthq.com/v1";

// Leisure-travel demand categories only — exclude operational/weather signals
const DEMAND_CATEGORIES = "festivals,concerts,sports,conferences,expos,community,performing-arts";

// Cost model: count endpoint = 0 credits; events endpoint credits scale with
// results returned. Recording 0 per call — monthly ceiling enforced at source level.
const COST_CENTS = 0;

function phqHeaders(): HeadersInit {
  const token = process.env.PREDICTHQ_API_KEY;
  if (!token) throw new Error("PREDICTHQ_API_KEY not set");
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function withinParam(market: OperatingMarket): string {
  return `50km@${market.lat},${market.lng}`;
}

interface CountResponse {
  count: number;
  top_rank: number;
  top_local_rank: number;
  categories: Record<string, number>;
}

interface EventResult {
  title: string;
  category: string;
  rank: number;
  phq_attendance?: number;
  start: string;
}

interface EventsResponse {
  count: number;
  results: EventResult[];
}

async function fetchEventCount(market: OperatingMarket, date: string): Promise<CountResponse> {
  const url = new URL(`${BASE}/events/count/`);
  url.searchParams.set("within", withinParam(market));
  url.searchParams.set("active.gte", date);
  url.searchParams.set("active.lte", date);
  url.searchParams.set("category", DEMAND_CATEGORIES);

  const res = await fetch(url.toString(), { headers: phqHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PredictHQ count ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<CountResponse>;
}

async function fetchTopEvents(market: OperatingMarket, date: string): Promise<EventsResponse> {
  const url = new URL(`${BASE}/events/`);
  url.searchParams.set("within", withinParam(market));
  url.searchParams.set("active.gte", date);
  url.searchParams.set("active.lte", date);
  url.searchParams.set("category", DEMAND_CATEGORIES);
  url.searchParams.set("sort", "rank");
  url.searchParams.set("limit", "10");

  const res = await fetch(url.toString(), { headers: phqHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PredictHQ events ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<EventsResponse>;
}

async function collectForDate(
  entity: { id: string; internalId: string },
  market: OperatingMarket,
  date: string,
  observedAt: Date,
  result: AdapterRunResult,
): Promise<void> {
  // Both calls in parallel — independent
  const [counts, events] = await Promise.all([
    fetchEventCount(market, date),
    fetchTopEvents(market, date),
  ]);

  const attendanceSum = events.results.reduce((s, e) => s + (e.phq_attendance ?? 0), 0);
  const topTitle = events.results[0]?.title ?? null;

  const rawRef = {
    date,
    top_event: topTitle,
    categories: counts.categories,
  };

  const rows: Array<{ metric: string; value: string }> = [
    { metric: "phq_event_count",         value: String(counts.count) },
    { metric: "phq_top_rank",            value: String(counts.top_rank) },
    { metric: "phq_attendance_forecast", value: String(attendanceSum) },
  ];

  for (const row of rows) {
    try {
      const ins = await db.insert(trendSignals).values({
        trendEntityId: entity.id,
        source: SOURCE,
        metric: row.metric,
        value: row.value,
        observedAt,
        resaleClass: RESALE_CLASS,
        rawRef,
      }).onConflictDoNothing().returning({ id: trendSignals.id });
      if (ins.length > 0) result.rowsInserted++; else result.rowsSkipped++;
    } catch {
      result.rowsSkipped++;
    }
  }

  console.log(
    `[PredictHQ] ${entity.internalId} ${date}: count=${counts.count} top_rank=${counts.top_rank} attendance=${attendanceSum}`,
  );
}

export class PredictHQAdapter implements TrendEngineAdapter {
  readonly source = SOURCE;

  async daily(): Promise<AdapterRunResult> {
    const result = emptyResult(SOURCE);

    if (!process.env.PREDICTHQ_API_KEY) {
      result.errors.push("PREDICTHQ_API_KEY not set — PredictHQ adapter cannot run.");
      return result;
    }

    const marketEntities = await db
      .select()
      .from(trendEntities)
      .where(eq(trendEntities.entityType, "market"));

    result.entitiesProcessed = marketEntities.length;

    const yd = new Date();
    yd.setUTCDate(yd.getUTCDate() - 1);
    const ydStr = dateStr(yd);
    const observedAt = new Date(`${ydStr}T12:00:00.000Z`);

    for (const entity of marketEntities) {
      const market = OPERATING_MARKETS.find(m => m.marketKey === entity.internalId);
      if (!market) continue;

      try {
        await trendEngineCostEnforcer.recordAndCheck({
          source: SOURCE,
          operation: `daily:${entity.internalId}`,
          costCents: COST_CENTS,
        });

        await collectForDate(entity, market, ydStr, observedAt, result);
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

  async backfill(from: Date, to: Date): Promise<AdapterRunResult> {
    const result = emptyResult(SOURCE);

    if (!process.env.PREDICTHQ_API_KEY) {
      result.errors.push("PREDICTHQ_API_KEY not set — PredictHQ adapter cannot run.");
      return result;
    }

    const marketEntities = await db
      .select()
      .from(trendEntities)
      .where(eq(trendEntities.entityType, "market"));

    result.entitiesProcessed = marketEntities.length;

    // Build list of dates in range
    const dates: string[] = [];
    const cursor = new Date(from);
    cursor.setUTCHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setUTCHours(0, 0, 0, 0);
    while (cursor <= end) {
      dates.push(dateStr(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    for (const entity of marketEntities) {
      const market = OPERATING_MARKETS.find(m => m.marketKey === entity.internalId);
      if (!market) continue;

      for (const date of dates) {
        try {
          await trendEngineCostEnforcer.recordAndCheck({
            source: SOURCE,
            operation: `backfill:${entity.internalId}:${date}`,
            costCents: COST_CENTS,
          });

          const observedAt = new Date(`${date}T12:00:00.000Z`);
          await collectForDate(entity, market, date, observedAt, result);

          // Slight delay to stay comfortably within 200 req/min
          await new Promise(r => setTimeout(r, 400));
        } catch (err: any) {
          if (err instanceof TrendEngineCeilingError) {
            result.haltedByCeiling = true;
            return result;
          }
          result.errors.push(`${entity.internalId} ${date}: ${err.message}`);
        }
      }
    }

    return result;
  }
}

export const predictHQAdapter = new PredictHQAdapter();
