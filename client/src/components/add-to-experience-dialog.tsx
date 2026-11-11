import { announceTripAdd } from "@/lib/plan-add-runner";
import { useEffect, useRef } from "react";
import { planSaveRefusalMessage } from "@/lib/plan-save-refusal";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { browseSavesToPlan, useSignupMode } from "@/lib/signup-mode";
import { WAITLIST_COPY } from "@/lib/waitlist-copy";
import { queryClient } from "@/lib/queryClient";
import { useSearch } from "wouter";
import { addItemFit, statedCity } from "@/lib/trip-target";
import { useAddPlanResolution } from "@/hooks/use-open-plans";
import { ADDED_TO_PLAN_TITLE } from "@/lib/plan-vocabulary";
import { planItemRefFromFeedItem } from "@shared/plan-item-ref";
import { refreshSavedRefs } from "@/lib/saved-refs";
import { GUEST_PLAN_COPY } from "@shared/guest-plan-copy";
import { syncActiveTripToContext } from "@/lib/trip-selection";
import { PlanPickerList, useStartPlanThenAdd, type PickablePlan } from "@/components/plan-picker";
import {
  Loader2,
  LogIn,
} from "lucide-react";

interface ExperienceItem {
  /** Stable content id when the feed has one; falls back to a title slug. */
  id?: string;
  city?: string;
  title: string;
  description?: string;
  type: "gem" | "neighborhood" | "hotel" | "activity" | "event" | "recommendation";
  scheduledDate?: string | null;
  /** Row 305: a catalogue result's own listing, kept on the plan item (the add rail re-checks it). */
  providerServiceId?: string;
}

