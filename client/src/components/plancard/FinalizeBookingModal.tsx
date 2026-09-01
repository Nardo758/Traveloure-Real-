/**
 * FinalizeBookingModal — "You're set — how do you want to book it?"
 *
 * Ratified mock: "Adopt the Optimization" → the Finalize modal
 * (artifact b39eedaa, thread c26f29e3). Opens AFTER a traveler adopts/finalizes their
 * optimized plan (SlipView `SlipActions`, on finalize success). It is a CHOOSER that hands
 * the finalized plan to one of four rails that already exist — no new backend:
 *
 *   • Book it myself   → bulk-route un-booked in_planning items to checkout, land on /cart.
 *   • Booking agent    → POST /api/affiliate-booking-requests per partner-bookable stop, by
 *                        opaque bookingToken only (§16 — the affiliate URL never leaves the
 *                        server). Available only when the plan has partner-bookable stops.
 *   • Travel expert    → POST /api/expert-requests (routes the trip to an expert to refine + book).
 *   • Concierge        → hand off to the concierge surface (/concierge), which owns the quote.
 *
 * Guarantees drawn in the mock and enforced here: choosing a person gives them ACCESS to the
 * finalized plan (R-C / the stationary-slip erratum — the slip never moves and nothing is copied;
 * the expert lane's request → assignment pipeline IS the advisor-access grant,
 * `confirmLeadAssignmentTx` → `trip_expert_advisors`), NOTHING is charged until a booking is
 * confirmed, and NO price is ever sent from the client (§14 — every amount is server-derived).
 * No figure is invented (§13): counts shown come from the plan's own items. The former
 * "Finalize without booking?" pre-gate is folded in here (adopt-finalize-conform row 13): when
 * staged-but-unbooked items exist, this chooser says so inline — finalize stays one press.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  runBulkRouteToCheckout,
  selectBulkCheckoutItems,
  summarizeBulkRoute,
} from "@/lib/slip-plan-actions";
import type { PlanCardActivity } from "./plancard-types";
import { ShoppingCart, UserCheck, Sparkles, Handshake, Check } from "lucide-react";

type FinalizeTrip = { id: string; destination: string | null; travelers: number };
type Lane = "myself" | "agent" | "expert" | "concierge";

/** Partner-bookable stops carry an opaque §16 bookingToken on `affiliateBooking` (never a URL). */
function affiliateStops(activities: PlanCardActivity[]) {
  return activities.filter((a) => !!a.affiliateBooking?.bookingToken);
}

