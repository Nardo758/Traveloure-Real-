/**
 * THE IN-RUN ROUTE MEMO — not a cache (step 9a, ledger `2026-10-07-step9a-routing-engine`; decision-maker,
 * Oct 7, 2026, on #1325). Google's service terms (June 10, 2026) give no grant to cache Routes durations
 * or distances, so a Google result is NEVER persisted outside the plan's own `transport_legs` rows. This
 * memo lives for ONE run (one Optimize run across its four versions, or one plan recompute) and then is
 * dropped: the same leg asked twice in a run makes one call, and two concurrent asks make one call.
 *
 * It may be SEEDED from the plan's own legs (its engine legs and its latest run's version legs), which is
 * how apply reuses what the run already asked for — reading the plan's own rows, never another plan's.
 * No database import here, by design: nothing in this file can write a route anywhere.
 */
import {
  routeLegKey,
  toRouteFacts,
  type RouteAnswer,
  type RouteOutcome,
  type RoutePoint,
  type RoutingAdapter,
  type RoutingMode,
} from "@shared/routing-engine";

export interface MemoLegResult {
  outcome: RouteOutcome;
  /** The leg key (place ID or 4-decimal point, mode, local hour). */
  legKey: string;
  /** True when the answer came from this run (or the plan's own legs) and no call was made. */
  reused: boolean;
}

export class RouteRunMemo {
  private readonly answers = new Map<string, RouteAnswer>();
  private readonly inFlight = new Map<string, Promise<RouteOutcome>>();

  /** A plan's own leg answer, by its key. Only the plan's own rows may be seeded. */
  seed(key: string, route: RouteAnswer): void {
    if (!this.answers.has(key)) this.answers.set(key, toRouteFacts(route));
  }

  async route(
    input: { origin: RoutePoint; destination: RoutePoint; mode: RoutingMode; departAt: Date | null; hourBucket: number | null },
    adapter: RoutingAdapter,
  ): Promise<MemoLegResult> {
    const key = routeLegKey(input.origin, input.destination, input.mode, input.hourBucket);
    const known = this.answers.get(key);
    if (known) return { outcome: { kind: "ok", route: known }, legKey: key, reused: true };
    const pending = this.inFlight.get(key);
    if (pending) return { outcome: await pending, legKey: key, reused: true };
    const p = adapter.route(input.origin, input.destination, input.mode, input.departAt).then((o) =>
      o.kind === "ok" ? { kind: "ok" as const, route: toRouteFacts(o.route) } : o,
    );
    this.inFlight.set(key, p);
    try {
      const outcome = await p;
      // Paused and failed answers are not remembered, even for the run: the next ask may succeed.
      if (outcome.kind === "ok") this.answers.set(key, outcome.route);
      return { outcome, legKey: key, reused: false };
    } finally {
      this.inFlight.delete(key);
    }
  }
}

export interface FallbackLegResult {
  outcome: RouteOutcome;
  /** The mode the answer is for: the asked mode, or `drive` when transit had no route. */
  mode: RoutingMode;
  /** True when the answer is a drive asked because transit had no route (P0 ruling 2). */
  transitUnavailable: boolean;
  calls: number;
  reused: number;
}

/**
 * P0 legs ruling 2 (ledger `2026-10-10-p0-legs-baseline`): ask the leg in its mode; a TRANSIT ask Google
 * answers with no route is asked ONCE more as a drive, and the caller labels the row. Transit and drive
 * both without a route ⇒ `no_route` (the pair gets no leg — E8). A paused ask stays paused (no fallback
 * call is made under a cap). The ONE fallback, shared by the plan writer and the version legs (§18 rule 1).
 */
export async function routeWithTransitFallback(
  memo: RouteRunMemo,
  adapter: RoutingAdapter,
  input: { origin: RoutePoint; destination: RoutePoint; mode: RoutingMode; departAt: Date | null; hourBucket: number | null },
): Promise<FallbackLegResult> {
  const first = await memo.route(input, adapter);
  const tally = { calls: first.reused ? 0 : 1, reused: first.reused ? 1 : 0 };
  if (first.outcome.kind !== "no_route" || input.mode !== "transit") {
    return { outcome: first.outcome, mode: input.mode, transitUnavailable: false, ...tally };
  }
  const drive = await memo.route({ ...input, mode: "drive" }, adapter);
  return {
    outcome: drive.outcome,
    mode: "drive",
    transitUnavailable: drive.outcome.kind === "ok",
    calls: tally.calls + (drive.reused ? 0 : 1),
    reused: tally.reused + (drive.reused ? 1 : 0),
  };
}
