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
import { queryClient } from "@/lib/queryClient";
import { useSearch } from "wouter";
import { useTripContext } from "@/lib/trip-context";
import { resolveTargetTripId } from "@/lib/trip-target";
import { ADDED_TO_PLAN_TITLE } from "@/lib/plan-vocabulary";
import { syncActiveTripToContext } from "@/lib/trip-selection";
import { PlanPickerList, useStartPlanThenAdd, type PickablePlan } from "@/components/plan-picker";
import {
  Plus,
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
  const { user, isAuthenticated } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();

  // ── SLIP CONVERGENCE (ledger 2026-09-03-slip-convergence) ──────────────────────────────────
  // This dialog carried BOTH rails: the primary button wrote straight to /api/cart, while the
  // per-trip buttons below already used the itinerary rail. A cart row born here has
  // `itinerary_item_id IS NULL`, which `syncItemProjection` is permanently blind to — so the
  // primary action put feed content somewhere the traveler's own plan could never show it, while
  // the secondary action put identical content where it could. Two rails, one intent, opposite
  // outcomes. The primary now converges on the SAME itinerary rail whenever a target trip
  // resolves ("URL first, then the active TripContext" — client/src/lib/trip-target.ts, §18
  // rule 1). No price is sent on either rail (§14). SUPERSEDED IN PART by RC-2 (ledger
  // `2026-09-24-rc2-add-to-plan`): the trip-less cart fallback is gone — a signed-in member with
  // no plan in hand picks one or starts one, and a guest meets the sign-in gate below.
  const searchString = useSearch();
  const [tripCtx] = useTripContext();
  const targetTripId = resolveTargetTripId(searchString, tripCtx);

  const addToCartMutation = useMutation({
    mutationFn: async () => {
      // RC-2 (ledger 2026-09-24-rc2-add-to-plan): the trip-less `POST /api/cart` write that lived
      // here is DELETED (§18c). This button renders only when a plan is in hand; with none, the
      // member picks a plan or starts one — nothing lands in a trip-less cart.
      if (!item || !targetTripId) return;
      // Same payload shape the per-plan rail below builds — one rail, one body.
      const res = await fetch(`/api/trips/${targetTripId}/itinerary-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: item.title,
          description: item.description || "",
          itemType: item.type || "experience",
          dayNumber: 1,
          status: "planned",
          ...(item.city ? { locationName: item.city } : {}),
          ...(item.scheduledDate ? { scheduledDate: item.scheduledDate } : {}),
        }),
      });
      if (!res.ok) throw new Error("Failed to add to your plan");
      return res.json();
    },
    onSuccess: () => {
      if (targetTripId) {
        queryClient.invalidateQueries({ queryKey: [`/api/trips/${targetTripId}/itinerary-items`] });
        queryClient.invalidateQueries({ queryKey: [`/api/trips/${targetTripId}/plancard`] });
      }
      toast({
        title: ADDED_TO_PLAN_TITLE,
        description: `"${item?.title}" is on your plan — check out whenever you're ready.`,
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Could not add to your plan",
        description: "Please try again.",
      });
    },
  });

  /** The plan-item body a feed item becomes on a chosen plan (dates known) or a new one (not yet). */
  const feedItemBody = (tripStartDate?: string | null): Record<string, unknown> => {
    // dayNumber is 1-based relative to the plan's start date, when both dates are known.
    let dayNumber = 1;
    if (item?.scheduledDate && tripStartDate) {
      const tripStart = new Date(tripStartDate + "T00:00:00");
      const itemDate = new Date(item.scheduledDate + "T00:00:00");
      const diffDays = Math.round((itemDate.getTime() - tripStart.getTime()) / (1000 * 60 * 60 * 24));
      dayNumber = Math.max(1, diffDays + 1);
    }
    return {
      title: item?.title,
      description: item?.description || "",
      itemType: item?.type || "experience",
      dayNumber,
      status: "planned",
      notes: `Added from ${item?.city || "destination"}`,
      ...(item?.scheduledDate ? { scheduledDate: item.scheduledDate } : {}),
    };
  };

  const addToTripMutation = useMutation({
    mutationFn: async (plan: PickablePlan) => {
      if (!item) return;
      const res = await fetch(`/api/trips/${plan.id}/itinerary-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(feedItemBody(plan.startDate)),
      });
      if (!res.ok) throw new Error("Failed to add item");
      return res.json();
    },
    onSuccess: (_res, plan) => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${plan.id}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${plan.id}/plancard`] });
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({
        title: ADDED_TO_PLAN_TITLE,
        description: `"${item?.title}" has been added to your itinerary.`,
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Failed to add",
        description: "Could not add this item. Please try again.",
        variant: "destructive",
      });
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

        {/* Primary, only when a plan is in hand: straight onto that plan. With none, the ONE
            plan picker below is the whole dialog (RC-2) — pick a plan or start one. */}
        {targetTripId && (
        <button
          type="button"
          onClick={() => addToCartMutation.mutate()}
          disabled={addToCartMutation.isPending}
          className="w-full flex items-center gap-3 p-4 rounded-lg border-2 border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors text-left"
          data-testid="button-add-content-to-cart"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            {addToCartMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            ) : (
              <Plus className="w-5 h-5 text-primary" />
            )}
          </div>
          <div>
            {/* Ledger 2026-09-03-slip-convergence: with a target trip resolved this button lands
                the item on the PLAN, not the cart — say which, rather than promising a cart row
                the traveler will not find (§13). */}
            <p className="font-semibold text-sm">Add to my current plan</p>
            <p className="text-xs text-muted-foreground">
              Plan &amp; optimize whenever you're ready — nothing to set up now
            </p>
          </div>
        </button>
        )}

        {targetTripId && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex-1 border-t" />
            or choose another plan
            <div className="flex-1 border-t" />
          </div>
        )}

        <PlanPickerList
          onPick={pickPlan}
          onStartNew={startNewPlan}
          disabled={addToTripMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