interface AddToExperienceDialogProps {
  item: ExperienceItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddToExperienceDialog({
  item,
  open,
  onOpenChange,
}: AddToExperienceDialogProps) {
  const { isAuthenticated } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();

  // Ledger `2026-10-20-add-plan-open-plans`: `?tripId=` wins; otherwise the picker, even for one open plan
  // (R4b-2: never auto-selected; the traveler's click places it). The tab pen is not a target.
  // No price is sent (§14). The trip-less cart write is gone (RC-2).
  const searchString = useSearch();
  const fit = addItemFit(item);
  const { openPlans, resolution } = useAddPlanResolution(searchString, fit);
  const directTripId = resolution.status === "direct" ? resolution.tripId : "";
  const directFired = useRef("");

  /** The plan-item body a feed item becomes on a chosen plan (dates known) or a new one (not yet). */
  const feedItemBody = (tripStartDate?: string | null, plan?: { destination?: string | null; endDate?: string | null } | null): Record<string, unknown> => {
    // dayNumber is 1-based relative to the plan's start date, when both dates are known.
    let dayNumber = 1;
    if (item?.scheduledDate && tripStartDate) {
      const tripStart = new Date(tripStartDate + "T00:00:00");
      const itemDate = new Date(item.scheduledDate + "T00:00:00");
      const diffDays = Math.round((itemDate.getTime() - tripStart.getTime()) / (1000 * 60 * 60 * 24));
      dayNumber = Math.max(1, diffDays + 1);
    }
    // CAP-2 (ledger `2026-11-05-cap2-plan-item-ref`): a card that names its row sends its PlanItemRef, and the server
    // re-reads that row for the item's name, point and link. A day-filtered feed's day is the chosen day — only when it
    // falls inside the plan's dates; otherwise the item lands on Day 1.
    const inWindow = !!(item?.scheduledDate && tripStartDate && (!plan?.endDate || String(item.scheduledDate) <= String(plan.endDate)));
    const ref = planItemRefFromFeedItem(item, (item as any)?.city || statedCity(plan?.destination).split(",")[0].trim() || null, inWindow ? dayNumber : null);
    // Row 262: no provenance text in notes; the item's source is not written into it.
    return {
      title: item?.title,
      description: item?.description || "",
      itemType: item?.type || "experience",
      dayNumber,
      status: "planned",
      ...(item?.scheduledDate ? { scheduledDate: item.scheduledDate } : {}),
      // Row 305: a catalogue result keeps the listing it names; the add rail re-checks it server-side (the listing gate).
      ...(typeof item?.providerServiceId === "string" ? { providerServiceId: item.providerServiceId } : {}),
      ...(ref ? { ref } : {}),
    };
  };

  const addToTripMutation = useMutation({
    mutationFn: async (plan: PickablePlan) => {
      if (!item) return;
      const res = await fetch(`/api/trips/${plan.id}/itinerary-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(feedItemBody(plan.startDate, plan)),
      });
      // R4b-1: the refusal's body travels in the error so the toast can name an out-of-dates event's day.
      if (!res.ok) throw new Error(`${res.status}: ${await res.text().catch(() => "")}`);
      return res.json();
    },
    onSuccess: (res, plan) => {
      // R4b-3: the row is confirmed — refresh the plan reads "Added ✓" is drawn from.
      void refreshSavedRefs(queryClient);
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${plan.id}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${plan.id}/plancard`] });
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      // Cut-list #1 slice C: the one add toast — "Added to Day {n}." with Undo and Change day.
      if ((res as any)?.id) announceTripAdd(plan.id, res as any, plan as any);
      else
        toast({
          title: ADDED_TO_PLAN_TITLE,
          description: `"${item?.title}" has been added to your itinerary.`,
        });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      // CAP-2 ruling 3: a refused save says the approved sentence, nothing else — R4b-1's dated refusal excepted.
      toast({ title: planSaveRefusalMessage(err) ?? GUEST_PLAN_COPY.saveFailed, variant: "destructive" });
    },
  });

  // RC-2: which plans are offered is the ONE picker's rule (`isActivePlan`, the My plans "not
  // Past" derivation) — this dialog no longer carries its own date filter. Picking a plan binds it
  // as the CURRENT plan (the ruling) and adds the item there.
  const startPlanThenAdd = useStartPlanThenAdd();
  const pickPlan = (plan: PickablePlan) => {
    syncActiveTripToContext(plan);
    addToTripMutation.mutate(plan);
  };
  const startNewPlan = () => {
    onOpenChange(false);
    startPlanThenAdd(feedItemBody(null));
  };

  // A URL trip adds as soon as the dialog opens. Any open-plan list (one or more) stays on the
  // picker below (R4b-2). The ref stops a second render from posting twice.
  useEffect(() => {
    if (!open) {
      directFired.current = "";
      return;
    }
    if (!isAuthenticated || !item || resolution.status !== "direct") return;
    if (directFired.current === resolution.tripId) return;
    directFired.current = resolution.tripId;
    const openPlan = openPlans.find((row) => row.id === resolution.tripId);
    const bound: PickablePlan = openPlan
      ? {
          id: openPlan.id,
          title: openPlan.title,
          destination: openPlan.city,
          startDate: openPlan.startDate,
          endDate: openPlan.endDate,
        }
      : { id: resolution.tripId };
    if (openPlan) syncActiveTripToContext(bound);
    addToTripMutation.mutate(bound);
    // addToTripMutation.mutate is stable; directFired guards a repeat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isAuthenticated, item, resolution, openPlans]);

  // GATE-1 (ledger `2026-11-03-gate1-partner1`): in waitlist mode a signed-out viewer never meets the sign-in wall.
  // The browse cards already turn the press into "Save to plan"; a host that still opens this dialog gets the same
  // toast and the dialog closes, so "Sign In Required" is never drawn in waitlist mode.
  const { mode: signupMode } = useSignupMode();
  const waitlistSave = browseSavesToPlan(signupMode, isAuthenticated);
  // PLAN-2 lane 1: this dialog made the same false claim the heart made — it toasted `Saved to plan`
  // and closed, with nothing written. In waitlist mode a signed-out viewer is not offered the
  // owner-trip dialog at all, and nothing is announced, so nothing is claimed.
  if (waitlistSave) return null;

  if (!isAuthenticated) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md" data-testid="dialog-add-to-experience">
          <DialogHeader>
            <DialogTitle>Sign In Required</DialogTitle>
            <DialogDescription>
              Sign in to add "{item?.title}" to a trip or create an experience.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Button
              className="w-full"
              onClick={() => {
                onOpenChange(false);
                // /auth is not a registered route (guests were 404ing here) —
                // use the app's sign-in modal like every other guest gate.
                openSignInModal();
              }}
            >
              <LogIn className="h-4 w-4 mr-2" />
              Sign In
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-add-to-experience">
        <DialogHeader>
          <DialogTitle>Add to your plan</DialogTitle>
          <DialogDescription>
            Where should "{item?.title}" go?
          </DialogDescription>
        </DialogHeader>

        {resolution.status === "direct" ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2" data-testid="text-adding-to-plan">
            <Loader2 className="w-4 h-4 animate-spin" />
            Adding to your plan…
          </p>
        ) : resolution.status === "pending" ? (
          <p className="text-sm text-muted-foreground" data-testid="text-add-plan-pending">
            Checking your plans…
          </p>
        ) : (
          <PlanPickerList
            onPick={pickPlan}
            onStartNew={startNewPlan}
            disabled={addToTripMutation.isPending}
            item={fit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
