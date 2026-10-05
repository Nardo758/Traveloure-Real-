/**
 * REACHABILITY READS THE PLAN'S OWN LEGS (Slice A2; ledger `2026-10-05-reachability-from-legs`).
 *
 * "N stops may not be reachable in time" used to count stops reached while CLOSED and timed entries
 * that CLASH — neither of which reads a travel time at all. Reachability is now ONE rule over the
 * plan's `transport_legs` rows: the leg's own `estimated_duration_minutes` — the SAME figure the
 * expert confirms in the leg review and the traveler reads on the leg row — against the gap the
 * draft's own times leave. Pure, no network, no clock; the Finish card and the readiness advisory
 * both call it (§18 rule 1), so the two cannot disagree, and neither ever estimates a travel time on
 * its own (no straight-line guess, no client-side speed).
 *
 * How the gap is read (§13 — never an invented activity length):
 *   · the stop you leave ENDS at its own end time when it has one;
 *   · else at its start plus its own stated duration;
 *   · else only its START is known, and the check is the weaker, still-true one: the leg alone
 *     takes longer than the time between the two starts.
 * A pair is checked only when it has a leg with a positive duration and both times parse; anything
 * else is left unchecked and counted as such — never "reachable".
 */

export interface ReachItem {
  id: string;
  title: string;
  dayNumber: number | null;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
}

export interface ReachLeg {
  id: string;
  dayNumber: number;
  fromActivityId: string | null;
  toActivityId: string | null;
  estimatedDurationMinutes: number | null;
}

export type DepartureBasis = "end_time" | "duration" | "start_only";

export interface UnreachableStop {
  legId: string;
  dayNumber: number;
  fromItemId: string;
  fromTitle: string;
  toItemId: string;
  toTitle: string;
  /** The leg's own minutes — the confirmed travel time. */
  legMinutes: number;
  /** Minutes between leaving the first stop and the second stop's start. */
  gapMinutes: number;
  shortByMinutes: number;
  basis: DepartureBasis;
}

/** "09:30", "9:30", "9:30 AM", "21:05:00" → minutes after midnight; null when it does not parse. */
export function wallClockMinutes(text: string | null | undefined): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?\s*$/i.exec(String(text ?? ""));
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2]);
  const mer = m[3]?.toUpperCase();
  if (mer) {
    if (h < 1 || h > 12) return null;
    if (mer === "AM" && h === 12) h = 0;
    if (mer === "PM" && h !== 12) h += 12;
  }
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59 ? h * 60 + mi : null;
}

function departure(i: ReachItem): { at: number; basis: DepartureBasis } | null {
  const start = wallClockMinutes(i.startTime);
  const end = wallClockMinutes(i.endTime);
  if (end != null && (start == null || end >= start)) return { at: end, basis: "end_time" };
  if (start == null) return null;
  const d = Number(i.durationMinutes);
  if (Number.isFinite(d) && d > 0) return { at: start + d, basis: "duration" };
  return { at: start, basis: "start_only" };
}

/** Every leg whose travel time does not fit the gap the draft's times leave, plus how many were checked. */
export function unreachableStops(items: readonly ReachItem[], legs: readonly ReachLeg[]): { unreachable: UnreachableStop[]; checked: number } {
  const byId = new Map(items.map((i) => [i.id, i] as const));
  const unreachable: UnreachableStop[] = [];
  let checked = 0;
  for (const leg of legs) {
    const minutes = Number(leg.estimatedDurationMinutes);
    if (!leg.fromActivityId || !leg.toActivityId || !Number.isFinite(minutes) || minutes <= 0) continue;
    const from = byId.get(leg.fromActivityId);
    const to = byId.get(leg.toActivityId);
    if (!from || !to || from.dayNumber !== leg.dayNumber || to.dayNumber !== leg.dayNumber) continue;
    const leave = departure(from);
    const arrive = wallClockMinutes(to.startTime);
    if (!leave || arrive == null) continue;
    checked += 1;
    const gap = arrive - leave.at;
    if (minutes > gap) {
      unreachable.push({
        legId: leg.id,
        dayNumber: leg.dayNumber,
        fromItemId: from.id,
        fromTitle: from.title,
        toItemId: to.id,
        toTitle: to.title,
        legMinutes: minutes,
        gapMinutes: gap,
        shortByMinutes: minutes - gap,
        basis: leave.basis,
      });
    }
  }
  unreachable.sort((a, b) => a.dayNumber - b.dayNumber || a.toTitle.localeCompare(b.toTitle));
  return { unreachable, checked };
}

/** The readiness advisory's words for one unreachable stop. */
export function unreachableLine(u: UnreachableStop): string {
  const gap = u.gapMinutes <= 0 ? "no time" : `${u.gapMinutes} min`;
  return `Day ${u.dayNumber}: ${u.toTitle} can't be reached in time — the leg from ${u.fromTitle} takes ${u.legMinutes} min and the plan leaves ${gap}`;
}

/** The free preview's finding: how many STOPS (unique) the plan's legs can't reach, and on which days. */
export function legUnreachableFinding(unreachable: readonly UnreachableStop[]): { kind: "leg_unreachable"; count: number; days: number[] } | null {
  if (!unreachable.length) return null;
  const stops = new Set(unreachable.map((u) => u.toItemId));
  const days = Array.from(new Set(unreachable.map((u) => u.dayNumber))).sort((a, b) => a - b);
  return { kind: "leg_unreachable", count: stops.size, days };
}
