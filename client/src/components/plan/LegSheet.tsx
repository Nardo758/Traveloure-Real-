/**
 * `LegSheet` — a routed leg's sheet on the slip (step 9c D1–D4, ledger `2026-10-07-step9c-leg-options`).
 * Opened by tapping a routed `LegRow`. It shows the leg's mode options (≤3, current first, D2), asked from
 * the server the first time it opens — ≤2 Maps calls, stored on the leg's own row (D1); a re-open is
 * free. Picking one goes through the EXISTING leg PATCH (D3). The owner's two booking actions (D4) are
 * the existing rails: "Find a driver" = the `private_transportation` browse (a provider booking on the
 * existing band) and "Book this for me" = the ONE handoff chooser scoped to the leg's two end items.
 * No price anywhere but the source's own fare beside an option (L6, R-h). `ItemSheet` stays the stop sheet.
 */
import { InlineDatesPanel, datesGateBlocks } from "./SlipAnchorPanels";
import { planDatesGateLine } from "@shared/plan-dates";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { openHandoffChooser } from "@/lib/handoff-client";
import { servicesBrowseHref } from "@/lib/services-browse";
import {
  LEG_HOST_PICKUP_LINE,
  LEG_MODE_LABEL,
  LEG_OPTIONS_PAUSED_LINE,
  LEG_OPTIONS_UNAVAILABLE_LINE,
  legHandoffItemIds,
  legPatchMode,
  legSheetActions,
} from "@/lib/leg-sheet";
import { routedLegLine } from "@shared/routing-engine";
import type { LegOptionView } from "@shared/leg-options";

export interface LegSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  legId: string;
  fromId: string;
  toId: string;
  title: string;
  options: LegOptionView[];
  optionsChecked: boolean;
  timeZone: string | null;
  canEditItems: boolean;
  isOwner: boolean;
  hostPickupConfirmed?: boolean;
  /** Lane E1 (ruling 7): the plan's window and whether anybody chose it. A placeholder window asks for
   *  dates INLINE before the options are asked; once saved, they are asked. Absent ⇒ no gate. */
  planWindow?: { startDate?: string | null; endDate?: string | null; datesConfirmed?: boolean } | null;
}

