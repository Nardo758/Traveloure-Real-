/**
 * PLAN JUMP TARGETS (R322, step 7a; surface spec §10 step 7 — R-bh). The ONE naming of the DOM ids
 * the expert's day surface stamps on its days, stops and legs, and the ONE resolution of a readiness
 * line (`GET /api/expert/ready-made/:id/readiness`, `ReadinessLine` / `ReadyMadeRequirementLine`) to
 * the element it is about — so the checklist's jump-to (L2-5) and the surface cannot disagree (§18
 * rule 1). Pure.
 *
 * Resolution order, most specific first: a leg by id → a leg by its two stops → a stop → an anchor →
 * the day. A line naming none of these has no target (null) — never a guessed one (§13).
 */

export function planDayDomId(dayNumber: number): string {
  return `plan-day-${dayNumber}`;
}

export function planItemDomId(itemId: string): string {
  return `plan-item-${itemId}`;
}

export function planLegDomId(legId: string): string {
  return `plan-leg-${legId}`;
}

/** A leg between two stops, addressable before (or without) a leg row existing. */
export function planLegPairDomId(dayNumber: number, fromItemId: string, toItemId: string): string {
  return `plan-gap-${dayNumber}-${fromItemId}-${toItemId}`;
}

export function planAnchorDomId(anchorId: string): string {
  return `plan-anchor-${anchorId}`;
}

export interface JumpableLine {
  dayNumber?: number | null;
  itemId?: string | null;
  fromItemId?: string | null;
  toItemId?: string | null;
  legId?: string | null;
  anchorId?: string | null;
}

/** The ids to try, in order; the caller jumps to the first one present in the page. */
export function readinessJumpTargets(line: JumpableLine): string[] {
  const out: string[] = [];
  if (line.legId) out.push(planLegDomId(line.legId));
  if (line.fromItemId && line.toItemId && line.dayNumber != null) out.push(planLegPairDomId(line.dayNumber, line.fromItemId, line.toItemId));
  if (line.itemId) out.push(planItemDomId(line.itemId));
  if (line.anchorId) out.push(planAnchorDomId(line.anchorId));
  if (line.dayNumber != null) out.push(planDayDomId(line.dayNumber));
  return out;
}
