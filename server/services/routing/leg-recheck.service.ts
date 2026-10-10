/**
 * THE LEG RE-CHECK (step 9b, L8 / D5 / D6 / D9 — ledger `2026-10-07-step9b-optimizer-and-rechecks`;
 * surface spec R-aw, R-bb). ONE pass, two callers: the T-3 `facts-recheck` job (the whole plan) and the
 * hourly `legs-dayof-recheck` job (one trip day, at 06:00 in the plan's own zone).
 *
 * It asks the routing adapter (through the R299 gate, like every routing call) about each leg the plan
 * SHOWS, and it NEVER WRITES A LEG: no minutes, no mode, no row added or removed. What it writes is the
 * leg's own `leg_check_status` / `leg_checked_at` and, for a changed or broken leg, ONE deduped
 * notice the card's banner reads. Rules that must not be weakened:
 *   · only a plan that earns routed legs (`planGetsRoutedLegs`) and whose dates were CHOSEN
 *     (`trips.dates_confirmed_at`, D9) is re-checked — a re-check against a placeholder day is noise;
 *   · each leg is CLAIMED before the call (§15): one conditional UPDATE stamps `leg_checked_at` only
 *     when it is older than this check's day, so a second run — or a second instance — on the same
 *     day asks nothing and writes nothing (idempotent per plan-day);
 *   · `paused` (the Maps cap) learned nothing: the claim is RELEASED back to its old stamp and the
 *     pass stops, so the next run asks again (§13 — never "ok" for a leg nobody checked);
 *   · a finding's dedupe key is per stop pair per check date, so two runs write one finding.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { transportLegs } from "@shared/schema";
import { normalizeLegMode } from "@shared/travel-speeds";
import { addCalendarDays, zonedWallClockToInstant } from "@shared/plan-timing";
import type { RoutingAdapter, RoutingMode } from "@shared/routing-engine";
import { FACTS_RECHECK_NOTICE_TYPE } from "@shared/facts-recheck";
import { classifyLegRecheck, legRecheckDedupeKey, legRecheckLine, LEG_RECHECK_KIND, type LegCheckStatus } from "@shared/leg-recheck";
import { storage } from "../../storage";
import { routingAdapter } from "./index";
import { departureWallClock, legDepartureWallClock } from "./plan-legs";
import { tripGetsRoutedLegs, tripLegsShown } from "./plan-routed-legs.service";

export interface RecheckLeg {
  id: string;
  dayNumber: number;
  fromActivityId: string | null;
  toActivityId: string | null;
  toName: string | null;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  mode: RoutingMode;
  wasMin: number;
  /** The departure wall clock ("HH:MM") the plan's own times give this leg, or null. */
  wallClock: string | null;
}

export interface LegRecheckResult {
  checked: number;
  changed: number;
  broken: number;
  notified: number;
  paused: boolean;
  /**
   * P0 ruling 6 (ledger `2026-10-10-p0-legs-baseline`): pairs the plan should have a leg for and shows
   * none — COUNTED, never written (9b D6: the re-check never writes a leg). Present only when > 0.
   */
  missing?: number;
  skipped?: "not_routed" | "dates_not_confirmed" | "no_adapter";
}

export interface LegRecheckDeps {
  adapter: () => RoutingAdapter | null;
  qualifies: (tripId: string) => Promise<boolean>;
  legs: (tripId: string) => Promise<RecheckLeg[]>;
  /** P0 ruling 6: how many desired pairs show no leg (this day, or the whole plan). Read only. */
  missingPairs?: (tripId: string, dayNumber: number | null) => Promise<number>;
  /** §15: stamp `leg_checked_at = at` only when it is NULL or older than `since`; the prior stamp, or `false` when not claimed. */
  claim: (legId: string, since: Date, at: Date) => Promise<{ claimed: false } | { claimed: true; prior: Date | null }>;
  /** Put a claim back (the call learned nothing). Conditional on our own stamp. */
  release: (legId: string, at: Date, prior: Date | null) => Promise<void>;
  /** Record the status — conditional on our own stamp, so a later claim is never overwritten. */
  writeStatus: (legId: string, at: Date, status: LegCheckStatus) => Promise<void>;
  notifyOnce: (n: { tripId: string; userId: string; destination: string | null; leg: RecheckLeg; nowMin: number | null; status: "changed" | "broken"; checkedAt: Date; checkDate: string }) => Promise<boolean>;
}

