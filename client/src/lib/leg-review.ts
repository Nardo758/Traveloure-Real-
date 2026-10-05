/**
 * THE LEG REVIEW STEPPER, PURE HALF (work plan L2-4, enhancement 2; R303 is its server read; ledger
 * `2026-10-05-leg-review-stepper`). No DOM, no network.
 *
 * The stepper walks the SAME pairs the Workstation's day surface draws (step 7a, R322): every pair of
 * consecutive stops on a day is either a leg row (`legBetween`) or a gap row. So a step is exactly one
 * of those rows, and nothing here re-decides what a leg is (§18 rule 1). `located` and `legBetween`
 * live here once and `WorkstationDays` imports them.
 *
 * Constraints ruled for this lane (decision-maker, Oct 5, 2026):
 *   · a stop with no coordinates is NEVER placed — the step says to locate it (§13, no guessed point);
 *   · the hop map is two points and a dashed straight line labelled as stop order, not a route — no
 *     tiles and no map component (ruling R-d: one map);
 *   · edit controls only for a writer (the build's author, or a §12 WRITE-status advisor) — see
 *     `workstationCanEdit`.
 */
import { advisorStatusGrantsWriteAccess } from "@shared/trip-advisor-write-access";

export interface PointLike { lat?: number | null; lng?: number | null }

/** A usable point: both numbers finite and not the 0,0 sentinel. */
export function located(a: PointLike): boolean {
  return typeof a.lat === "number" && typeof a.lng === "number" && Number.isFinite(a.lat) && Number.isFinite(a.lng) && !(a.lat === 0 && a.lng === 0);
}

export interface LegLike { id: string; dayNumber: number; fromActivityId: string | null; toActivityId: string | null }

/** The leg the Workstation draws between two stops on a day, if any. */
export function legBetween<L extends LegLike>(legs: readonly L[], dayNumber: number, fromId: string, toId: string): L | null {
  return legs.find((l) => l.dayNumber === dayNumber && l.fromActivityId === fromId && l.toActivityId === toId) ?? null;
}

export interface StopLike extends PointLike { id: string; name: string }
export interface DayLike<S extends StopLike> { dayNum: number; activities?: readonly S[] | null }
/** A review row (R303): the authoring facts plus `picked`. */
export interface ReviewLegLike extends LegLike { picked: boolean }

export type LegReviewStep<S extends StopLike, L extends ReviewLegLike> =
  | { kind: "leg"; dayNumber: number; from: S; to: S; leg: L }
  /** No leg because a stop has no point: the step asks for a location and names which stop(s). */
  | { kind: "locate"; dayNumber: number; from: S; to: S; unlocated: S[] }
  /** Both stops located, no leg yet: generate proposes one. Never a drawn line. */
  | { kind: "unrouted"; dayNumber: number; from: S; to: S };

/** Every consecutive pair, day by day, in the Workstation's own order. */
export function buildLegReviewSteps<S extends StopLike, L extends ReviewLegLike>(
  days: readonly DayLike<S>[],
  legs: readonly L[],
): LegReviewStep<S, L>[] {
  const steps: LegReviewStep<S, L>[] = [];
  for (const d of days) {
    const acts = d.activities ?? [];
    for (let i = 1; i < acts.length; i++) {
      const from = acts[i - 1];
      const to = acts[i];
      const leg = legBetween(legs, d.dayNum, from.id, to.id);
      if (leg) steps.push({ kind: "leg", dayNumber: d.dayNum, from, to, leg });
      else if (!located(from) || !located(to)) steps.push({ kind: "locate", dayNumber: d.dayNum, from, to, unlocated: [from, to].filter((s) => !located(s)) });
      else steps.push({ kind: "unrouted", dayNumber: d.dayNum, from, to });
    }
  }
  return steps;
}

/** Where the stepper opens: a named leg if asked, else the first step that still needs the author. */
export function firstReviewStep<S extends StopLike, L extends ReviewLegLike>(steps: readonly LegReviewStep<S, L>[], legId?: string | null): number {
  if (legId) {
    const at = steps.findIndex((s) => s.kind === "leg" && s.leg.id === legId);
    if (at >= 0) return at;
  }
  const open = steps.findIndex((s) => s.kind !== "leg" || !s.leg.picked);
  return open >= 0 ? open : 0;
}

