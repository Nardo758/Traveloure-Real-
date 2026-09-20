/**
 * VerifyRequestButton — ONE implementation of the AI-verification-leg control.
 *
 * Decision-maker ruling 2026-09-20 (ledger `2026-09-20-concierge-plan-read`). CLAUDE.md §18
 * rule 1, Locked Decision 44(a).
 *
 * WHY THIS EXISTS. `POST /api/affiliate-booking-requests/:id/verify` (the AI booking copilot's
 * verification leg) was mounted ONLY on the trip-scoped Workstation
 * (`client/src/pages/expert/workspace.tsx`), inline — its own `useMutation`, its own button JSX.
 * The pooled agent-inbox queue (`AgentBookingRequestsSection`,
 * `client/src/pages/expert/inbox.tsx`) had no verify affordance at all, although a request an
 * agent CLAIMED from the pool is exactly as verifiable as one that arrived through a trip. A
 * second, hand-copied mutation for the same call is the derivation-drift class §18 rule 1 names —
 * the day one of them changes its retry/throttle handling and the other does not, the two queues
 * disagree about what "verified" means for the same request. This module is the ONE
 * implementation; both surfaces call it.
 *
 * `POST …/verify`'s own authorization is UNCHANGED by this extraction — it admits an `expert` or
 * `admin` role, the same pooled-queue model the rest of the rail uses, with NO per-row `expertId`
 * ownership check (`server/routes/content.routes.ts`, the route's own comment). This component
 * does not narrow or widen that; a caller decides for itself which rows to show the control on
 * (the Workstation shows it for every non-terminal row on the trip; the inbox shows it only for
 * rows the viewer has CLAIMED, per this same ledger row — a render choice, not an authorization
 * one, exactly the §14 posture Locked Decision 42 D16 states for a different button).
 */
import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface VerifyRequestButtonProps {
  requestId: string;
  /** Whether this request already carries a verification snapshot — flips the button's copy
   *  between "Verify with AI" and "Re-verify with AI", exactly as the Workstation's did. */
  hasVerification: boolean;
  /** The query key(s) to invalidate on a settled verify call, so the caller's own list refetches
   *  and shows the fresh (or still-absent) snapshot. Each caller owns its own list's key. */
  invalidateQueryKeys: readonly unknown[][];
  className?: string;
  size?: "sm" | "default";
}

/**
 * The verify control. Renders its own pending state; the caller does not need to track it.
 *
 * Error handling mirrors the Workstation's original inline mutation verbatim: a 429 (throttled)
 * and a 409 (already in flight for this request) get their own toasts, everything else a generic
 * one. A `data.available === false` response (verification ran but could not confirm anything —
 * partner page unreachable, the feature unconfigured) is a SUCCESSFUL call with an honest empty
 * answer, not an error (§13) — it gets its own "Not verified" toast rather than throwing.
 */
export function VerifyRequestButton({
  requestId,
  hasVerification,
  invalidateQueryKeys,
  className,
  size = "sm",
}: VerifyRequestButtonProps) {
  const { toast } = useToast();

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/affiliate-booking-requests/${requestId}/verify`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      for (const key of invalidateQueryKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      if (data?.available === false) {
        const reason =
          data.reason === "verification_unavailable"
            ? "AI verification isn't configured right now."
            : data.reason === "partner_page_unreachable"
              ? "Couldn't reach the partner's page to verify it."
              : "Couldn't verify this request right now.";
        toast({ title: "Not verified", description: reason, variant: "destructive" });
      } else {
        toast({ title: "Verified", description: "The AI checked the partner page — review the result below." });
      }
    },
    onError: (err: any) => {
      const message = String(err?.message ?? "");
      const description = message.startsWith("429:")
        ? "Please wait a bit before re-verifying this request."
        : message.startsWith("409:")
          ? "A verification is already in progress for this request."
          : "Couldn't verify this request right now.";
      toast({ title: "Verification failed", description, variant: "destructive" });
    },
  });

  return (
    <Button
      type="button"
      size={size}
      variant="outline"
      onClick={() => verifyMutation.mutate()}
      disabled={verifyMutation.isPending}
      data-testid={`button-verify-${requestId}`}
      className={className}
    >
      {verifyMutation.isPending ? (
        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
      ) : (
        <Sparkles className="w-3.5 h-3.5 mr-1.5" />
      )}
      {hasVerification ? "Re-verify with AI" : "Verify with AI"}
    </Button>
  );
}
