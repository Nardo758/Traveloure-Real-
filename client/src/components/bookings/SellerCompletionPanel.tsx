/**
 * THE SELLER'S DECLARED-COMPLETION PANEL (CLAUDE.md Locked Decision 47).
 *
 * Ledger `2026-09-17-surfaces-acceptance-completion`. Completion is TWO guarded flips with the
 * traveler's dispute window between them: the seller declares (`confirmed → completion_declared`,
 * which MINTS NOTHING) and the nightly job completes at the window's close. Until this lane the
 * seller's console had no control for the first flip and no read-out of the second, so a rail that
 * had landed could not be reached by the person it was built for.
 *
 * RAIL CALLED (pre-existing; this lane added none):
 *   POST /api/provider/bookings/:id/complete   (and its `/api/expert/…` twin — the SAME handler,
 *   `handleOwnerBookingComplete`, registered under both paths)
 *
 * WHAT THIS PANEL DOES NOT DECIDE. Whether a booking may be declared complete is
 * `resolveCompletionEligibility`'s answer, server-side: it resolves the listing's RULE (an artifact
 * takes the TRAVELER's acceptance, not the seller's word; a place-anchored booking waits for its
 * date) and reads evidence no client holds. This panel draws the control from the shared FROM-STATE
 * list alone — see its stated negative space in `@shared/declared-completion-window` — and when the
 * rail refuses, it repeats the refusal BY NAME. A second copy of that rule resolver on a client is
 * the derivation-drift class §18 rule 1 names.
 *
 * §13: the window's close is the SERVER's derived `disputeBy`, never a client adding days; a booking
 * never declared renders no "not declared"; and "Completed" is drawn only for a row whose status
 * says so — which, per LD 47, is only ever said once the window has closed.
 */
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  LIFECYCLE_COPY,
  sellerCompletionView,
  type LifecycleAudience,
  type LifecycleBooking,
} from "@/lib/booking-lifecycle";

function readableDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return format(new Date(ms), "MMM d, yyyy");
}

export interface SellerCompletionPanelProps {
  booking: LifecycleBooking;
  audience: LifecycleAudience;
  /** Which of the two paths this console sits on. Same handler either way. */
  role: "provider" | "expert";
  invalidateKeys?: readonly (readonly unknown[])[];
}

export function SellerCompletionPanel({ booking, audience, role, invalidateKeys = [] }: SellerCompletionPanelProps) {
  const { toast } = useToast();
  const view = sellerCompletionView(booking, audience);

  const declareMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/${role}/bookings/${booking.id}/complete`),
    onSuccess: async (res) => {
      const body = await res.json().catch(() => ({} as any));
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key as unknown[] });
      const closes = readableDate(body?.disputeBy);
      toast({
        title: "Marked as done",
        // LD 47: "completed" is NOT the word here, and the toast must not use it. The response says
        // `completed: false` on purpose; what happened is a declaration that opened a window.
        description: closes
          ? `The traveler's review window closes ${closes}. Nothing is paid out until then.`
          : LIFECYCLE_COPY.sellerDeclareHint,
      });
    },
    onError: async (err: any) => {
      // The rail's own refusal, by name — `session_not_ended`, `no_booked_slot`,
      // `artifact_takes_acceptance` and the rest each carry a sentence the server wrote.
      const raw = String(err?.message ?? "");
      const match = raw.match(/\{[\s\S]*\}$/);
      let description = "Please reload and try again.";
      if (match) {
        try {
          const body = JSON.parse(match[0]);
          if (typeof body?.message === "string" && body.message.trim()) description = body.message;
        } catch {
          /* keep the fallback */
        }
      }
      toast({ title: "Could not mark this done", description, variant: "destructive" });
    },
  });

  // §13: nothing to draw for a viewer who is not this booking's seller.
  if (!view) return null;

  const declaredOn = readableDate(view.declaration?.declaredAt);
  const closesOn = readableDate(view.declaration?.disputeBy);

  if (view.completed) {
    return (
      <p className="flex items-center gap-1 text-xs text-emerald-700" data-testid={`seller-completed-${booking.id}`}>
        <CheckCircle className="w-3 h-3" />
        {LIFECYCLE_COPY.sellerCompleted}
      </p>
    );
  }

  if (view.declaration) {
    return (
      <p className="flex items-center gap-1 text-xs text-muted-foreground" data-testid={`seller-declared-${booking.id}`}>
        <Clock className="w-3 h-3" />
        {declaredOn ? `You marked this done on ${declaredOn}.` : "You marked this done."}
        {closesOn && ` The traveler's review window closes ${closesOn}.`}
      </p>
    );
  }

  if (!view.canDeclare) return null;

  return (
    <div className="space-y-1" data-testid={`seller-declare-${booking.id}`}>
      <Button
        size="sm"
        variant="outline"
        onClick={() => declareMutation.mutate()}
        disabled={declareMutation.isPending}
        data-testid={`button-declare-complete-${booking.id}`}
      >
        {declareMutation.isPending ? (
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
        ) : (
          <CheckCircle className="w-4 h-4 mr-1" />
        )}
        {LIFECYCLE_COPY.declareButton}
      </Button>
      <p className="text-[11px] text-muted-foreground">{LIFECYCLE_COPY.sellerDeclareHint}</p>
    </div>
  );
}
