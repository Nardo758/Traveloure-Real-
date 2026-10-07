/**
 * `legs-dayof-recheck` — the DAY-OF leg re-check (step 9b, D6 — ledger
 * `2026-10-07-step9b-optimizer-and-rechecks`; surface spec R-aw "once on each trip day for the Trip Card").
 *
 * Registered HOURLY (`JOB_CADENCE` + the cron script's hourly `BUCKET_ROUTES`). Each tick picks the plans
 * whose LOCAL time is in the 06:00 hour on one of their trip days — the plan's own `trips.timezone`,
 * else its launch market's zone (`MARKET_TIMEZONES`, the same map LD 30 derives the column from); a plan
 * with neither is skipped, never read in UTC (§13). For each it re-checks THAT DAY's legs through the ONE
 * `recheckPlanLegs` (the T-3 job's own pass). Idempotent per plan-day: a leg is claimed against that
 * day's local midnight, so a second tick in the same hour, or a second instance, asks nothing, and the
 * finding's dedupe key carries the day. Never throws for one plan; only a failed candidate scan is an
 * `error`, which never stamps a success heartbeat.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { isUsableTimeZone, zonedWallClockToInstant } from "@shared/plan-timing";
import { MARKET_TIMEZONES } from "../services/trend-engine/operating-markets";
import { recheckPlanLegs, type LegRecheckResult } from "../services/routing/leg-recheck.service";

/** D6: the local hour the day-of re-check runs in. */
export const LEGS_DAYOF_RECHECK_LOCAL_HOUR = 6;

export interface LegsDayofCandidate {
  id: string;
  userId: string;
  destination: string | null;
  marketSlug: string | null;
  timezone: string | null;
  startDate: string;
  endDate: string;
}

export interface LegsDayofResult {
  considered: number;
  rechecked: number;
  legsChecked: number;
  legsChanged: number;
  legsNotified: number;
  failed: number;
  error?: string;
}

export interface LegsDayofDeps {
  candidates: (now: Date) => Promise<LegsDayofCandidate[]>;
  recheck: typeof recheckPlanLegs;
}

/** The plan's zone: its own column, else its launch market's — never UTC by default (§13). */
export function dayofZone(c: Pick<LegsDayofCandidate, "timezone" | "marketSlug">): string | null {
  if (c.timezone && isUsableTimeZone(c.timezone)) return c.timezone;
  const m = c.marketSlug ? MARKET_TIMEZONES[c.marketSlug.toLowerCase()] : undefined;
  return m ?? null;
}

/** Pure. The local calendar date and hour of `now` in `zone`. */
export function localDateHour(now: Date, zone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/** Pure. Is this plan due now — 06:00 local on a trip day? Returns the day's number and date, or null. */
export function dayofDue(c: LegsDayofCandidate, now: Date): { zone: string; date: string; dayNumber: number } | null {
  const zone = dayofZone(c);
  if (!zone) return null;
  const { date, hour } = localDateHour(now, zone);
  if (hour !== LEGS_DAYOF_RECHECK_LOCAL_HOUR) return null;
  const start = c.startDate.slice(0, 10);
  const end = c.endDate.slice(0, 10);
  if (date < start || date > end) return null;
  const dayNumber = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
  return { zone, date, dayNumber };
}

export const defaultLegsDayofDeps: LegsDayofDeps = {
  async candidates(now) {
    // A wide UTC window (a trip day anywhere on earth is within a day of the UTC date); the exact local
    // test is `dayofDue`. Dates must have been CHOSEN (D9).
    const r = await db.execute(sql`
      SELECT t.id, t.user_id, t.destination, t.market_slug, t.timezone, t.start_date::text AS start_date, t.end_date::text AS end_date
      FROM trips t
      WHERE t.user_id IS NOT NULL
        AND t.dates_confirmed_at IS NOT NULL
        AND t.start_date IS NOT NULL AND t.end_date IS NOT NULL
        AND t.start_date::date <= ((${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')::date + 1)
        AND t.end_date::date >= ((${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')::date - 1)
    `);
    return ((r as any).rows ?? []).map((x: any) => ({
      id: x.id,
      userId: x.user_id,
      destination: x.destination ?? null,
      marketSlug: x.market_slug ?? null,
      timezone: x.timezone ?? null,
      startDate: String(x.start_date),
      endDate: String(x.end_date),
    }));
  },
  recheck: recheckPlanLegs,
};

export async function runLegsDayofRecheck(now: Date = new Date(), deps: LegsDayofDeps = defaultLegsDayofDeps): Promise<LegsDayofResult> {
  const result: LegsDayofResult = { considered: 0, rechecked: 0, legsChecked: 0, legsChanged: 0, legsNotified: 0, failed: 0 };
  let plans: LegsDayofCandidate[];
  try {
    plans = await deps.candidates(now);
  } catch (err: any) {
    return { ...result, error: err?.message ?? String(err) };
  }
  for (const c of plans) {
    result.considered += 1;
    const due = dayofDue(c, now);
    if (!due) continue;
    const since = zonedWallClockToInstant(due.date, "00:00", due.zone);
    if (!since) continue;
    try {
      const r: LegRecheckResult = await deps.recheck({
        tripId: c.id,
        userId: c.userId,
        destination: c.destination,
        startDate: c.startDate,
        timezone: due.zone,
        datesConfirmed: true,
        dayNumber: due.dayNumber,
        since,
        checkDate: due.date,
        now,
      });
      result.rechecked += 1;
      result.legsChecked += r.checked;
      result.legsChanged += r.changed + r.broken;
      result.legsNotified += r.notified;
    } catch (err) {
      result.failed += 1;
      console.error(`[legs-dayof-recheck] plan ${c.id} failed:`, (err as Error)?.message ?? err);
    }
  }
  return result;
}
