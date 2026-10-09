/**
 * THE EDIT TRIGGER — a 2 s server-side debounce per plan (step 9a ruling 10, ledger
 * `2026-10-07-step9a-routing-engine`; brief L3 b). Every path that changes a plan's items calls
 * `enqueuePlanLegRecompute(tripId)`; 2 s after the LAST change the engine recomputes from a pair diff,
 * so only changed legs are asked for, and a timer lost with its instance heals on the next edit (or at
 * the T-3 re-check, 9b) — the diff finds whatever is missing. Never on page load.
 *
 * Cheap on free plans and with the engine off: the switch is read before anything is scheduled, and the
 * plan check runs once per debounced burst inside the engine. Never throws into the caller (§15b): a
 * failed recompute is logged and the edit stands. This module imports nothing heavy at load (storage
 * calls it), and loads the engine lazily when a timer fires.
 */
import { travelTimeServiceEnabled } from "../../config/travel-time.config";
import { PLAN_LEG_DEBOUNCE_MS } from "@shared/plan-routed-legs";

export { PLAN_LEG_DEBOUNCE_MS };

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const running = new Map<string, Promise<unknown>>();

export function enqueuePlanLegRecompute(tripId: string | null | undefined): void {
  if (!tripId || !travelTimeServiceEnabled()) return;
  const prior = timers.get(tripId);
  if (prior) clearTimeout(prior);
  const t = setTimeout(() => {
    timers.delete(tripId);
    void runNow(tripId);
  }, PLAN_LEG_DEBOUNCE_MS);
  if (typeof (t as any).unref === "function") (t as any).unref();
  timers.set(tripId, t);
}

/** Run the recompute now, after any run already in flight for this plan (one at a time per plan). */
export function runNow(tripId: string): Promise<unknown> {
  const before = running.get(tripId) ?? Promise.resolve();
  const next = before
    .catch(() => undefined)
    .then(async () => {
      const { computePlanLegs } = await import("./plan-legs-engine.service");
      const legs = await computePlanLegs(tripId);
      // S1 (ledger `2026-10-09-s1-one-stay`, ruling 3): after the debounced recompute, re-pick the plan's
      // stay — it re-scores only when the stops changed (`stopsHash`) and only on a routed plan.
      const { scheduleStayPick } = await import("../stay-pick.service");
      void scheduleStayPick(tripId);
      return legs;
    })
    .catch((err: any) => {
      console.error(`[routing] leg recompute failed for ${tripId}:`, err?.message ?? err);
      return null;
    })
    .finally(() => {
      if (running.get(tripId) === next) running.delete(tripId);
    });
  running.set(tripId, next);
  return next;
}

/** Tests: is a recompute scheduled for this plan? */
export function hasPendingPlanLegRecompute(tripId: string): boolean {
  return timers.has(tripId);
}
