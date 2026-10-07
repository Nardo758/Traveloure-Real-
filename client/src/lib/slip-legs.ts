/**
 * Step 9a — which routed leg sits between two slip rows (ledger `2026-10-07-step9a-routing-engine`;
 * spec §3 LegRow, ruling 1). Pure: reads the plancard's `days[].transports`, where the server put ONLY
 * the legs this plan may show (`selectPlanLegs` — engine legs on a routed plan, an expert's confirmed
 * leg winning per pair). A leg is drawn between rows only when it carries the engine's `routed` facts;
 * anything else draws nothing here (the day-end list keeps it until 9c).
 */
import type { RouteAnswer, RoutingMode } from "@shared/routing-engine";
import { normalizeLegMode } from "@shared/travel-speeds";

export const TRAVEL_TIMES_PAUSED_LINE = "Travel times paused today — resumes tomorrow";

type SlipLeg = {
  id: string;
  fromActivityId?: string | null;
  toActivityId?: string | null;
  from?: string;
  to?: string;
  mode?: string;
  recommendedMode?: string;
  userSelectedMode?: string | null;
  estimatedDurationMinutes?: number;
  durationMin?: number;
  distanceMeters?: number | null;
  routed?: { line: string | null; fare: { amount: number; currency: string } | null; provenance: { source: string; checkedAt: string } };
};
type SlipDay = { dayNumber?: number; dayNum?: number; activities?: Array<{ id: string }>; transports?: SlipLeg[] };

export interface RoutedLegView {
  legId: string;
  mode: RoutingMode;
  route: RouteAnswer;
}

/** The routed leg from `prevId` to `nextId`, or null. */
export function routedLegBetween(days: readonly SlipDay[] | null | undefined, prevId: string, nextId: string): RoutedLegView | null {
  for (const d of days ?? []) {
    for (const l of d.transports ?? []) {
      const from = l.fromActivityId ?? l.from;
      const to = l.toActivityId ?? l.to;
      if (from !== prevId || to !== nextId || !l.routed) continue;
      const mode = normalizeLegMode(l.userSelectedMode ?? l.recommendedMode ?? l.mode ?? null);
      const minutes = Number(l.estimatedDurationMinutes ?? l.durationMin);
      if (!mode || !Number.isFinite(minutes) || minutes <= 0) return null;
      return {
        legId: l.id,
        mode,
        route: { durationMin: minutes, distanceM: Number(l.distanceMeters ?? 0), line: l.routed.line, fare: l.routed.fare, provenance: l.routed.provenance },
      };
    }
  }
  return null;
}

/** The pair the ONE "paused" line sits on: the first two rows of the earliest day that has two. */
export function pausedLinePair(days: readonly SlipDay[] | null | undefined): [string, string] | null {
  const sorted = [...(days ?? [])].sort((a, b) => Number(a.dayNumber ?? a.dayNum ?? 0) - Number(b.dayNumber ?? b.dayNum ?? 0));
  for (const d of sorted) {
    const acts = d.activities ?? [];
    if (acts.length >= 2) return [acts[0].id, acts[1].id];
  }
  return null;
}
