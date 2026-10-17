/**
 * `routing-recheck` — the TRIP-DAY leg re-check (9b spec v1.0, §6 9b-d; 9b-0 ruling 4, which retires
 * `legs-dayof-recheck`; surface spec R-aw "once on each trip day for the Trip Card").
 *
 * ONE service, TWO triggers, ONE guard:
 *   · SCHEDULED — registered HOURLY (`JOB_CADENCE` + the cron script's hourly `BUCKET_ROUTES`). Each tick
 *     picks the plans whose LOCAL time is in the 06:00 hour on one of their trip days.
 *   · FIRST OPEN — the Trip Card's re-check read (`GET /api/trips/:tripId/recheck`) asks the same pass for
 *     THAT plan when it is a trip day at or after 06:00 local, so a missed tick is covered by the first
 *     person who opens the card. Before 06:00 it does nothing: the scheduled run is still to come.
 *   · THE GUARD — `routing_recheck_max_per_plan_day` (config, default 1). The day is split into that many
 *     windows from local midnight, and each leg is CLAIMED against the current window's start (§15), so
 *     whichever trigger comes first does the work and the other asks nothing — a second tick, a second
 *     instance or a hundred card opens make no further routing call that window.
 *
 * The plan's zone is its own `trips.timezone`, else its launch market's (`MARKET_TIMEZONES`, the map LD 30
 * derives the column from); a plan with neither is skipped, never read in UTC (§13). Dates must have been
 * CHOSEN (D9). The pass itself is the ONE `recheckPlanLegs` (the T-3 job's own); it never writes a leg,
 * and a failed or `paused` call puts the claim back and leaves the leg's last status as it was (its label
 * is kept). Never throws for one plan; only a failed candidate scan is an `error`, which never stamps a
 * success heartbeat.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { isUsableTimeZone, zonedWallClockToInstant } from "@shared/plan-timing";
import { MARKET_TIMEZONES } from "../services/trend-engine/operating-markets";
import { recheckPlanLegs, type LegRecheckResult } from "../services/routing/leg-recheck.service";
import { routingRecheckMaxPerPlanDay } from "../config/routing-recheck.config";

/** The local hour the scheduled trigger runs in, and the earliest hour the first-open trigger may. */
export const ROUTING_RECHECK_LOCAL_HOUR = 6;

export type RoutingRecheckTrigger = "scheduled" | "first_open";

export interface RoutingRecheckCandidate {
  id: string;
  userId: string;
  destination: string | null;
  marketSlug: string | null;
  timezone: string | null;
  startDate: string;
  endDate: string;
}

export interface RoutingRecheckResult {
  considered: number;
  rechecked: number;
  legsChecked: number;
  legsChanged: number;
  legsNotified: number;
  /** P0 ruling 6: desired pairs that show no leg (counted, never written). Present only when > 0. */
  legsMissing?: number;
  failed: number;
  error?: string;
}

export interface RoutingRecheckDeps {
  candidates: (now: Date) => Promise<RoutingRecheckCandidate[]>;
  /** One plan by id, on the same terms as `candidates` (owned, dates chosen), or null. */
  candidate: (tripId: string) => Promise<RoutingRecheckCandidate | null>;
  recheck: typeof recheckPlanLegs;
  maxPerPlanDay: () => number;
}

