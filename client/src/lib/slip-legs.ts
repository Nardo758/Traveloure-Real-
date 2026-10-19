/**
 * Step 9a — which routed leg sits between two slip rows (ledger `2026-10-07-step9a-routing-engine`;
 * spec §3 LegRow, ruling 1). Pure: reads the plancard's `days[].transports`, where the server put ONLY
 * the legs this plan may show (`selectPlanLegs` — engine legs on a routed plan, an expert's confirmed
 * leg winning per pair). A leg is drawn between rows only when it carries the engine's `routed` facts;
 * anything else draws nothing here (the day-end list keeps it until 9c).
 *
 * Step 9c D5 (ledger `2026-10-07-step9c-leg-options`): `slipLegBetween` also answers a shown leg that
 * carries NO routed facts (an expert's confirmed leg on a free plan) as a minutes-only line, so the
 * day-end `LogisticsRow` list is retired (FU-9C-1) without any leg losing its render.
 */
import { PLAN_LEG_REFETCH_DELAY_MS } from "@shared/plan-routed-legs";
import { STRAIGHT_LINE_EST_SOURCE, type RouteAnswer, type RoutingMode } from "@shared/routing-engine";
import { normalizeLegMode } from "@shared/travel-speeds";
import type { LegOptionView } from "@shared/leg-options";

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
  alternativeModes?: Array<{ reason?: string | null }> | null;
  routed?: { line: string | null; fare: { amount: number; currency: string } | null; provenance: { source: string; checkedAt: string }; transitUnavailable?: true; transitApiUncovered?: true };
  routedOptions?: LegOptionView[];
  routedOptionsChecked?: true;
  /** Step 9c D8: set only once a provider-confirmed host pickup exists (no column yet — never today). */
  hostPickupConfirmed?: boolean;
};
type SlipDay = {
  dayNumber?: number;
  dayNum?: number;
  activities?: Array<{ id: string; name?: string | null; title?: string | null }>;
  transports?: SlipLeg[];
  /** LG-2 Ask 6: adjacent pairs whose leg has no travel time (a stop with no open point), from the server. */
  legsNotChecked?: Array<{ fromActivityId: string; toActivityId: string }>;
};

/** LG-2 Ask 6 (decision-maker, Oct 19, 2026): the line a leg with no travel time reads — never a guessed time. */
export const TRAVEL_TIME_NOT_CHECKED_LINE = "Travel time not checked yet";

export interface RoutedLegView {
  legId: string;
  mode: RoutingMode;
  /**
   * The route's facts. `transitApiUncovered` (P0-b item 8) rides on the route so the row reads its
   * ruled line wherever the route is drawn: a drive standing in for transit the API cannot answer.
   */
  route: RouteAnswer & { transitApiUncovered?: true };
  /** P0 ruling 2: a drive shown because transit had no route — the row says so. */
  transitUnavailable?: true;
}

/** Step 9c: what sits between two slip rows — a routed leg (with its options), or a minutes-only one. */
export type SlipLegView =
  | (RoutedLegView & {
      kind: "routed";
      fromId: string;
      toId: string;
      options: LegOptionView[];
      optionsChecked: boolean;
      hostPickupConfirmed: boolean;
    })
  | { kind: "unrouted"; legId: string; mode: RoutingMode | null; minutes: number; estimate?: true }
  /** LG-2 Ask 6: the leg between these two adjacent stops exists with no time — a stop has no open point. */
  | { kind: "not_checked"; fromId: string; toId: string };

export function slipLegBetween(days: readonly SlipDay[] | null | undefined, prevId: string, nextId: string): SlipLegView | null {
  const exact = legForPair(days, prevId, nextId);
  if (exact !== undefined) return exact;
  // LG-2 Ask 6 (decision-maker, Oct 19, 2026; supersedes P0 ruling 1's bridge): a leg connects ADJACENT stops only.
  // With no leg for this pair, the server says when a stop has no open point — then the leg exists with no time.
  // Nothing is drawn from an earlier row around the gap.
  for (const d of days ?? []) {
    if ((d.legsNotChecked ?? []).some((p) => p.fromActivityId === prevId && p.toActivityId === nextId)) {
      return { kind: "not_checked", fromId: prevId, toId: nextId };
    }
  }
  return null;
}