export interface LegRecheckInput {
  tripId: string;
  userId: string;
  destination: string | null;
  startDate: string | null;
  timezone: string | null;
  datesConfirmed: boolean;
  /** Day-of: only this trip day's legs. Omitted at T-3 (the whole plan). */
  dayNumber?: number | null;
  /** The start of this check's day — a leg checked at or after it is not asked again. */
  since: Date;
  /** The check's calendar date ("YYYY-MM-DD") — part of each finding's dedupe key. */
  checkDate: string;
  now: Date;
}

export async function recheckPlanLegs(input: LegRecheckInput, deps: LegRecheckDeps = defaultLegRecheckDeps): Promise<LegRecheckResult> {
  const result: LegRecheckResult = { checked: 0, changed: 0, broken: 0, notified: 0, paused: false };
  if (!input.datesConfirmed) return { ...result, skipped: "dates_not_confirmed" };
  if (!(await deps.qualifies(input.tripId))) return { ...result, skipped: "not_routed" };
  const adapter = deps.adapter();
  if (!adapter) return { ...result, skipped: "no_adapter" };
  if (deps.missingPairs) {
    const missing = await deps.missingPairs(input.tripId, input.dayNumber ?? null).catch(() => 0);
    if (missing > 0) result.missing = missing;
  }
  const legs = (await deps.legs(input.tripId)).filter((l) => input.dayNumber == null || l.dayNumber === input.dayNumber);
  for (const leg of legs) {
    const at = input.now;
    const c = await deps.claim(leg.id, input.since, at);
    if (!c.claimed) continue;
    // P0 ruling 3: no time of day ⇒ a fixed local 10:00 on the trip day, never server-now.
    const departAt = input.startDate
      ? zonedWallClockToInstant(addCalendarDays(input.startDate.slice(0, 10), leg.dayNumber - 1), legDepartureWallClock(leg.wallClock), input.timezone)
      : null;
    const outcome = await adapter.route({ lat: leg.fromLat, lng: leg.fromLng }, { lat: leg.toLat, lng: leg.toLng }, leg.mode, departAt);
    const status = classifyLegRecheck(
      leg.wasMin,
      outcome.kind === "ok" ? { kind: "ok", durationMin: outcome.route.durationMin } : outcome.kind === "no_route" ? { kind: "no_route" } : { kind: "paused" },
    );
    if (status == null) {
      await deps.release(leg.id, at, c.prior);
      result.paused = true;
      break;
    }
    result.checked += 1;
    await deps.writeStatus(leg.id, at, status);
    if (status === "ok") continue;
    if (status === "changed") result.changed += 1;
    else result.broken += 1;
    const nowMin = outcome.kind === "ok" ? Math.round(outcome.route.durationMin) : null;
    if (
      await deps.notifyOnce({
        tripId: input.tripId,
        userId: input.userId,
        destination: input.destination,
        leg,
        nowMin,
        status,
        checkedAt: at,
        checkDate: input.checkDate,
      })
    )
      result.notified += 1;
  }
  return result;
}

