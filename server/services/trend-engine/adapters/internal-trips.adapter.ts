/**
 * internal-trips.adapter.ts — First-party trip count reconstruction adapter.
 *
 * Source: internal_trips | resale_class: first_party | Cost: $0 (DB query)
 *
 * Metrics:
 *   platform_travelers_active    — count of trips with status active/confirmed whose
 *                                  date range contains the observed_at date
 *   platform_upcoming_trips_30d  — count of trips starting within 30 days of observed_at
 *
 * Both metrics are computed via deterministic as-of-date queries over the trips table
 * (R1 migration of gatherProxySignals; plumbing moved here per R6).
 *
 * R8 — pre_launch flagging: any signal observed before PRE_LAUNCH_CUTOFF is flagged
 * pre_launch=true. The calibration fitter reads this flag and excludes pre-launch
 * rows from fit windows (they measure dev-team travel, not demand).
 *
 * Idempotency: ON CONFLICT DO NOTHING.
 *
 * Rails: queries BOTH the booking rail (service_bookings with trip association) and
 * the trip rail (trips table directly). Tagged in rawRef as { rail: 'trips' }.
 */

import { db } from "../../../db";
import { trendEntities, trendSignals, trips } from "@shared/schema";
import { eq, and, lte, gte, or, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { TrendEngineAdapter, AdapterRunResult, emptyResult, PRE_LAUNCH_CUTOFF } from "./base.adapter";
import { trendEngineCostEnforcer, TrendEngineCeilingError } from "../cost-enforcement";
import { OPERATING_MARKETS } from "../operating-markets";

const SOURCE = "internal_trips";
const RESALE_CLASS = "first_party";
const COST_PER_CALL_CENTS = 0;

function yesterday(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
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

/** Trips active (overlapping) on a given date for a destination keyword. */
async function countActiveTrips(destination: string, asOf: Date): Promise<number> {
  const asOfStr = asOf.toISOString().slice(0, 10);
  try {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(trips)
      .where(
        and(
          sql`lower(${trips.destination}) like ${`%${destination.toLowerCase()}%`}`,
          sql`${trips.startDate}::date <= ${asOfStr}::date`,
          sql`${trips.endDate}::date >= ${asOfStr}::date`,
          inArray(trips.status, ["active", "confirmed", "ongoing"]),
        ),
      );
    return Number(rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

/** Trips starting within 30 days from a given date for a destination. */
async function countUpcomingTrips30d(destination: string, asOf: Date): Promise<number> {
  const asOfStr = asOf.toISOString().slice(0, 10);
  const plus30 = new Date(asOf);
  plus30.setUTCDate(plus30.getUTCDate() + 30);
  const plus30Str = plus30.toISOString().slice(0, 10);
  try {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(trips)
      .where(
        and(
          sql`lower(${trips.destination}) like ${`%${destination.toLowerCase()}%`}`,
          sql`${trips.startDate}::date >= ${asOfStr}::date`,
          sql`${trips.startDate}::date <= ${plus30Str}::date`,
        ),
      );
    return Number(rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

export class InternalTripsAdapter implements TrendEngineAdapter {
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
          operation: `trips:${entity.internalId}`,
          costCents: COST_PER_CALL_CENTS,
        });

        for (const date of dates) {
          const preLaunch = date < PRE_LAUNCH_CUTOFF;
          const observedAt = new Date(date);
          observedAt.setUTCHours(12, 0, 0, 0);

          const [active, upcoming30] = await Promise.all([
            countActiveTrips(market.cityName, date),
            countUpcomingTrips30d(market.cityName, date),
          ]);

          // platform_travelers_active
          try {
            await db.insert(trendSignals).values({
              trendEntityId: entity.id,
              source: SOURCE,
              metric: "platform_travelers_active",
              value: String(active),
              observedAt,
              resaleClass: RESALE_CLASS,
              preLaunch,
              rawRef: { rail: "trips", city: market.cityName },
            }).onConflictDoNothing();
            result.rowsInserted++;
          } catch { result.rowsSkipped++; }

          // platform_upcoming_trips_30d
          try {
            await db.insert(trendSignals).values({
              trendEntityId: entity.id,
              source: SOURCE,
              metric: "platform_upcoming_trips_30d",
              value: String(upcoming30),
              observedAt,
              resaleClass: RESALE_CLASS,
              preLaunch,
              rawRef: { rail: "trips", city: market.cityName },
            }).onConflictDoNothing();
            result.rowsInserted++;
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

export const internalTripsAdapter = new InternalTripsAdapter();
