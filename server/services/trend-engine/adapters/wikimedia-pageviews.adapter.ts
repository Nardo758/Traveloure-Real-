/**
 * wikimedia-pageviews.adapter.ts — Wikimedia Pageviews REST API adapter.
 *
 * Source: wikimedia_pageviews | resale_class: open_license | Cost: $0
 * Requires: trend_entities row with wikipedia_title set.
 * Metric: pageview_count (daily integer)
 * Backfill depth: 2015-07-01 (Wikimedia REST API floor)
 *
 * Idempotency: INSERT ON CONFLICT DO NOTHING via the unique index
 * trend_signals_idempotency_idx (entity, source, metric, observed_at).
 *
 * ToS: Wikimedia REST API is open-access, no auth required, no resale restriction.
 * User-Agent must identify the app (Wikimedia API policy).
 */

import { db } from "../../../db";
import { trendEntities, trendSignals } from "@shared/schema";
import { eq, isNotNull } from "drizzle-orm";
import { TrendEngineAdapter, AdapterRunResult, emptyResult } from "./base.adapter";
import { trendEngineCostEnforcer, TrendEngineCeilingError } from "../cost-enforcement";

const SOURCE = "wikimedia_pageviews";
const RESALE_CLASS = "open_license";
const METRIC = "pageview_count";
const COST_PER_CALL_CENTS = 0; // genuinely free
const USER_AGENT = "Traveloure-TrendEngine/2.0 (https://traveloure.com; trends@traveloure.com)";
const BASE_URL = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function yesterday(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function fetchPageviews(
  title: string,
  start: string,
  end: string,
): Promise<{ date: string; views: number }[]> {
  const encoded = encodeURIComponent(title.replace(/ /g, "_"));
  const url = `${BASE_URL}/en.wikipedia/all-access/user/${encoded}/daily/${start}/${end}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 404) return []; // page doesn't exist or no data for range
  if (!res.ok) throw new Error(`Wikimedia API ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  const data = await res.json() as any;
  return (data.items ?? []).map((item: any) => ({
    date: String(item.timestamp).slice(0, 8), // YYYYMMDD
    views: Number(item.views ?? 0),
  }));
}

async function getResolvedEntities() {
  return db
    .select()
    .from(trendEntities)
    .where(isNotNull(trendEntities.wikipediaTitle));
}

async function insertSignals(
  entityId: string,
  rows: { date: string; views: number }[],
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    // Parse YYYYMMDD into a Date
    const yr = parseInt(row.date.slice(0, 4));
    const mo = parseInt(row.date.slice(4, 6)) - 1;
    const dy = parseInt(row.date.slice(6, 8));
    const observedAt = new Date(Date.UTC(yr, mo, dy, 12, 0, 0));

    try {
      await db
        .insert(trendSignals)
        .values({
          trendEntityId: entityId,
          source: SOURCE,
          metric: METRIC,
          value: String(row.views),
          observedAt,
          resaleClass: RESALE_CLASS,
          rawRef: { wikimedia_date: row.date, views: row.views },
        })
        .onConflictDoNothing();
      inserted++;
    } catch {
      skipped++;
    }
  }
  return { inserted, skipped };
}

export class WikimediaPageviewsAdapter implements TrendEngineAdapter {
  readonly source = SOURCE;

  async daily(): Promise<AdapterRunResult> {
    const result = emptyResult(SOURCE);
    // Wikimedia pageviews data has a ~3-day publication lag (confirmed empirically:
    // D-1 and D-2 return 404; D-3 reliably returns 200). Use D-3.
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 3);
    d.setUTCHours(0, 0, 0, 0);
    return this._run(result, d, d);
  }

  async backfill(from: Date, to: Date): Promise<AdapterRunResult> {
    const result = emptyResult(SOURCE);
    result.rangeStart = from;
    result.rangeEnd = to;
    // Enforce API floor: Wikimedia pageviews data starts 2015-07-01
    const floor = new Date("2015-07-01T00:00:00Z");
    const effectiveFrom = from < floor ? floor : from;
    return this._run(result, effectiveFrom, to);
  }

  private async _run(result: AdapterRunResult, from: Date, to: Date): Promise<AdapterRunResult> {
    const entities = await getResolvedEntities();
    result.entitiesProcessed = entities.length;

    for (const entity of entities) {
      if (!entity.wikipediaTitle) continue;
      try {
        await trendEngineCostEnforcer.recordAndCheck({
          source: SOURCE,
          operation: `pageviews:${entity.internalId}`,
          costCents: COST_PER_CALL_CENTS,
        });

        const rows = await fetchPageviews(
          entity.wikipediaTitle,
          isoDate(from),
          isoDate(to),
        );
        const { inserted, skipped } = await insertSignals(entity.id, rows);
        result.rowsInserted += inserted;
        result.rowsSkipped += skipped;
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

export const wikimediaPageviewsAdapter = new WikimediaPageviewsAdapter();
