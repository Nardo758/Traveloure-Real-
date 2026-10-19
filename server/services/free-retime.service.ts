/**
 * FB-1 step 4b — a free plan's retime fix, applied on tap (decision-maker, Oct 19, 2026; ledger
 * `2026-10-19-fb1-free-retime`).
 *
 * On a FREE plan (no routed legs — a paid plan has "Your plan, fixed"), a finding whose fix is `retime` can be applied
 * to the draft on tap: public facts only, no model call, no version. The moves are `planRetimeFix` (pure, shared); the
 * server offers a fix only when re-running the ONE checker on the moved day shows that stop's issue gone and nothing
 * new on the day. Owner and delegate only (`planRole(…, "choose")`). Confirm before apply: the tap previews first, and
 * the write is one transaction whose every update is conditional on the stop still starting where the plan said — a
 * plan that changed underneath is refused, never overwritten.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems } from "@shared/schema";
import { checkPlan, type PlanCheckInput } from "@shared/plan-check";
import { retimeWindowsByItem } from "@shared/version-check";
import { wallClockMinutes } from "@shared/leg-reachability";
import { visitEndMinutes } from "@shared/optimizer-lead";
import { formatItemTime, planRetimeFix, type DayStop, type RetimeMove } from "@shared/free-retime";
import { itineraryItemIsMachineProtected } from "@shared/itinerary-item-lock";

/** A stop a traveler's tap never moves as part of a fix: booked, in checkout, locked, or an expert's work. */
function isFixedStop(r: any): boolean {
  return !!r.bookingId || r.routingStatus === "purchased" || r.routingStatus === "ready_for_checkout" || itineraryItemIsMachineProtected(r);
}

export class FreeRetimeError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export interface FreeRetimeFix {
  itemId: string;
  title: string;
  day: number;
  moves: RetimeMove[];
}

const issueKey = (i: { type: string; day: number; why: string; stop: { itemId: string } | null }) => `${i.type}|${i.day}|${i.why}|${i.stop?.itemId ?? ""}`;

/** Pure: the day's timed stops in start order, each with whether a tap may move it. */
export function dayStopsOf(input: PlanCheckInput, day: number, movable: (id: string) => boolean): DayStop[] {
  return input.stops
    .filter((s) => s.dayNumber === day)
    .map((s) => {
      const start = wallClockMinutes(s.startTime);
      const end = visitEndMinutes(s as any);
      return start === null ? null : { id: s.id, title: s.title, startMin: start, endMin: end ?? start, movable: movable(s.id) };
    })
    .filter((s): s is DayStop => !!s)
    .sort((a, b) => a.startMin - b.startMin);
}

/** Pure: the input with the moves applied (start and, where the stop states one, end). */
export function withMoves(input: PlanCheckInput, moves: readonly RetimeMove[]): PlanCheckInput {
  const by = new Map(moves.map((m) => [m.itemId, m]));
  return {
    ...input,
    stops: input.stops.map((s) => {
      const m = by.get(s.id);
      return m ? { ...s, startTime: formatItemTime(m.toMin), endTime: s.endTime ? formatItemTime(m.endMin) : s.endTime } : s;
    }),
  };
}

/**
 * Pure: the retime fixes a tap may apply. A fix is offered only when the moved day, re-checked, no longer carries the
 * stop's issue and carries nothing the day did not already have.
 */
export function freeRetimeFixes(input: PlanCheckInput, movable: (id: string) => boolean): FreeRetimeFix[] {
  const before = checkPlan(input).issues;
  const windows = retimeWindowsByItem(before);
  const out: FreeRetimeFix[] = [];
  for (const [itemId, window] of Array.from(windows.entries())) {
    const stop = input.stops.find((s) => s.id === itemId);
    if (!stop) continue;
    const moves = planRetimeFix(dayStopsOf(input, stop.dayNumber, movable), itemId, window);
    if (!moves) continue;
    const after = checkPlan(withMoves(input, moves)).issues.filter((i) => i.day === stop.dayNumber);
    const beforeKeys = new Set(before.filter((i) => i.day === stop.dayNumber).map(issueKey));
    if (after.some((i) => i.stop?.itemId === itemId)) continue; // the fix did not clear it
    if (after.some((i) => !beforeKeys.has(issueKey(i)))) continue; // it would add a problem
    out.push({ itemId, title: stop.title, day: stop.dayNumber, moves });
  }
  return out.sort((a, b) => a.day - b.day);
}

async function guard(tripId: string, userId: string | null | undefined) {
  const { planRole } = await import("./plan-option-sets.service");
  if (!(await planRole(tripId, userId, "choose"))) throw new FreeRetimeError(404, "not_found", "No such plan");
  const { tripGetsRoutedLegs } = await import("./routing/plan-routed-legs.service");
  return { routed: await tripGetsRoutedLegs(tripId) };
}

async function loadFixes(tripId: string) {
  const { loadPlanCheckInput } = await import("./optimizer-lead.service");
  const { input } = await loadPlanCheckInput(tripId);
  const rows = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, tripId));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const movable = (id: string) => {
    const r = byId.get(id);
    return !!r && !isFixedStop(r);
  };
  return { fixes: freeRetimeFixes(input, movable), byId };
}

/** The read: a free plan's tap-able retime fixes (a paid plan has none here — it has "Your plan, fixed"). */
export async function loadFreeRetimeFixes(tripId: string, userId: string | null | undefined): Promise<FreeRetimeFix[]> {
  const { routed } = await guard(tripId, userId);
  if (routed) return [];
  return (await loadFixes(tripId)).fixes;
}

/** The tap: preview (no write) or apply one stop's fix. The moves are always recomputed here, never taken from a body. */
export async function applyFreeRetimeFix(input: { tripId: string; userId: string; itemId: string; preview: boolean }): Promise<FreeRetimeFix> {
  const { routed } = await guard(input.tripId, input.userId);
  if (routed) throw new FreeRetimeError(409, "paid_plan", "This plan uses Your plan, fixed");
  const { fixes, byId } = await loadFixes(input.tripId);
  const fix = fixes.find((f) => f.itemId === input.itemId);
  if (!fix) throw new FreeRetimeError(409, "no_fix", "This stop has no fix to apply now");
  if (input.preview) return fix;
  await db.transaction(async (tx) => {
    for (const m of fix.moves) {
      const row = byId.get(m.itemId)!;
      const set: Record<string, unknown> = { startTime: formatItemTime(m.toMin), updatedAt: new Date() };
      if (row.endTime) set.endTime = formatItemTime(m.endMin);
      const done = await tx
        .update(itineraryItems)
        .set(set as any)
        .where(and(eq(itineraryItems.id, m.itemId), eq(itineraryItems.tripId, input.tripId), eq(itineraryItems.startTime, row.startTime ?? "")))
        .returning({ id: itineraryItems.id });
      if (!done.length) throw new FreeRetimeError(409, "plan_changed", "This day changed — look again");
    }
  });
  const { enqueuePlanLegRecompute } = await import("./routing/plan-legs-queue");
  enqueuePlanLegRecompute(input.tripId);
  return fix;
}
