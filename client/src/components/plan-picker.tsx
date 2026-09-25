/**
 * THE ONE "WHICH PLAN?" PICKER (ledger `2026-09-24-rc2-add-to-plan`, audit RC-2).
 *
 * A signed-in member who adds something with no current plan is asked where it goes: one of their
 * ACTIVE plans (`isActivePlan` — the My plans "not Past" rule, never a second date test), or a new
 * plan. The picker only ASKS. It neither binds the pen nor writes the item — the surface that
 * opened it does both, through its own existing add rail, so there is still exactly one add path
 * per surface (§18 rule 1). `PlanPickerList` is the list alone, for a surface that already owns a
 * dialog (the city-feed `AddToExperienceDialog`); `PlanPickerDialog` wraps it for the rest.
 *
 * §13: a failed or unauthorised read says so and never renders as "you have no plans"; an empty
 * list says there are none; "Start a new plan" is offered in every one of those states.
 */
import { MapPin, Plus, Plane } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrips } from "@/hooks/use-trips";
import { toast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePlanning } from "@/contexts/PlanningContext";
import { ADDED_TO_PLAN_TITLE, ADD_TO_PLAN_FAILED_TITLE } from "@/lib/plan-vocabulary";
import { isActivePlan } from "@/lib/add-target";
import { formatShortTripRange } from "@/lib/calendar-date";
import type { TripIdentitySource } from "@/lib/trip-selection";

export type PickablePlan = TripIdentitySource & { finalVersion?: number | null };

export function PlanPickerList({
  onPick,
  onStartNew,
  disabled,
}: {
  onPick: (plan: PickablePlan) => void;
  onStartNew: () => void;
  disabled?: boolean;
}) {
  const { data, isLoading, isError } = useTrips();
  const now = new Date();
  // `useTrips` answers null on a 401 — an unanswered read, not an empty account (§13).
  const unreadable = isError || (!isLoading && data === null);
  const plans = ((data ?? []) as PickablePlan[]).filter((t) => isActivePlan(t, now));

  return (
    <div className="space-y-3" data-testid="plan-picker">
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : unreadable ? (
        <p className="text-sm text-muted-foreground" data-testid="text-plan-picker-unreadable">
          We couldn't load your plans just now. You can still start a new one.
        </p>
      ) : plans.length === 0 ? (
        <div className="text-center py-4" data-testid="text-plan-picker-empty">
          <Plane className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">You have no plans in progress yet.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {plans.map((plan) => {
            const range = plan.startDate || plan.endDate ? formatShortTripRange(plan.startDate, plan.endDate) : "";
            return (
              <button
                key={plan.id}
                type="button"
                className="w-full text-left p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-60"
                onClick={() => onPick(plan)}
                disabled={disabled}
                data-testid={`button-pick-plan-${plan.id}`}
              >
                <p className="font-medium text-sm">{plan.title || plan.destination || "Untitled plan"}</p>
                {(plan.destination || range) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    {plan.destination && (
                      <>
                        <MapPin className="w-3 h-3" />
                        {plan.destination}
                      </>
                    )}
                    {plan.destination && range ? " · " : ""}
                    {range}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onStartNew}
        disabled={disabled}
        data-testid="button-plan-picker-start-new"
      >
        <Plus className="w-4 h-4 mr-2" />
        Start a new plan
      </Button>
    </div>
  );
}

export function PlanPickerDialog({
  open,
  onOpenChange,
  itemName,
  onPick,
  onStartNew,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName?: string | null;
  onPick: (plan: PickablePlan) => void;
  onStartNew: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-plan-picker">
        <DialogHeader>
          <DialogTitle>Which plan?</DialogTitle>
          <DialogDescription>
            {itemName ? `Choose where "${itemName}" goes, or start a new plan for it.` : "Choose a plan, or start a new one."}
          </DialogDescription>
        </DialogHeader>
        <PlanPickerList onPick={onPick} onStartNew={onStartNew} />
      </DialogContent>
    </Dialog>
  );
}

/** Land one item on a plan through the ordinary item rail, and refresh that plan's two reads. */
export async function addItemToPlan(tripId: string, body: Record<string, unknown>): Promise<void> {
  await apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, body);
  queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
  queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
}

/**
 * "Start a new plan" for an item: opens the ONE planning modal (`usePlanning().open`) and, when the
 * finish has produced a plan row, adds the item to it. The door passes NO destination or date — a
 * listing's location is not the traveler's answer to "where" (LD 42 D13) — and it hands the finish
 * straight back (`false`), so every branch keeps its own rail: "Build it myself" still lands on
 * the new plan's slip, where the item then appears. A finish that made no plan (a branch that does
 * not mint, or a refused mint) adds nothing and claims nothing (§13).
 *
 * The write is a plain promise rather than a component mutation on purpose: the finish usually
 * navigates away from the page that opened the picker, and the add must survive that unmount.
 */
export function useStartPlanThenAdd(): (body: Record<string, unknown>) => void {
  const { open } = usePlanning();
  return (body) =>
    open({
      onFinish: (_branch, plan) => {
        if (plan.tripId) {
          const tripId = plan.tripId;
          addItemToPlan(tripId, body).then(
            () => toast({ title: ADDED_TO_PLAN_TITLE, description: "It's on your new plan." }),
            (err: unknown) =>
              toast({
                variant: "destructive",
                title: ADD_TO_PLAN_FAILED_TITLE,
                description: err instanceof Error ? err.message : undefined,
              }),
          );
        }
        return false;
      },
    });
}
