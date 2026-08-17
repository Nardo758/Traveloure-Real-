/**
 * gdelt.adapter.ts — GDELT 2.0 Doc API adapter.
 *
 * Source: gdelt | resale_class: open_license | Cost: $0
 * Metrics: mention_count (daily integer), article_count (daily integer)
 * Backfill depth: 2015-01-01 (GDELT v2 launch)
 *
 * Uses GDELT Doc API (free, no auth): queries by city name + date range,
 * counts articles mentioning the city per day.
 * Entity requirement: trend_entity row exists (market-level; no Wikipedia title needed).
 *
 * Idempotency: ON CONFLICT DO NOTHING via trend_signals_idempotency_idx.
 *
 * ToS: GDELT data is Creative Commons CC0 — fully open, no resale restriction.
 */

import { db } from "../../../db";
import { trendEntities, trendSignals } from "@shared/schema";
import { eq } from "drizzle-orm";
import { TrendEngineAdapter, AdapterRunResult, emptyResult } from "./base.adapter";
import { trendEngineCostEnforcer, TrendEngineCeilingError } from "../cost-enforcement";
import { OPERATING_MARKETS } from "../operating-markets";

const SOURCE = "gdelt";
const RESALE_CLASS = "open_license";
const COST_PER_CALL_CENTS = 0;

// GDELT Doc API v2 — query endpoint
const GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc";

function gdeltDateStr(d: Date): string {
  // GDELT expects YYYYMMDDHHMMSS
  const yr = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dy = String(d.getUTCDate()).padStart(2, "0");
  return `${yr}${mo}${dy}000000`;
}

function dayMidnight(d: Date): Date {
  const c = new Date(d);
  c.setUTCHours(0, 0, 0, 0);
  return c;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

function yesterday(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

interface GdeltDayCount {
  date: Date;
  articleCount: number;
  mentionCount: number;
}

async function fetchGdeltCounts(
  cityName: string,
  from: Date,
  to: Date,
): Promise<GdeltDayCount[]> {
  // GDELT Doc API: mode=TimelineVol returns a timeline of volume by day
  const startStr = gdeltDateStr(from);
  const endStr = gdeltDateStr(addDays(to, 1));
  const query = `"${cityName}" sourcelang:english`;
  const url =
    `${GDELT_DOC_API}?query=${encodeURIComponent(query)}` +
    `&mode=timelinevol&format=json&startdatetime=${startStr}&enddatetime=${endStr}&smoothing=0`;

  // Exponential backoff on 429 (rate-limited): 1 s → 2 s → 4 s → 8 s, then give up.
  let res: Response | null = null;
  for (let attempt = 0; attempt <= 3; attempt++) {
    res = await fetch(url, { headers: { "User-Agent": "Traveloure-TrendEngine/2.0" } });
    if (res.status !== 429) break;
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  if (!res || !res.ok) {
    throw new Error(`GDELT API ${res?.status ?? "unknown"}`);
  }

  const text = await res.text();
  if (!text.trim()) return []; // empty response = no data for range

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return []; // GDELT sometimes returns non-JSON for empty ranges
  }

  const timeline: any[] = data.timeline?.[0]?.data ?? [];
  return timeline.map((point: any) => {
    // GDELT returns dates as "YYYYMMDDTHHMMSSZ"
    const dateStr = String(point.date ?? "");
    const yr = parseInt(dateStr.slice(0, 4));
    const mo = parseInt(dateStr.slice(4, 6)) - 1;
    const dy = parseInt(dateStr.slice(6, 8));
    return {
      date: new Date(Date.UTC(yr, mo, dy, 12, 0, 0)),
      articleCount: Math.round(Number(point.value ?? 0)),
      mentionCount: Math.round(Number(point.value ?? 0)), // GDELT vol ~ mentions
    };
  });
}

export class GdeltAdapter implements TrendEngineAdapter {
  readonly source = SOURCE;

  async daily(): Promise<AdapterRunResult> {
    const result = emptyResult(SOURCE);
    const d = yesterday();
    return this._run(result, d, d);
  }

  async backfill(from: Date, to: Date): Promise<AdapterRunResult> {
    const result = emptyResult(SOURCE);
    result.rangeStart = from;
    result.rangeEnd = to;
    const floor = new Date("2015-01-01T00:00:00Z");
    const effectiveFrom = from < floor ? floor : from;
    return this._run(result, effectiveFrom, to);
  }

  private async _run(result: AdapterRunResult, from: Date, to: Date): Promise<AdapterRunResult> {
    // Only market-level entities for GDELT (city name search)
    const marketEntities = await db
      .select()
      .from(trendEntities)
      .where(eq(trendEntities.entityType, "market"));

    result.entitiesProcessed = marketEntities.length;

    for (const entity of marketEntities) {
      const market = OPERATING_MARKETS.find(m => m.marketKey === entity.internalId);
      if (!market) continue;

      try {
        await trendEngineCostEnforcer.recordAndCheck({
          source: SOURCE,
          operation: `gdelt:${entity.internalId}`,
          costCents: COST_PER_CALL_CENTS,
        });

        // Backfill pacing: 800 ms between per-city requests so GDELT never 429s
        // during a full-depth historical pull. Daily mode skips delay (single pass).
        if (result.rangeStart) {
          await new Promise(r => setTimeout(r, 800));
        }
        const counts = await fetchGdeltCounts(market.cityName, from, to);

        for (const c of counts) {
          // article_count
          try {
            const ins1 = await db.insert(trendSignals).values({
              trendEntityId: entity.id,
              source: SOURCE,
              metric: "article_count",
              value: String(c.articleCount),
              observedAt: c.date,
              resaleClass: RESALE_CLASS,
              rawRef: { gdelt_date: c.date.toISOString().slice(0, 10) },
            }).onConflictDoNothing().returning({ id: trendSignals.id });
            if (ins1.length > 0) result.rowsInserted++; else result.rowsSkipped++;
          } catch { result.rowsSkipped++; }

          // mention_count (same value at GDELT vol granularity)
          try {
            const ins2 = await db.insert(trendSignals).values({
              trendEntityId: entity.id,
              source: SOURCE,
              metric: "mention_count",
              value: String(c.mentionCount),
              observedAt: c.date,
              resaleClass: RESALE_CLASS,
            }).onConflictDoNothing().returning({ id: trendSignals.id });
            if (ins2.length > 0) result.rowsInserted++; else result.rowsSkipped++;
          } catch { result.rowsSkipped++; }
        }
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
}

export const gdeltAdapter = new GdeltAdapter();
