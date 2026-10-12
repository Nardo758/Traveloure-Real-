/**
 * Step 9a (ledger `2026-10-07-step9a-routing-engine`; ruling 1): the hook that feeds SlipView's
 * `renderLegBetween`. Between two rows it draws the routed `LegRow` the server sent for that pair, and
 * nothing when there is none (free plans, unlocated stops, a failed route). When the plan's routing
 * source is paused for the day (L5), ONE line says so, on the plan's first pair; the legs below stay as
 * last computed and nothing is blocked.
 *
 * Step 9c (ledger `2026-10-07-step9c-leg-options`): a routed leg opens its `LegSheet` for whoever may
 * change the plan's items (D3; the owner alone books — D4); a shown leg with no routed facts draws as a
 * minutes-only line (D5), so the day-end list can retire (FU-9C-1).
 *
 * TC-3c (ledger `2026-10-11-tc3c-better-way-line`): under a routed leg, the server's "A better way there" ride swap
 * for that pair, when it sent one (`RideSwapLine`).
 */
import { useCallback, useState, type ReactNode } from "react";
import { LegRow } from "./LegRow";
import { LegSheet } from "./LegSheet";
import { TRAVEL_TIMES_PAUSED_LINE, bridgeLabelFor, pausedLinePair, slipLegBetween, type SlipLegView } from "@/lib/slip-legs";
import { canEditPlanItems, slipViewer } from "@/lib/slip-viewer-role";
import { rideSuggestionFor } from "@/lib/ride-suggestions";
import { RideSwapLine } from "./RideSwapLine";

type SlipLegsData = {
  days?: any[];
  trip?: { timezone?: string | null; startDate?: string | null; endDate?: string | null; datesConfirmed?: boolean } | null;
  travelTimesPaused?: boolean;
  tripRole?: string | null;
};

type OpenLeg = Extract<SlipLegView, { kind: "routed" }> & { title: string };

export function useSlipLegs(data: SlipLegsData | null | undefined, tripId?: string | null) {
  const days = data?.days;
  const timeZone = data?.trip?.timezone ?? null;
  const paused = data?.travelTimesPaused === true;
  const viewer = slipViewer(data?.tripRole);
  const canEditItems = canEditPlanItems(viewer);
  const [openLeg, setOpenLeg] = useState<OpenLeg | null>(null);
  const render = useCallback(
    (prev: { id: string; title?: string; name?: string }, next: { id: string; title?: string; name?: string }, _dayIndex: number): ReactNode | null => {
      const leg = slipLegBetween(days, prev.id, next.id);
      // TC-3c: the server's ride swap for this exact pair (owner-only there), drawn under its routed leg.
      const ride = leg?.kind === "routed" && tripId ? rideSuggestionFor(days, prev.id, next.id) : null;
      const pair = paused ? pausedLinePair(days) : null;
      const showPaused = !!pair && pair[0] === prev.id && pair[1] === next.id;
      if (!leg && !showPaused) return null;
      // P0-d item 2 (ledger `2026-10-12-p0d-coverage-bridges`): a bridge names its own endpoints and the
      // stops it goes round — the ONE formatter, the same words the Trip Card draws.
      const bridgeRows = leg?.bridge ? (days ?? []).find((d: any) => (d.activities ?? []).some((a: any) => a.id === next.id))?.activities ?? [] : [];
      const bridgeLabel = leg?.bridge ? bridgeLabelFor(bridgeRows, leg.bridge, next.id) : null;
      const title = bridgeLabel || [prev.title ?? prev.name, next.title ?? next.name].filter(Boolean).join(" → ") || "This leg";
      return (
        <>
          {bridgeLabel ? (
            <p className="ml-4 px-3 pt-1 text-xs font-medium text-muted-foreground" data-testid={`slip-leg-bridge-${leg!.legId}`}>
              {bridgeLabel}
            </p>
          ) : null}
          {showPaused ? (
            <p className="ml-4 px-3 py-1 text-xs text-muted-foreground" data-testid="slip-travel-times-paused">
              {TRAVEL_TIMES_PAUSED_LINE}
            </p>
          ) : null}
          {leg?.kind === "routed" ? (
            <LegRow
              kind="routed"
              legId={leg.legId}
              mode={leg.mode}
              route={leg.route}
              transitUnavailable={leg.transitUnavailable === true}
              timeZone={timeZone}
              onOpen={tripId && canEditItems ? () => setOpenLeg({ ...leg, title }) : null}
            />
          ) : null}
          {ride && tripId ? <RideSwapLine tripId={tripId} suggestion={ride} isOwner={viewer === "owner"} /> : null}
          {leg?.kind === "unrouted" ? <LegRow kind="unrouted" legId={leg.legId} mode={leg.mode} minutes={leg.minutes} /> : null}
        </>
      );
    },
    [days, timeZone, paused, tripId, canEditItems, viewer],
  );
  // The ONE sheet for the slip's legs, kept in step with the latest payload while open.
  const live = openLeg ? slipLegBetween(days, openLeg.fromId, openLeg.toId) : null;
  const sheetLeg = live?.kind === "routed" ? { ...live, title: openLeg!.title } : openLeg;
  const sheet =
    tripId && sheetLeg ? (
      <LegSheet
        open={!!openLeg}
        onOpenChange={(o) => {
          if (!o) setOpenLeg(null);
        }}
        tripId={tripId}
        legId={sheetLeg.legId}
        fromId={sheetLeg.fromId}
        toId={sheetLeg.toId}
        title={sheetLeg.title}
        options={sheetLeg.options}
        optionsChecked={sheetLeg.optionsChecked}
        timeZone={timeZone}
        canEditItems={canEditItems}
        isOwner={viewer === "owner"}
        hostPickupConfirmed={sheetLeg.hostPickupConfirmed}
        planWindow={data?.trip ?? null}
      />
    ) : null;
  return Object.assign(render, { sheet });
}