export function FinalizeBookingModal({
  open,
  onOpenChange,
  trip,
  activities,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trip: FinalizeTrip;
  activities: PlanCardActivity[];
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [lane, setLane] = useState<Lane>("myself");
  const [submitting, setSubmitting] = useState(false);

  const bookableStops = affiliateStops(activities);
  const agentAvailable = bookableStops.length > 0;
  const checkoutCount = selectBulkCheckoutItems(activities).length;
  // Folded pre-gate (adopt-finalize-conform row 13): the old separate "Finalize without booking?"
  // dialog's fact, stated inline here instead. Same predicate SlipView's gate used — items staged
  // to checkout but not yet booked. §13: rendered only when the count is real and non-zero.
  const stagedUnbookedCount = activities.filter((a) => a.routingStatus === "ready_for_checkout").length;

  async function handleContinue() {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (lane === "myself") {
        const result = await runBulkRouteToCheckout({
          items: activities,
          postRoute: (itemId) =>
            apiRequest("POST", `/api/trips/${trip.id}/items/${itemId}/route`, { to: "ready_for_checkout" }),
          invalidate: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/trips/${trip.id}/plancard`] });
            queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
          },
        });
        onOpenChange(false);
        toast(summarizeBulkRoute(result));
        setLocation("/cart");
      } else if (lane === "agent") {
        // §16: one request per partner stop, by opaque bookingToken — never a URL, never a price.
        let ok = 0;
        const failed: string[] = [];
        for (const stop of bookableStops) {
          try {
            await apiRequest("POST", "/api/affiliate-booking-requests", {
              tripId: trip.id,
              itemName: stop.name,
              partnerName: stop.affiliateBooking?.partnerName ?? null,
              partnerCategory: null,
              bookingToken: stop.affiliateBooking?.bookingToken ?? undefined,
              travelers: trip.travelers ?? 1,
            });
            ok += 1;
          } catch {
            failed.push(stop.name);
          }
        }
        onOpenChange(false);
        toast({
          title: ok > 0 ? "Handed to a booking agent" : "Couldn't hand it off",
          description:
            (ok > 0
              ? `${ok} stop${ok === 1 ? "" : "s"} sent to a booking agent. Nothing is charged until a booking is confirmed.`
              : "Please try again.") + (failed.length ? ` (${failed.length} couldn't be sent.)` : ""),
          variant: ok > 0 ? undefined : "destructive",
        });
      } else if (lane === "expert") {
        await apiRequest("POST", "/api/expert-requests", {
          requestType: "ai_plan_polish",
          tripId: trip.id,
          destination: trip.destination ?? undefined,
          notes: "Refine my finalized plan, then book it for me.",
        });
        onOpenChange(false);
        toast({
          title: "Sent to a travel expert",
          description: "An expert will refine your plan and book it. Nothing is charged until you or they confirm.",
        });
      } else if (lane === "concierge") {
        onOpenChange(false);
        // The concierge surface owns the priced quote; hand it the intent (server derives price).
        setLocation(`/concierge?intent=${encodeURIComponent("Book my finalized plan end-to-end")}`);
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Something went wrong", description: err?.message || "Please try again" });
    } finally {
      setSubmitting(false);
    }
  }

  const people: Array<{ id: Lane; label: string; blurb: string; icon: typeof UserCheck; disabled?: boolean; disabledNote?: string }> = [
    {
      id: "agent",
      label: "Booking agent",
      blurb: agentAvailable ? "Books it as-is" : "No partner-bookable stops in this plan",
      icon: Handshake,
      disabled: !agentAvailable,
    },
    { id: "expert", label: "Travel expert", blurb: "Refines, then books", icon: UserCheck },
    { id: "concierge", label: "Concierge", blurb: "Handles end-to-end", icon: Sparkles },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="finalize-modal">
        <DialogHeader>
          <DialogTitle>You're set — how do you want to book it?</DialogTitle>
          <DialogDescription>
            Your finalized plan is locked in. Choose how the bookings get made — do it yourself, or hand it to
            someone. Either way your plan stays yours.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Book it myself */}
          <button
            type="button"
            onClick={() => setLane("myself")}
            aria-pressed={lane === "myself"}
            data-testid="finalize-option-myself"
            className={`w-full text-left rounded-lg border p-3 transition-colors ${
              lane === "myself" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-primary">
                {lane === "myself" && <Check className="h-3.5 w-3.5 text-primary" />}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium">
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" /> Book it myself
                </div>
                <p className="text-sm text-muted-foreground">
                  Book each stop in-platform at your own pace — add to cart and check out when ready. Nothing handed off.
                  {checkoutCount > 0 && (
                    <span className="block text-[12px]">
                      {checkoutCount} stop{checkoutCount === 1 ? "" : "s"} ready to send to your cart.
                    </span>
                  )}
                </p>
              </div>
            </div>
          </button>

          <div className="flex items-center gap-2 text-[12px] uppercase tracking-wide text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or have someone book it for you <span className="h-px flex-1 bg-border" />
          </div>

          {people.map((p) => {
            const Icon = p.icon;
            const active = lane === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={p.disabled}
                onClick={() => !p.disabled && setLane(p.id)}
                aria-pressed={active}
                data-testid={`finalize-option-${p.id}`}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                } ${p.disabled ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-primary">
                    {active && <Check className="h-3.5 w-3.5 text-primary" />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      <Icon className="h-4 w-4 text-muted-foreground" /> {p.label}
                    </div>
                    <p className="text-sm text-muted-foreground">{p.blurb}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {stagedUnbookedCount > 0 && (
          <p className="text-[12px] text-muted-foreground" data-testid="finalize-staged-unbooked-note">
            {stagedUnbookedCount} stop{stagedUnbookedCount === 1 ? " is" : "s are"} in checkout but not booked yet —
            finalizing doesn't book {stagedUnbookedCount === 1 ? "it" : "them"}; you can book any time.
          </p>
        )}
        <p className="text-[12px] text-muted-foreground">
          Choosing a person gives them access to your finalized plan to book on your behalf — you keep ownership,
          and nothing is charged until you or they confirm a booking.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting} data-testid="finalize-back">
            Back
          </Button>
          <Button onClick={handleContinue} disabled={submitting} data-testid="finalize-continue">
            {submitting ? "Working…" : "Continue"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
