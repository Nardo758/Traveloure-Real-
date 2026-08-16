/**
 * x-api.adapter.ts — X (Twitter) mention-volume adapter via X API v2.
 *
 * Source: x_api | resale_class: licensed_no_resale
 * Requires: X_BEARER_TOKEN (App-Only Bearer Token, Basic plan or higher)
 *
 * API used:
 *   GET /2/tweets/counts/recent — hourly tweet counts for a search query,
 *   up to 7 days back.
 *
 * Strategy: one hourly-granularity call per market. Aggregate hourly buckets
 * into a daily total AND find the peak hourly value — two metrics, one request.
 *
 * Metrics written:
 *   x_mention_count    — total tweet mentions on observed_at date (integer count)
 *   x_post_velocity    — peak single-hour count on observed_at date (integer count)
 *
 * Rules:
 *   R2: NO LLM summarization or sentiment scoring of X content — counts only.
 *   R9: X Content (post text, IDs, user objects, media) is NEVER stored.
 *       Only our own derived, non-reconstructable aggregates persist indefinitely
 *       (count + peak velocity per entity per day). This is the standard
 *       social-listening architecture (Brandwatch/Sprinklr class).
 *       raw_ref MUST be null on every x_api row — enforced here AND by DB CHECK
 *       constraint chk_x_api_raw_ref_null. Counsel verification pending (R9).
 *   x_handle_or_query on trend_entities is our query configuration, NOT X Content
 *       — it is not subject to the X developer agreement retention limits.
 *
 * In-flight guarantee: API responses are processed in memory within the run.
 *   No post text, tweet IDs, user handles, or response payloads are written to
 *   any table, log file, or cache. Only integer counts reach the DB.
 *
 * Backfill: counts/recent supports up to 7 days via start_time/end_time.
 *   counts/all (full archive) requires Academic Research access — not used.
 *   Backfill outside the 7-day window returns an error and no rows.
 *
 * Rate limit: 300 req/15 min (app-level) on Basic plan. 8 markets = 8 requests
 *   per daily run — well within limits.
 *
 * Idempotency: ON CONFLICT DO NOTHING.
 */

import { db } from "../../../db";
import { trendEntities, trendSignals } from "@shared/schema";
import { eq } from "drizzle-orm";
import { TrendEngineAdapter, AdapterRunResult, emptyResult } from "./base.adapter";
import { trendEngineCostEnforcer, TrendEngineCeilingError } from "../cost-enforcement";
import { OPERATING_MARKETS } from "../operating-markets";

const SOURCE = "x_api";
const RESALE_CLASS = "licensed_no_resale";
const COUNTS_BASE = "https://api.twitter.com/2/tweets/counts/recent";

// X API counts/recent is free-to-call on Basic plan (no per-call cost).
// Cost is the plan subscription, not per-request. Record as $0 per call.
const COST_CENTS = 0;

/**
 * Per-market search query. Disambiguates short or common city names.
 * Keep queries narrow enough to filter bots and broad enough to capture genuine buzz.
 * Rule R2: queries must not feed an LLM — counts only.
 */
const MARKET_QUERIES: Record<string, string> = {
  kyoto:     'Kyoto lang:en -is:retweet',
  goa:       '(Goa India OR "Goa beach" OR "visit Goa") lang:en -is:retweet',
  mumbai:    'Mumbai lang:en -is:retweet',
  jaipur:    'Jaipur lang:en -is:retweet',
  edinburgh: 'Edinburgh lang:en -is:retweet',
  porto:     '(Porto Portugal OR "visit Porto" OR "Porto travel") lang:en -is:retweet',
  bogota:    '(Bogota Colombia OR Bogotá travel) lang:en -is:retweet',
  cartagena: '(Cartagena Colombia OR "Cartagena travel") lang:en -is:retweet',
};

function xHeaders(): HeadersInit {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) throw new Error("X_BEARER_TOKEN not set");
  return { Authorization: `Bearer ${token}` };
}

interface HourBucket { start: string; end: string; tweet_count: number }

/**
 * Fetch hourly tweet counts for a query over [startTime, now].
 * Returns raw hourly buckets.
 */
