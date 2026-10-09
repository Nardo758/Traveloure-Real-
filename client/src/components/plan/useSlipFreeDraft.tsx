/**
 * THE FREE DRAFT, AS ONE ACTION — shared by the rail's "Draft it with AI" row and the Empty
 * board's draft card (slip conformance, ledger `2026-10-08-conformance-slip-phase0`).
 *
 * Both presses run the SAME call (`runFreeDraft`, the existing generate rail, LD 41 (b)) with the
 * SAME refusal rule (`slipDraftDisabledReason`) and the SAME toasts. So the two doors cannot
 * drift apart while the rail still exists (§18 rule 1).
 *
 * ENTRY RULING (canvas note s12): "Draft … asks for dates when tapped". On a plan whose window
 * nobody chose (`trips.dates_confirmed_at` NULL, LD 30 as amended), the press opens the slip's ONE
 * INLINE dates panel first (`InlineDatesPanel` — Lane E1, ledger `2026-10-08-e1-zero-questions`,
 * ruling 7; decision-maker, Oct 8, 2026 — option 1: the dates dialog is gone, nothing leaves the
 * slip). The draft then runs with the dates the panel SAVED, never the placeholder window the row
 * still held before the refetch. Cancelling the panel drafts nothing.
 *
 * A caller that has ALREADY gated on the dates (the rail row, wrapped in `<DatesGate>`) passes the
 * window it got to `mutate(dates)`, and the draft runs with it at once — one ask, never two.
 * `datesPanel` (renamed from `datesDialog`, Oct 8, 2026) is what the Empty board's card mounts; it holds the
 * inline panel.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { runFreeDraft, type FreeDraftResult } from "@/lib/slip-free-draft";
import { slipDraftDisabledReason } from "@/lib/slip-rail";
import { planDatesAreConfirmed, planDatesGateLine } from "@shared/plan-dates";
import { InlineDatesPanel, type PlanWindow } from "./SlipAnchorPanels";
import { DRAFT_AI_QUERY, DRAFT_AI_VALUE } from "@/lib/plan-landing";

/**
 * E2 ruling 2 / Q1 (a): `?draft=ai` on a plan's URL starts "Draft it with AI" ONCE. Two surfaces mount
 * this hook (the rail and the empty board), so the request is consumed per plan, by whichever mounts
 * first, and the parameter is removed from the address so a reload never drafts twice.
 */
const draftAiConsumed = new Set<string>();

/** Pure: does this query string ask to start the draft? */
export function asksToStartDraft(search: string): boolean {
  return new URLSearchParams(search).get(DRAFT_AI_QUERY) === DRAFT_AI_VALUE;
}

/** The action's name in the gate's line ("Draft it with AI needs your dates…"). */
const DRAFT_ACTION = "Draft it with AI";

export interface FreeDraftTripInput {
  id?: string;
  destination?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  travelers?: number | null;
  datesConfirmed?: boolean | null;
}

export interface SlipFreeDraft {
  /** Start the draft, or ask for dates first when nobody chose them. `dates` = a window already
   *  gated by the caller (`<DatesGate>`): draft with it, ask nothing. */
  mutate: (dates?: PlanWindow) => void;
  isPending: boolean;
  /** Why the draft cannot run at all (no destination), or null. */
  disabledReason: string | null;
  /** True when a press will ask for dates before drafting. */
  asksDatesFirst: boolean;
  /** The inline dates panel (when asking), mounted wherever the caller renders its control. */
  datesPanel: ReactNode;
}

export function useSlipFreeDraft(trip: FreeDraftTripInput, tripId: string): SlipFreeDraft {
  const { toast } = useToast();
  const [asking, setAsking] = useState(false);
  const disabledReason = slipDraftDisabledReason({
    destination: trip.destination,
    startDate: trip.startDate as any,
    endDate: trip.endDate as any,
  });
  const asksDatesFirst = !planDatesAreConfirmed(trip.datesConfirmed ?? null);

  const draft = useMutation<FreeDraftResult, Error, { startDate?: string; endDate?: string } | void>({
    mutationFn: (dates) => runFreeDraft({ ...(trip as any), ...(dates ?? {}) }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/option-sets`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/where-to-stay`] });
      toast({
        title: "Draft added to your plan",
        description:
          result.basisLine ?? "A starting sketch — one version, without live prices. Optimize builds around it.",
      });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Couldn't draft this plan", description: err?.message });
    },
  });

  const datesPanel = asksDatesFirst && asking ? (
    <InlineDatesPanel
      tripId={tripId}
      startDate={trip.startDate as any}
      endDate={trip.endDate as any}
      intro={planDatesGateLine(DRAFT_ACTION)}
      testId="slip-draft-dates-gate"
      onSaved={(saved) => {
        setAsking(false);
        draft.mutate(saved);
      }}
      onCancel={() => setAsking(false)}
    />
  ) : null;

  const start = (dates?: PlanWindow) => {
    if (disabledReason || draft.isPending) return;
    if (dates) draft.mutate(dates);
    else if (asksDatesFirst) setAsking(true);
    else draft.mutate();
  };

  useEffect(() => {
    if (typeof window === "undefined" || disabledReason || draftAiConsumed.has(tripId)) return;
    if (!asksToStartDraft(window.location.search)) return;
    draftAiConsumed.add(tripId);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(DRAFT_AI_QUERY);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // The draft still starts; a reload would only re-read a parameter already consumed this load.
    }
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, disabledReason]);

  return {
    mutate: start,
    isPending: draft.isPending,
    disabledReason,
    asksDatesFirst,
    datesPanel,
  };
}
