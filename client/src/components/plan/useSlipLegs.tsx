/**
 * Step 9a (ledger `2026-10-07-step9a-routing-engine`; ruling 1): the hook that feeds SlipView's
 * `renderLegBetween`. Between two rows it draws the routed `LegRow` the server sent for that pair, and
 * nothing when there is none (free plans, unlocated stops, a failed route). When the plan's routing
 * source is paused for the day (L5), ONE line says so, on the plan's first pair; the legs below stay as
 * last computed and nothing is blocked.
 */
import { useCallback, type ReactNode } from "react";
import { LegRow } from "./LegRow";
import { TRAVEL_TIMES_PAUSED_LINE, pausedLinePair, routedLegBetween } from "@/lib/slip-legs";

type SlipLegsData = {
  days?: any[];
  trip?: { timezone?: string | null } | null;
  travelTimesPaused?: boolean;
};

export function useSlipLegs(data: SlipLegsData | null | undefined) {
  const days = data?.days;
  const timeZone = data?.trip?.timezone ?? null;
  const paused = data?.travelTimesPaused === true;
  return useCallback(
    (prev: { id: string }, next: { id: string }, _dayIndex: number): ReactNode | null => {
      const leg = routedLegBetween(days, prev.id, next.id);
      const pair = paused ? pausedLinePair(days) : null;
      const showPaused = !!pair && pair[0] === prev.id && pair[1] === next.id;
      if (!leg && !showPaused) return null;
      return (
        <>
          {showPaused ? (
            <p className="ml-4 px-3 py-1 text-xs text-muted-foreground" data-testid="slip-travel-times-paused">
              {TRAVEL_TIMES_PAUSED_LINE}
            </p>
          ) : null}
          {leg ? <LegRow kind="routed" legId={leg.legId} mode={leg.mode} route={leg.route} timeZone={timeZone} /> : null}
        </>
      );
    },
    [days, timeZone, paused],
  );
}