/** The plan's zone: its own column, else its launch market's — never UTC by default (§13). */
export function routingRecheckZone(c: Pick<RoutingRecheckCandidate, "timezone" | "marketSlug">): string | null {
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

/**
 * Pure. Is this plan due now for `trigger`? Scheduled: the 06:00 local hour on a trip day. First open:
 * any hour from 06:00 local on a trip day. Returns the day's zone, date and number, or null.
 */
export function routingRecheckDue(
  c: RoutingRecheckCandidate,
  now: Date,
  trigger: RoutingRecheckTrigger = "scheduled",
): { zone: string; date: string; dayNumber: number } | null {
  const zone = routingRecheckZone(c);
  if (!zone) return null;
  const { date, hour } = localDateHour(now, zone);
  if (trigger === "scheduled" ? hour !== ROUTING_RECHECK_LOCAL_HOUR : hour < ROUTING_RECHECK_LOCAL_HOUR) return null;
  const start = c.startDate.slice(0, 10);
  const end = c.endDate.slice(0, 10);
  if (date < start || date > end) return null;
  const dayNumber = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
  return { zone, date, dayNumber };
}

/**
 * Pure. THE GUARD: the start of the current re-check window. The local day (from `dayStart`, local
 * midnight) is split into `maxPerDay` equal windows; a leg checked at or after the returned instant is not
 * asked again. `maxPerDay` below 1 is read as 1 — the guard never opens more than the config says.
 */
export function routingRecheckSince(dayStart: Date, now: Date, maxPerDay: number): Date {
  const n = Number.isInteger(maxPerDay) && maxPerDay > 0 ? maxPerDay : 1;
  if (n === 1) return dayStart;
  const slot = 86_400_000 / n;
  const elapsed = Math.max(0, now.getTime() - dayStart.getTime());
  return new Date(dayStart.getTime() + Math.min(n - 1, Math.floor(elapsed / slot)) * slot);
}

const CANDIDATE_COLUMNS = sql`t.id, t.user_id, t.destination, t.market_slug, t.timezone, t.start_date::text AS start_date, t.end_date::text AS end_date`;

function toCandidate(x: any): RoutingRecheckCandidate {
  return {
    id: x.id,
    userId: x.user_id,
    destination: x.destination ?? null,
    marketSlug: x.market_slug ?? null,
    timezone: x.timezone ?? null,
    startDate: String(x.start_date),
    endDate: String(x.end_date),
  };
}

export const defaultRoutingRecheckDeps: RoutingRecheckDeps = {
  async candidates(now) {
    // A wide UTC window (a trip day anywhere on earth is within a day of the UTC date); the exact local
    // test is `routingRecheckDue`. Dates must have been CHOSEN (D9).
    const r = await db.execute(sql`
      SELECT ${CANDIDATE_COLUMNS}
      FROM trips t
      WHERE t.user_id IS NOT NULL
        AND t.dates_confirmed_at IS NOT NULL
        AND t.start_date IS NOT NULL AND t.end_date IS NOT NULL
        AND t.start_date::date <= ((${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')::date + 1)
        AND t.end_date::date >= ((${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')::date - 1)
    `);
    return ((r as any).rows ?? []).map(toCandidate);
  },
  async candidate(tripId) {
    const r = await db.execute(sql`
      SELECT ${CANDIDATE_COLUMNS}
      FROM trips t
      WHERE t.id = ${tripId}
        AND t.user_id IS NOT NULL
        AND t.dates_confirmed_at IS NOT NULL
        AND t.start_date IS NOT NULL AND t.end_date IS NOT NULL
      LIMIT 1
    `);
    const row = ((r as any).rows ?? [])[0];
    return row ? toCandidate(row) : null;
  },
  recheck: recheckPlanLegs,
  maxPerPlanDay: routingRecheckMaxPerPlanDay,
};

/** One plan, one trigger. Null when the plan is not due; throws only what the pass throws. */
async function recheckPlanDay(
  c: RoutingRecheckCandidate,
  now: Date,
  trigger: RoutingRecheckTrigger,
  deps: RoutingRecheckDeps,
): Promise<LegRecheckResult | null> {
  const due = routingRecheckDue(c, now, trigger);
  if (!due) return null;
  const dayStart = zonedWallClockToInstant(due.date, "00:00", due.zone);
  if (!dayStart) return null;
  return deps.recheck({
    tripId: c.id,
    userId: c.userId,
    destination: c.destination,
    startDate: c.startDate,
    timezone: due.zone,
    datesConfirmed: true,
    dayNumber: due.dayNumber,
    since: routingRecheckSince(dayStart, now, deps.maxPerPlanDay()),
    checkDate: due.date,
    now,
  });
}

function tally(result: RoutingRecheckResult, r: LegRecheckResult): void {
  result.rechecked += 1;
  result.legsChecked += r.checked;
  result.legsChanged += r.changed + r.broken;
  result.legsNotified += r.notified;
  // P0 ruling 6: pairs with no leg are counted, never written; present only when > 0.
  if (r.missing) result.legsMissing = (result.legsMissing ?? 0) + r.missing;
}

/** The SCHEDULED trigger: every plan in its 06:00 local hour on a trip day. */
export async function runRoutingRecheck(now: Date = new Date(), deps: RoutingRecheckDeps = defaultRoutingRecheckDeps): Promise<RoutingRecheckResult> {
  const result: RoutingRecheckResult = { considered: 0, rechecked: 0, legsChecked: 0, legsChanged: 0, legsNotified: 0, failed: 0 };
  let plans: RoutingRecheckCandidate[];
  try {
    plans = await deps.candidates(now);
  } catch (err: any) {
    return { ...result, error: err?.message ?? String(err) };
  }
  for (const c of plans) {
    result.considered += 1;
    try {
      const r = await recheckPlanDay(c, now, "scheduled", deps);
      if (r) tally(result, r);
    } catch (err) {
      result.failed += 1;
      console.error(`[routing-recheck] plan ${c.id} failed:`, (err as Error)?.message ?? err);
    }
  }
  return result;
}

/**
 * The FIRST-OPEN trigger: the same pass for one plan, when the card is opened on a trip day at or after
 * 06:00 local. The guard makes every open after the first a no-op. Never throws (§15b — a re-check may
 * not break the read that triggered it); answers null when the plan is not due.
 */
export async function runRoutingRecheckOnOpen(
  tripId: string,
  now: Date = new Date(),
  deps: RoutingRecheckDeps = defaultRoutingRecheckDeps,
): Promise<LegRecheckResult | null> {
  try {
    const c = await deps.candidate(tripId);
    if (!c) return null;
    return await recheckPlanDay(c, now, "first_open", deps);
  } catch (err) {
    console.error(`[routing-recheck] first-open ${tripId} failed:`, (err as Error)?.message ?? err);
    return null;
  }
}
