/**
 * A ROUTED LEG'S OPTIONS, ASKED ON TAP (step 9c D1/D2, ledger `2026-10-07-step9c-leg-options`). The rules
 * are `shared/leg-options.ts`; this file reads the leg, asks the ONE routing adapter for the modes the leg
 * does not already hold (at most two calls), and stores the answers on the leg's OWN row — plan data,
 * never a cache (LD 63; Google terms). Asked once: entry 0's `optionsCheckedAt` marker makes a re-open
 * free. A paused caller (the daily cap) stores nothing and says so (L5); a mode with no route is omitted.
 *
 * Only an ENGINE leg (`source` set) on a plan that passes `planGetsRoutedLegs` has options; any other leg
 * is refused by name and no call is made.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { transportLegs } from "@shared/schema";
import type { RoutingAdapter } from "@shared/routing-engine";
import { routeLegKey } from "@shared/routing-engine";
import { haversineMeters } from "@shared/geo";
import {
  legOptionCandidates,
  legOptionsChecked,
  legOptionsToAsk,
  routedLegOptions,
  storedLegOption,
  withLegOptions,
  type LegOptionView,
  type StoredLegOption,
} from "@shared/leg-options";
import { storage } from "../../storage";
import { routingAdapter } from "./index";
import { RouteRunMemo } from "./route-memo";
import { legPairKey } from "./plan-legs";
import { tripGetsRoutedLegs } from "./plan-routed-legs.service";
import { engineLegKey, loadPlanLegContext } from "./plan-legs-engine.service";

export type LegOptionsResult =
  | { refused: "engine_off" | "free_plan" | "not_found" | "not_routed" | "out_of_date" }
  | { refused?: undefined; options: LegOptionView[]; calls: number; paused: boolean };

const inFlight = new Map<string, Promise<LegOptionsResult>>();

export async function askLegOptions(
  tripId: string,
  legId: string,
  deps: { adapter?: RoutingAdapter | null; qualifies?: boolean } = {},
): Promise<LegOptionsResult> {
  // Two taps on one leg in this process make one ask (the conditional write below covers the rest).
  const key = `${tripId}|${legId}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const p = ask(tripId, legId, deps).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

async function readLeg(tripId: string, legId: string) {
  const [leg] = await db
    .select()
    .from(transportLegs)
    .where(and(eq(transportLegs.id, legId), eq(transportLegs.tripId, tripId)))
    .limit(1);
  return leg ?? null;
}

async function ask(tripId: string, legId: string, deps: { adapter?: RoutingAdapter | null; qualifies?: boolean }): Promise<LegOptionsResult> {
  const adapter = deps.adapter !== undefined ? deps.adapter : routingAdapter();
  if (!adapter) return { refused: "engine_off" };
  const qualifies = deps.qualifies ?? (await tripGetsRoutedLegs(tripId));
  if (!qualifies) return { refused: "free_plan" };
  const leg = await readLeg(tripId, legId);
  if (!leg) return { refused: "not_found" };
  if (leg.source == null || leg.variantId != null || leg.proposalStatus === "confirmed") return { refused: "not_routed" };
  const held = routedLegOptions(leg) ?? [];
  if (legOptionsChecked(leg.alternativeModes)) return { options: held, calls: 0, paused: false };

  const trip = await storage.getTrip(tripId);
  if (!trip) return { refused: "not_found" };
  const ctx = await loadPlanLegContext(tripId, trip);
  const desired = ctx.desired.find((d) => d.pairKey === legPairKey(leg.dayNumber, leg.fromActivityId, leg.toActivityId));
  // The stored leg must be the one the plan would compute now; otherwise a recompute is due and the
  // options would be keyed to stale points.
  if (!desired || desired.legKey !== engineLegKey(leg.alternativeModes)) return { refused: "out_of_date" };

  const candidates = legOptionCandidates({
    current: desired.mode,
    straightLineMeters: haversineMeters(desired.from.point.lat, desired.from.point.lng, desired.to.point.lat, desired.to.point.lng),
    hasTransitCoverage: ctx.hasTransitCoverage,
  });
  const toAsk = legOptionsToAsk(candidates, held.map((o) => o.mode));
  const memo = new RouteRunMemo();
  const added: StoredLegOption[] = [];
  let calls = 0;
  for (const mode of toAsk) {
    const r = await memo.route(
      { origin: desired.from.point, destination: desired.to.point, mode, departAt: ctx.departAt(desired), hourBucket: desired.hourBucket },
      adapter,
    );
    if (r.outcome.kind === "paused") return { options: held, calls, paused: true };
    if (!r.reused) calls++;
    if (r.outcome.kind === "no_route") continue;
    added.push(storedLegOption(mode, r.outcome.route, routeLegKey(desired.from.point, desired.to.point, mode, desired.hourBucket), desired.hourBucket));
  }

  const next = withLegOptions(leg.alternativeModes, leg, added, new Date().toISOString());
  // Conditional on the leg still being the one we read (same leg key, not yet asked): a recompute that
  // replaced it in the meantime wins, and its fresh leg is asked on the next tap.
  const [row] = await db
    .update(transportLegs)
    .set({ alternativeModes: next as any, updatedAt: new Date() })
    .where(
      and(
        eq(transportLegs.id, legId),
        eq(transportLegs.tripId, tripId),
        sql`${transportLegs.alternativeModes}->0->>'legKey' = ${desired.legKey}`,
        sql`${transportLegs.alternativeModes}->0->>'optionsCheckedAt' IS NULL`,
      ),
    )
    .returning();
  const stored = row ?? (await readLeg(tripId, legId));
  return { options: (stored && routedLegOptions(stored)) || held, calls, paused: false };
}

