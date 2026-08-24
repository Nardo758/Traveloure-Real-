/**
 * nager-date.adapter.ts — Public holiday pressure adapter using Nager.Date.
 *
 * Source: nager_date | resale_class: open_license | Cost: $0
 * Metric: public_holiday (1 if a public holiday falls on that date, 0 otherwise)
 * Also: holiday_count (number of public holidays on that date, handles overlapping holidays)
 *
 * Deterministic — no external API state to replay; backfill can cover any date range.
 * API: https://date.nager.at/api/v3/PublicHolidays/{year}/{countryCode}
 *
 * Country codes used (per OPERATING_MARKETS):
 *   JP (Japan), IN (India), GB (United Kingdom), PT (Portugal), CO (Colombia)
 *
 * ToS: Nager.Date is MIT-licensed open source. No resale restriction.
 *
 * Idempotency: ON CONFLICT DO NOTHING.
 */

import { db } from "../../../db";
import { trendEntities, trendSignals } from "@workspace/db";
import { eq } from "drizzle-orm";
import { TrendEngineAdapter, AdapterRunResult, emptyResult } from "./base.adapter";
import { trendEngineCostEnforcer, TrendEngineCeilingError } from "../cost-enforcement";
import { OPERATING_MARKETS } from "../operating-markets";

const SOURCE = "nager_date";
const RESALE_CLASS = "open_license";
const COST_PER_CALL_CENTS = 0;
const NAGER_BASE = "https://date.nager.at/api/v3/PublicHolidays";

type HolidayMap = Map<string, number>; // YYYY-MM-DD → count

const holidayCache = new Map<string, HolidayMap>(); // `${year}-${countryCode}` → map

async function fetchHolidays(year: number, countryCode: string): Promise<HolidayMap> {
  const cacheKey = `${year}-${countryCode}`;
  if (holidayCache.has(cacheKey)) return holidayCache.get(cacheKey)!;

  const res = await fetch(`${NAGER_BASE}/${year}/${countryCode}`, {
    headers: { "User-Agent": "Traveloure-TrendEngine/2.0" },
  });
  if (res.status === 404) {
    const empty = new Map<string, number>();
    holidayCache.set(cacheKey, empty);
    return empty;
  }
  if (!res.ok) throw new Error(`Nager.Date API ${res.status}`);
  // Some countries (e.g. IN — India) are not in Nager.Date's database.
  // They return HTTP 200 with an empty body. Treat as "no holiday data".
  const text = await res.text();
  if (!text.trim()) {
    const empty = new Map<string, number>();
    holidayCache.set(cacheKey, empty);
    return empty;
  }
  const data = JSON.parse(text) as any[];
  const map = new Map<string, number>();
  for (const h of data) {
    const key: string = h.date;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  holidayCache.set(cacheKey, map);
  return map;
}

function dateRange(from: Date, to: Date): Date[] {
  const dates: Date[] = [];
  const cur = new Date(from);
  cur.setUTCHours(12, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(12, 0, 0, 0);
  while (cur <= end) {
    dates.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

function yesterday(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class NagerDateAdapter implements TrendEngineAdapter {
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
    return this._run(result, from, to);
  }

  private async _run(result: AdapterRunResult, from: Date, to: Date): Promise<AdapterRunResult> {
    const marketEntities = await db
      .select()
      .from(trendEntities)
      .where(eq(trendEntities.entityType, "market"));

    result.entitiesProcessed = marketEntities.length;
    const dates = dateRange(from, to);

    for (const entity of marketEntities) {
      const market = OPERATING_MARKETS.find(m => m.marketKey === entity.internalId);
      if (!market) continue;

      try {
        await trendEngineCostEnforcer.recordAndCheck({
          source: SOURCE,
          operation: `holidays:${entity.internalId}`,
          costCents: COST_PER_CALL_CENTS,
        });

        // Collect years needed for this range
        const yearsNeeded = Array.from(new Set(dates.map(d => d.getUTCFullYear())));
        const allHolidays = new Map<string, number>();
        for (const year of yearsNeeded) {
          const map = await fetchHolidays(year, market.countryCode);
          Array.from(map.entries()).forEach(([k, v]) => allHolidays.set(k, v));
        }

        for (const date of dates) {
          const key = isoDate(date);
          const count = allHolidays.get(key) ?? 0;
          const observedAt = new Date(date);
          observedAt.setUTCHours(12, 0, 0, 0);

          try {
            const ins = await db.insert(trendSignals).values({
              trendEntityId: entity.id,
              source: SOURCE,
              metric: "public_holiday",
              value: String(count > 0 ? 1 : 0),
              observedAt,
              resaleClass: RESALE_CLASS,
              rawRef: count > 0 ? { holiday_count: count, date: key } : null,
            }).onConflictDoNothing().returning({ id: trendSignals.id });
            if (ins.length > 0) result.rowsInserted++; else result.rowsSkipped++;
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

export const nagerDateAdapter = new NagerDateAdapter();
