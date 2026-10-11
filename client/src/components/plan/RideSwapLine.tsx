/**
 * TC-3c — "A better way there" under a slip leg, and its swap card (ledger `2026-10-11-tc3c-better-way-line`).
 * Draws ONLY the suggestion the server sent for this pair (`days[].rideSuggestions`, TC-3b; owner-only there).
 * Swap puts the catalog ride on the plan through the existing ride route (`POST /api/trips/:tripId/rides`, born
 * locked, supersedes the leg — LD 68); "Not this time" is the owner-only dismiss, which closes the corridor for the
 * trip. Both refresh the plan card, which is the only source of what is drawn. Every sentence: lib/ride-suggestions.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  RIDE_RETURN_PAIR_LINE,
  RIDE_SWAP_CTA,
  RIDE_SWAP_DISMISS,
  RIDE_SWAP_DISMISS_NOTE,
  RIDE_SWAP_LINE,
  RIDE_SWAP_OWNER_ONLY,
  rideExtraMinutesLine,
  rideFareLine,
  rideInsertBodyFor,
  rideSwapSteps,
  rideSwapSummary,
  type RideSuggestionView,
} from "@/lib/ride-suggestions";

export function RideSwapLine(props: { tripId: string; suggestion: RideSuggestionView; isOwner: boolean }) {
  const { tripId, suggestion: s, isOwner } = props;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
    setOpen(false);
  };
  const swap = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/trips/${tripId}/rides`, rideInsertBodyFor(s))).json(),
    onSuccess: done,
    onError: () => setError("That departure isn't available any more. Refresh the plan to see what is."),
  });
  const dismiss = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", `/api/trips/${tripId}/ride-suggestions/dismiss`, { fromItemId: s.fromItemId, toItemId: s.toItemId, serviceId: s.serviceId })).json(),
    onSuccess: done,
    onError: () => setError("Couldn't dismiss it. Try again."),
  });
  const extra = rideExtraMinutesLine(s.extraMinutes);
  const fare = rideFareLine(s.fare);
  return (
    <>
      <button
        type="button"
        className="ml-4 block px-3 py-1 text-left text-xs font-medium text-[color:var(--coral-text)] hover:underline"
        data-testid={`ride-swap-line-${s.corridorKey}`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {rideSwapSummary(s)}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto sm:max-w-lg sm:mx-auto" data-testid={`ride-swap-card-${s.corridorKey}`}>
          <SheetHeader>
            <SheetTitle>{RIDE_SWAP_LINE}</SheetTitle>
            <SheetDescription>{s.title}</SheetDescription>
          </SheetHeader>
          <ol className="mt-4 space-y-2 text-sm">
            {rideSwapSteps(s).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {extra || fare ? (
            <p className="mt-3 text-sm text-muted-foreground" data-testid="ride-swap-cost">
              {[extra, fare].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {s.returnPair ? <p className="mt-2 text-sm text-muted-foreground">{RIDE_RETURN_PAIR_LINE}</p> : null}
          {error ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {isOwner ? (
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => swap.mutate()} disabled={swap.isPending || dismiss.isPending} data-testid="ride-swap-confirm">
                {RIDE_SWAP_CTA}
              </Button>
              <Button variant="outline" onClick={() => dismiss.mutate()} disabled={swap.isPending || dismiss.isPending} data-testid="ride-swap-dismiss">
                {RIDE_SWAP_DISMISS}
              </Button>
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">{RIDE_SWAP_OWNER_ONLY}</p>
          )}
          {isOwner ? <p className="mt-2 text-xs text-muted-foreground">{RIDE_SWAP_DISMISS_NOTE}</p> : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