/** After a confirm: the next step that still needs the author, after this one; null when none is left. */
export function nextOpenStep<S extends StopLike, L extends ReviewLegLike>(steps: readonly LegReviewStep<S, L>[], from: number, justConfirmedLegId?: string | null): number | null {
  for (let i = from + 1; i < steps.length; i++) {
    const s = steps[i];
    if (s.kind !== "leg" || (!s.leg.picked && s.leg.id !== justConfirmedLegId)) return i;
  }
  return null;
}

/**
 * The hop map's two points in an SVG box, or null when either stop is unlocated (then nothing is
 * drawn — the step asks for a location instead). Equirectangular with a cos(latitude) correction,
 * fitted with padding; two identical points sit apart at the centre so neither hides the other.
 */
export function hopMapPoints(from: PointLike, to: PointLike, width: number, height: number, pad = 24): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
  if (!located(from) || !located(to)) return null;
  const k = Math.cos((((from.lat as number) + (to.lat as number)) / 2) * (Math.PI / 180));
  const ax = (from.lng as number) * k, ay = -(from.lat as number);
  const bx = (to.lng as number) * k, by = -(to.lat as number);
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return { a: { x: width / 2 - 8, y: height / 2 }, b: { x: width / 2 + 8, y: height / 2 } };
  const scale = Math.min((width - 2 * pad) / Math.max(Math.abs(dx), 1e-9), (height - 2 * pad) / Math.max(Math.abs(dy), 1e-9));
  const cx = width / 2, cy = height / 2;
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  return {
    a: { x: cx + (ax - mx) * scale, y: cy + (ay - my) * scale },
    b: { x: cx + (bx - mx) * scale, y: cy + (by - my) * scale },
  };
}

/**
 * Slice A1 (ledger `2026-10-05-leg-live-hop-path`): the hop map with the leg's live ROUTE. The two
 * stops and every point of the route's shape are fitted into ONE box with the same projection
 * `hopMapPoints` uses, so the numbered stops sit on the path's ends. Null when either stop is
 * unlocated (nothing is drawn — §13) or the path has fewer than two points (the caller keeps the
 * dashed stop-order line).
 */
export function hopPathPoints(
  from: PointLike,
  to: PointLike,
  path: ReadonlyArray<{ lat: number; lng: number }> | null | undefined,
  width: number,
  height: number,
  pad = 24,
): { a: { x: number; y: number }; b: { x: number; y: number }; path: { x: number; y: number }[] } | null {
  if (!located(from) || !located(to) || !path || path.length < 2) return null;
  const all = [{ lat: from.lat as number, lng: from.lng as number }, ...path, { lat: to.lat as number, lng: to.lng as number }];
  const lats = all.map((p) => p.lat);
  const k = Math.cos(((Math.min(...lats) + Math.max(...lats)) / 2) * (Math.PI / 180));
  const xy = all.map((p) => ({ x: p.lng * k, y: -p.lat }));
  const minX = Math.min(...xy.map((p) => p.x)), maxX = Math.max(...xy.map((p) => p.x));
  const minY = Math.min(...xy.map((p) => p.y)), maxY = Math.max(...xy.map((p) => p.y));
  const scale = Math.min((width - 2 * pad) / Math.max(maxX - minX, 1e-9), (height - 2 * pad) / Math.max(maxY - minY, 1e-9));
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const proj = (p: { x: number; y: number }) => ({ x: width / 2 + (p.x - mx) * scale, y: height / 2 + (p.y - my) * scale });
  const projected = xy.map(proj);
  return { a: projected[0], b: projected[projected.length - 1], path: projected.slice(1, -1) };
}

/**
 * May this viewer edit legs on the Workstation? The build's author (`authoring` mode), or an advisor
 * whose status grants §12 WRITE access — the ONE shared predicate, never a restated list. A pending
 * advisor, an unknown status, or a context still loading answers false: edit controls fail closed.
 * The server's own `requireWriteAccess` remains the guard; this decides only what is drawn.
 */
export function workstationCanEdit(ctx: { mode?: string | null; assignment?: { status?: string | null } | null } | null | undefined): boolean {
  if (!ctx) return false;
  if (ctx.mode === "authoring") return true;
  if (ctx.mode === "assignment") return advisorStatusGrantsWriteAccess(ctx.assignment?.status);
  return false;
}