export function LegSheet(props: LegSheetProps) {
  const { tripId, legId } = props;
  const [asked, setAsked] = useState<{ options: LegOptionView[]; paused: boolean } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const actions = legSheetActions({ canEditItems: props.canEditItems, isOwner: props.isOwner, hostPickupConfirmed: props.hostPickupConfirmed === true });

  const ask = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/trips/${tripId}/transport-legs/${legId}/options`)).json(),
    onSuccess: (r: { options: LegOptionView[]; paused?: boolean }) => {
      setAsked({ options: r.options ?? [], paused: r.paused === true });
      if (!r.paused) void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
    },
    onError: () => setUnavailable(true),
  });
  // Lane E1: no confirmed dates ⇒ the options wait for the inline dates panel (no departure instant to ask
  // against); setting the dates lifts the gate and the options are asked as on any first open.
  const [datesSet, setDatesSet] = useState(false);
  const needsDates = datesGateBlocks(props.planWindow?.datesConfirmed) && !datesSet;
  // D1: asked on the FIRST open only, and only by someone who may change the leg.
  useEffect(() => {
    if (props.open && !needsDates && !props.optionsChecked && actions.canPick && !asked && !ask.isPending && !unavailable) ask.mutate();
  }, [props.open, needsDates, props.optionsChecked, actions.canPick, asked, ask, unavailable]);

  const pick = useMutation({
    mutationFn: async (mode: LegOptionView["mode"]) =>
      (await apiRequest("PATCH", `/api/trips/${tripId}/transport-legs/${legId}`, { userSelectedMode: legPatchMode(mode) })).json(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      props.onOpenChange(false);
    },
  });

  const options = asked?.options?.length ? asked.options : props.options;
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto sm:max-w-lg sm:mx-auto" data-testid={`leg-sheet-${legId}`}>
        <SheetHeader>
          <SheetTitle>{props.title}</SheetTitle>
          <SheetDescription>How to get there</SheetDescription>
        </SheetHeader>
        {needsDates && actions.canPick ? (
          <InlineDatesPanel
            tripId={tripId}
            startDate={props.planWindow?.startDate ?? null}
            endDate={props.planWindow?.endDate ?? null}
            intro={planDatesGateLine("Travel options")}
            testId="leg-sheet-dates-gate"
            onSaved={() => setDatesSet(true)}
          />
        ) : null}
        <LegSheetBody
          legId={legId}
          options={options}
          timeZone={props.timeZone}
          actions={actions}
          picking={pick.isPending}
          onPick={(m) => pick.mutate(m)}
          asking={ask.isPending}
          paused={asked?.paused === true}
          unavailable={unavailable}
          findDriverHref={servicesBrowseHref("private_transportation", tripId)}
          onBookForMe={() => {
            props.onOpenChange(false);
            openHandoffChooser({ kind: "book", itemIds: legHandoffItemIds(props.fromId, props.toId) });
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

/** The sheet's content — separate so it renders without the portal (tests, and any other mount). */
export function LegSheetBody(props: {
  legId: string;
  options: LegOptionView[];
  timeZone: string | null;
  actions: ReturnType<typeof legSheetActions>;
  picking: boolean;
  onPick: (mode: LegOptionView["mode"]) => void;
  asking: boolean;
  paused: boolean;
  unavailable: boolean;
  findDriverHref: string;
  onBookForMe: () => void;
}) {
  const { legId, options } = props;
  return (
    <div className="mt-3 space-y-3">
      {props.actions.showHostPickup ? (
        <p className="text-sm" data-testid={`leg-sheet-host-pickup-${legId}`}>
          {LEG_HOST_PICKUP_LINE}
        </p>
      ) : null}
      <ul className="space-y-1.5" data-testid={`leg-sheet-options-${legId}`}>
        {options.map((o) => (
          <li key={o.mode} className="flex items-center justify-between gap-2 rounded border border-border px-3 py-2" data-testid={`leg-sheet-option-${legId}-${o.mode}`}>
            <span className="text-sm">
              <span className="font-medium">{LEG_MODE_LABEL[o.mode]}</span>{" "}
              <span className="text-muted-foreground">{routedLegLine({ mode: o.mode, route: o.route }, props.timeZone)}</span>
            </span>
            {o.current ? (
              <span className="text-xs text-muted-foreground" data-testid={`leg-sheet-option-current-${legId}`}>
                Current
              </span>
            ) : props.actions.canPick ? (
              <Button size="sm" variant="outline" disabled={props.picking} onClick={() => props.onPick(o.mode)} data-testid={`leg-sheet-pick-${legId}-${o.mode}`}>
                Use this
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {props.asking ? <p className="text-xs text-muted-foreground">Checking other ways to get there…</p> : null}
      {props.paused ? (
        <p className="text-xs text-muted-foreground" data-testid={`leg-sheet-paused-${legId}`}>
          {LEG_OPTIONS_PAUSED_LINE}
        </p>
      ) : null}
      {props.unavailable ? (
        <p className="text-xs text-muted-foreground" data-testid={`leg-sheet-unavailable-${legId}`}>
          {LEG_OPTIONS_UNAVAILABLE_LINE}
        </p>
      ) : null}
      {props.actions.showBook ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild size="sm" variant="outline">
            <Link href={props.findDriverHref} data-testid={`leg-sheet-find-driver-${legId}`}>
              Find a driver
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={props.onBookForMe}
            data-testid={`leg-sheet-book-for-me-${legId}`}
          >
            Book this for me
          </Button>
        </div>
      ) : null}
    </div>
  );
}