/**
 * The ONE "From → To" formatter for a leg (P0-e addition 5b): "Fushimi Inari → Tofuku-ji". A name that is not known is
 * left out, never guessed (§13). `aroundNames` is kept for its callers; since LG-2 Ask 6 no leg goes round a stop, so
 * every caller passes none.
 */
export function bridgeLegLabel(fromName: string | null | undefined, toName: string | null | undefined, aroundNames: ReadonlyArray<string | null | undefined>): string {
  const ends = [fromName, toName].map((x) => (x ?? "").trim()).filter(Boolean).join(" → ");
  const around = aroundNames.map((x) => (x ?? "").trim()).filter(Boolean);
  return around.length ? `${ends} · around ${around.join(", ")}` : ends;
}

/** The leg shown for exactly this pair; `undefined` when the plan shows none for it. */
function legForPair(days: readonly SlipDay[] | null | undefined, prevId: string, nextId: string): SlipLegView | null | undefined {
  for (const d of days ?? []) {
    for (const l of d.transports ?? []) {
      const from = l.fromActivityId ?? l.from;
      const to = l.toActivityId ?? l.to;
      if (from !== prevId || to !== nextId) continue;
      if (l.routed) {
        const r = routedLegBetween([{ transports: [l] }], prevId, nextId);
        if (!r) return null;
        return {
          ...r,
          kind: "routed",
          fromId: prevId,
          toId: nextId,
          options: l.routedOptions?.length ? l.routedOptions : [{ mode: r.mode, route: r.route, current: true }],
          optionsChecked: l.routedOptionsChecked === true,
          hostPickupConfirmed: l.hostPickupConfirmed === true,
        };
      }
      const minutes = Number(l.estimatedDurationMinutes ?? l.durationMin);
      if (!Number.isFinite(minutes) || minutes <= 0) return null;
      // 9b-d: the engine's straight-line stand-in for a pair the router says has no route reads "est.".
      const estimate = Array.isArray(l.alternativeModes) && l.alternativeModes[0]?.reason === STRAIGHT_LINE_EST_SOURCE;
      return { kind: "unrouted", legId: l.id, mode: normalizeLegMode(l.userSelectedMode ?? l.recommendedMode ?? l.mode ?? null), minutes: Math.round(minutes), ...(estimate ? { estimate: true as const } : {}) };
    }
  }
  return undefined;
}

/**
 * "18 min · walk" — a shown leg with no routed facts (an expert's own minutes): no source line, no fare.
 * 9b-d: the engine's straight-line stand-in for a no-route pair says so — "18 min · drive · est.".
 */
export function unroutedLegLine(mode: RoutingMode | null, minutes: number, estimate = false): string {
  const base = mode ? `${minutes} min · ${mode}` : `${minutes} min`;
  return estimate ? `${base} · est.` : base;
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
        route: {
          durationMin: minutes,
          distanceM: Number(l.distanceMeters ?? 0),
          line: l.routed.line,
          fare: l.routed.fare,
          provenance: l.routed.provenance,
          ...(l.routed.transitApiUncovered ? { transitApiUncovered: true as const } : {}),
        },
        ...(l.routed.transitUnavailable ? { transitUnavailable: true as const } : {}),
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

/**
 * Step 9b D8 (FU-9A-4, ledger `2026-10-07-step9b-optimizer-and-rechecks`): the server recomputes an
 * edited plan's legs ~2 s after the write, so the slip re-reads the plan ONCE after that window — only
 * for a plan whose payload says the engine routes it (`routedLegs`). Pure: the delay, or null for none.
 * No server "pending" flag is read: it would live in one instance's memory and be wrong on another.
 */
export function legRefetchDelayMs(plan: { routedLegs?: boolean } | null | undefined): number | null {
  return plan?.routedLegs === true ? PLAN_LEG_REFETCH_DELAY_MS : null;
}
