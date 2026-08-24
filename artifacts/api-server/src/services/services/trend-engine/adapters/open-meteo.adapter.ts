/**
 * open-meteo.adapter.ts — Weather anomaly adapter using Open-Meteo.
 *
 * Source: open_meteo | resale_class: open_license | Cost: $0 (free tier: 10k/day)
 * Metric: temperature_celsius (daily mean), precipitation_mm (daily total)
 *         weather_anomaly is STUBBED per L3 — scorer ignores it in v1.
 *         Raw values stored now so calibration has them when L3 is activated.
 *
 * Uses Open-Meteo historical archive for backfill, forecast API for daily.
 * Market centroid lat/lng from OPERATING_MARKETS config.
 *
 * ToS: Open-Meteo is CC-BY 4.0 for non-commercial use, free for commercial under
 * their commercial license. Marked open_license per Phase 1 seed; commercial
 * license to be confirmed before Phase 4 activation. No resale restriction.
 *
 * Idempotency: ON CONFLICT DO NOTHING.
 */

import { db } from "../../../db";
import { trendEntities, trendSignals } from "@workspace/db";
import { eq } from "drizzle-orm";
import { TrendEngineAdapter, AdapterRunResult, emptyResult } from "./base.adapter";
import { trendEngineCostEnforcer, TrendEngineCeilingError } from "../cost-enforcement";
import { OPERATING_MARKETS } from "../operating-markets";

const SOURCE = "open_meteo";
const RESALE_CLASS = "open_license";
const COST_PER_CALL_CENTS = 0;
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function yesterday(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

interface WeatherDay {
  date: string; // YYYY-MM-DD
  tempC: number;
  precipMm: number;
}

async function fetchWeather(
  lat: number,
  lng: number,
  from: Date,
  to: Date,
): Promise<WeatherDay[]> {
  const startDate = isoDate(from);
  const endDate = isoDate(to);
  const now = new Date();
  const isHistorical = to < now;

  const base = isHistorical ? ARCHIVE_URL : FORECAST_URL;
  const url =
    `${base}?latitude=${lat}&longitude=${lng}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&daily=temperature_2m_mean,precipitation_sum` +
    `&timezone=UTC`;

  const res = await fetch(url, { headers: { "User-Agent": "Traveloure-TrendEngine/2.0" } });
  if (!res.ok) throw new Error(`Open-Meteo API ${res.status}`);
  const data = await res.json() as any;

  const dates: string[] = data.daily?.time ?? [];
  const temps: number[] = data.daily?.temperature_2m_mean ?? [];
  const precips: number[] = data.daily?.precipitation_sum ?? [];

  return dates.map((date, i) => ({
    date,
    tempC: temps[i] ?? 0,
    precipMm: precips[i] ?? 0,
  }));
}

export class OpenMeteoAdapter implements TrendEngineAdapter {
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

    for (const entity of marketEntities) {
      const market = OPERATING_MARKETS.find(m => m.marketKey === entity.internalId);
      if (!market) continue;

      try {
        await trendEngineCostEnforcer.recordAndCheck({
          source: SOURCE,
          operation: `weather:${entity.internalId}`,
          costCents: COST_PER_CALL_CENTS,
        });

        const days = await fetchWeather(market.lat, market.lng, from, to);

        for (const day of days) {
          const observedAt = new Date(`${day.date}T12:00:00Z`);

          // temperature_celsius
          try {
            const ins1 = await db.insert(trendSignals).values({
              trendEntityId: entity.id,
              source: SOURCE,
              metric: "temperature_celsius",
              value: String(Math.round(day.tempC * 10) / 10),
              observedAt,
              resaleClass: RESALE_CLASS,
              rawRef: { date: day.date, temp_c: day.tempC, precip_mm: day.precipMm },
            }).onConflictDoNothing().returning({ id: trendSignals.id });
            if (ins1.length > 0) result.rowsInserted++; else result.rowsSkipped++;
          } catch { result.rowsSkipped++; }

          // precipitation_mm
          try {
            const ins2 = await db.insert(trendSignals).values({
              trendEntityId: entity.id,
              source: SOURCE,
              metric: "precipitation_mm",
              value: String(Math.round(day.precipMm * 10) / 10),
              observedAt,
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

export const openMeteoAdapter = new OpenMeteoAdapter();