async function fetchHourlyCounts(query: string, startTime: Date, endTime?: Date): Promise<HourBucket[]> {
  const url = new URL(COUNTS_BASE);
  url.searchParams.set("query", query);
  url.searchParams.set("granularity", "hour");
  url.searchParams.set("start_time", startTime.toISOString());
  if (endTime) url.searchParams.set("end_time", endTime.toISOString());

  const res = await fetch(url.toString(), { headers: xHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`X API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { data?: HourBucket[]; meta?: { total_tweet_count: number }; errors?: any[] };
  if (!data.data) throw new Error(`X API returned no data: ${JSON.stringify(data).slice(0, 200)}`);
  return data.data;
}

/**
 * Aggregate hourly buckets into daily totals + peak hourly values.
 * Returns a map of YYYY-MM-DD → { total, peakHour }.
 */
function aggregateByDay(buckets: HourBucket[]): Record<string, { total: number; peak: number }> {
  const days: Record<string, { total: number; peak: number }> = {};
  for (const b of buckets) {
    const day = b.start.slice(0, 10);
    if (!days[day]) days[day] = { total: 0, peak: 0 };
    days[day].total += b.tweet_count;
    if (b.tweet_count > days[day].peak) days[day].peak = b.tweet_count;
  }
  return days;
}

function yesterdayDateString(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function startOfDayUTC(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function endOfDayUTC(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999Z`);
}

export class XApiAdapter implements TrendEngineAdapter {
  readonly source = SOURCE;

  async daily(): Promise<AdapterRunResult> {
    const result = emptyResult(SOURCE);

    if (!process.env.X_BEARER_TOKEN) {
      result.errors.push("X_BEARER_TOKEN not set — X API adapter cannot run.");
      return result;
    }

    const marketEntities = await db
      .select()
      .from(trendEntities)
      .where(eq(trendEntities.entityType, "market"));

    result.entitiesProcessed = marketEntities.length;
    const ydStr = yesterdayDateString();
    const ydDate = new Date(`${ydStr}T12:00:00.000Z`); // canonical observed_at

    for (const entity of marketEntities) {
      const query = MARKET_QUERIES[entity.internalId];
      if (!query) continue;

      try {
        await trendEngineCostEnforcer.recordAndCheck({
          source: SOURCE,
          operation: `counts:${entity.internalId}`,
          costCents: COST_CENTS,
        });

        // Fetch last 48h to ensure yesterday is fully covered
        const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
        const buckets = await fetchHourlyCounts(query, since);
        const days = aggregateByDay(buckets);

        const yd = days[ydStr];
        if (!yd) {
          result.errors.push(`${entity.internalId}: no data for ${ydStr}`);
          continue;
        }

        // x_mention_count — daily total
        try {
          await db.insert(trendSignals).values({
            trendEntityId: entity.id,
            source: SOURCE,
            metric: "x_mention_count",
            value: String(yd.total),
            observedAt: ydDate,
            resaleClass: RESALE_CLASS,
            rawRef: null, // R9: X Content never stored — derived aggregates only
          }).onConflictDoNothing();
          result.rowsInserted++;
        } catch { result.rowsSkipped++; }

        // x_post_velocity — peak single-hour count
        try {
          await db.insert(trendSignals).values({
            trendEntityId: entity.id,
            source: SOURCE,
            metric: "x_post_velocity",
            value: String(yd.peak),
            observedAt: ydDate,
            resaleClass: RESALE_CLASS,
            rawRef: null, // R9: X Content never stored — derived aggregates only
          }).onConflictDoNothing();
          result.rowsInserted++;
        } catch { result.rowsSkipped++; }

        console.log(`[X API] ${entity.internalId}: ${ydStr} total=${yd.total} peak_hour=${yd.peak}`);
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

    if (!process.env.X_BEARER_TOKEN) {
      result.errors.push("X_BEARER_TOKEN not set — X API adapter cannot run.");
      return result;
    }

    // counts/recent only covers 7 days back
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (from < sevenDaysAgo) {
      result.errors.push(
        `X API backfill limited to 7 days (counts/recent). ` +
        `Requested from=${from.toISOString()} is out of range. ` +
        `Full archive requires Academic Research access (not available on Basic plan).`,
      );
      // Clamp to available window rather than failing entirely
      from = sevenDaysAgo;
    }

    const marketEntities = await db
      .select()
      .from(trendEntities)
      .where(eq(trendEntities.entityType, "market"));

    result.entitiesProcessed = marketEntities.length;

    for (const entity of marketEntities) {
      const query = MARKET_QUERIES[entity.internalId];
      if (!query) continue;

      try {
        await trendEngineCostEnforcer.recordAndCheck({
          source: SOURCE,
          operation: `backfill:${entity.internalId}`,
          costCents: COST_CENTS,
        });

        const buckets = await fetchHourlyCounts(query, from, to);
        const days = aggregateByDay(buckets);

        for (const [dateStr, counts] of Object.entries(days)) {
          const observedAt = new Date(`${dateStr}T12:00:00.000Z`);

          try {
            await db.insert(trendSignals).values({
              trendEntityId: entity.id,
              source: SOURCE,
              metric: "x_mention_count",
              value: String(counts.total),
              observedAt,
              resaleClass: RESALE_CLASS,
              rawRef: null, // R9: X Content never stored — derived aggregates only
            }).onConflictDoNothing();
            result.rowsInserted++;
          } catch { result.rowsSkipped++; }

          try {
            await db.insert(trendSignals).values({
              trendEntityId: entity.id,
              source: SOURCE,
              metric: "x_post_velocity",
              value: String(counts.peak),
              observedAt,
              resaleClass: RESALE_CLASS,
              rawRef: null, // R9: X Content never stored — derived aggregates only
            }).onConflictDoNothing();
            result.rowsInserted++;
          } catch { result.rowsSkipped++; }
        }

        console.log(`[X API backfill] ${entity.internalId}: ${Object.keys(days).length} days`);
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

export const xApiAdapter = new XApiAdapter();
