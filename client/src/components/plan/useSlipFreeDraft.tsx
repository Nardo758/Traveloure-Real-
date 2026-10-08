/**
 * THE FREE DRAFT, AS ONE ACTION — shared by the rail's "Draft it with AI" row and the Empty
 * board's draft card (slip conformance, ledger `2026-10-08-conformance-slip-phase0`).
 *
 * Both presses run the SAME call (`runFreeDraft`, the existing generate rail, LD 41 (b)) with the
 * SAME refusal rule (`slipDraftDisabledReason`) and the SAME toasts. So the two doors cannot
 * drift apart while the rail still exists (§18 rule 1).
 *
 * ENTRY RULING (canvas note s12): "Draft … asks for dates when tapped". On a plan whose window
 * nobody chose (`trips.dates_confirmed_at` NULL, LD 30 as amended), the press opens the ONE dates
 * dialog first. The draft then runs with the dates the dialog SAVED, never the placeholder window
 * the row still held before the refetch. Closing the dialog without saving drafts nothing.
 */
import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { runFreeDraft, type FreeDraftResult } from "@/lib/slip-free-draft";
import { slipDraftDisabledReason } from "@/lib/slip-rail";
import { planDatesAreConfirmed, PLAN_DATES_PLACEHOLDER_NOTE } from "@shared/plan-dates";
import { PlanDatesDialog } from "@/components/plancard/SetPlanDates";

/** The dates dialog's title when the draft asks for them first. */
export const DRAFT_ASKS_DATES_TITLE = "Set your dates to draft";

export interface FreeDraftTripInput {
  id?: string;
  destination?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  travelers?: number | null;
  datesConfirmed?: boolean | null;
}

export interface SlipFreeDraft {
  /** Start the draft, or ask for dates first when nobody chose them. */
  mutate: () => void;
  isPending: boolean;
  /** Why the draft cannot run at all (no destination), or null. */
  disabledReason: string | null;
  /** True when a press will ask for dates before drafting. */
  asksDatesFirst: boolean;
  /** The dates dialog, mounted wherever the caller renders its control. */
  datesDialog: ReactNode;
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

  const datesDialog = asksDatesFirst ? (
    <PlanDatesDialog
      tripId={tripId}
      startDate={trip.startDate as any}
      endDate={trip.endDate as any}
      open={asking}
      onOpenChange={setAsking}
      title={DRAFT_ASKS_DATES_TITLE}
      note={PLAN_DATES_PLACEHOLDER_NOTE}
      onSaved={(saved) => draft.mutate(saved)}
    />
  ) : null;

  return {
    mutate: () => {
      if (disabledReason || draft.isPending) return;
      if (asksDatesFirst) setAsking(true);
      else draft.mutate();
    },
    isPending: draft.isPending,
    disabledReason,
    asksDatesFirst,
    datesDialog,
  };
}