/** The legs the plan SHOWS (the one read rule), with points, a routable mode and positive minutes. */
async function shownRecheckLegs(tripId: string): Promise<RecheckLeg[]> {
  const items = await storage.getItineraryItems(tripId);
  const byId = new Map(items.map((i: any) => [i.id, i] as const));
  const out: RecheckLeg[] = [];
  for (const l of (await tripLegsShown(tripId)) as any[]) {
    const mode = normalizeLegMode(l.userSelectedMode ?? l.recommendedMode);
    const wasMin = Number(l.estimatedDurationMinutes);
    const pts = [l.fromLat, l.fromLng, l.toLat, l.toLng].map(Number);
    if (!mode || !Number.isFinite(wasMin) || wasMin <= 0 || pts.some((n) => !Number.isFinite(n))) continue;
    const from = l.fromActivityId ? byId.get(l.fromActivityId) : undefined;
    const to = l.toActivityId ? byId.get(l.toActivityId) : undefined;
    const wallClock = from
      ? departureWallClock({ startTime: from.startTime ?? null, endTime: from.endTime ?? null, durationMinutes: from.durationMinutes ?? null })
      : to?.startTime
        ? String(to.startTime).slice(0, 5)
        : null;
    out.push({
      id: l.id,
      dayNumber: l.dayNumber,
      fromActivityId: l.fromActivityId ?? null,
      toActivityId: l.toActivityId ?? null,
      toName: l.toName ?? to?.title ?? null,
      fromLat: pts[0],
      fromLng: pts[1],
      toLat: pts[2],
      toLng: pts[3],
      mode,
      wasMin,
      wallClock,
    });
  }
  return out;
}

export const defaultLegRecheckDeps: LegRecheckDeps = {
  adapter: () => routingAdapter(),
  qualifies: (tripId) => tripGetsRoutedLegs(tripId),
  legs: shownRecheckLegs,
  async missingPairs(tripId, dayNumber) {
    const { planLegGapsByDay } = await import("./plan-legs-engine.service");
    const gaps = await planLegGapsByDay(tripId);
    if (dayNumber != null) return gaps.get(dayNumber) ?? 0;
    let total = 0;
    gaps.forEach((n) => (total += n));
    return total;
  },
  async claim(legId, since, at) {
    const [prev] = await db.select({ checkedAt: transportLegs.legCheckedAt }).from(transportLegs).where(eq(transportLegs.id, legId)).limit(1);
    if (!prev) return { claimed: false };
    const prior = prev.checkedAt ?? null;
    const rows = await db
      .update(transportLegs)
      .set({ legCheckedAt: at })
      .where(
        and(eq(transportLegs.id, legId), sql`(${transportLegs.legCheckedAt} IS NULL OR ${transportLegs.legCheckedAt} < ${since})`),
      )
      .returning({ id: transportLegs.id });
    return rows.length ? { claimed: true, prior } : { claimed: false };
  },
  async release(legId, at, prior) {
    await db.update(transportLegs).set({ legCheckedAt: prior }).where(and(eq(transportLegs.id, legId), eq(transportLegs.legCheckedAt, at)));
  },
  async writeStatus(legId, at, status) {
    await db.update(transportLegs).set({ legCheckStatus: status }).where(and(eq(transportLegs.id, legId), eq(transportLegs.legCheckedAt, at)));
  },
  async notifyOnce(n) {
    const dedupeKey = legRecheckDedupeKey(n.tripId, n.leg.fromActivityId, n.leg.toActivityId, n.checkDate);
    const finding = { toName: n.leg.toName, mode: n.leg.mode, wasMin: n.leg.wasMin, nowMin: n.nowMin, status: n.status };
    const { inserted } = await storage.createNotificationOnce({
      userId: n.userId,
      type: FACTS_RECHECK_NOTICE_TYPE,
      title: `A change on your ${n.destination ? `${n.destination.split(",")[0].trim()} ` : ""}plan`,
      message: legRecheckLine(finding, null),
      relatedId: n.tripId,
      relatedType: "trip",
      data: {
        kind: LEG_RECHECK_KIND,
        tripId: n.tripId,
        workspacePath: `/trip/${n.tripId}`,
        dayNumber: n.leg.dayNumber,
        fromActivityId: n.leg.fromActivityId,
        toActivityId: n.leg.toActivityId,
        ...finding,
        checkedAt: n.checkedAt.toISOString(),
      },
      dedupeKey,
    } as any);
    if (inserted) {
      // LD 53: the push sender claims the notice once; a failure never fails the job (§15b).
      void import("../web-push.service")
        .then(async ({ dispatchPushForNotification }) => {
          const [row] = ((await db.execute(sql`SELECT id FROM notifications WHERE dedupe_key = ${dedupeKey} LIMIT 1`)) as any).rows ?? [];
          if (row?.id) await dispatchPushForNotification(row.id);
        })
        .catch(() => undefined);
    }
    return inserted;
  },
};
