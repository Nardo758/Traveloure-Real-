/**
 * ConciergeCard — the Ready-Made purchase's included support, shown on the buyer's Trip Slip
 * (ledger 2026-08-22-concierge-revision, P1).
 *
 * Every ready-made purchase includes ONE consultation + ONE revision from the selling expert.
 * This card is the buyer's entry: it renders ONLY when the current trip is a ready-made clone the
 * caller owns (the server's by-clone lookup returns null otherwise → the card renders nothing, never
 * on a non-purchased trip). Requesting the revision grants the selling expert write access to this
 * clone server-side (§12) so they can make the changes; the consult chat + Suggest→approve delivery
 * land in P2.
 *
 * Honest framing (§13): the card promises only the one consult + one revision the expert committed
 * to — never unlimited edits or a money-back guarantee.
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAskExpert } from "@/lib/use-ask-expert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConciergeBell, Check, Loader2, MessageCircle } from "lucide-react";

interface ConciergeEntitlement {
  purchaseId: string;
  status: string;
  revisionStatus: "available" | "requested" | "in_progress" | "delivered";
  revisionRequestedAt: string | null;
  expertUserId: string | null;
  expertName: string;
  expertHandle: string | null;
}

export function ConciergeCard({ tripId }: { tripId: string }) {
  const { toast } = useToast();
  const askExpert = useAskExpert();
  const [note, setNote] = useState("");

  const queryKey = [`/api/ready-made/purchases/by-clone/${tripId}`];
  const { data } = useQuery<{ purchase: ConciergeEntitlement | null }>({
    queryKey,
    enabled: !!tripId,
    staleTime: 30_000,
  });

  const requestMutation = useMutation({
    mutationFn: async (purchaseId: string) => {
      const res = await apiRequest("POST", `/api/ready-made/purchases/${purchaseId}/request-revision`, {
        note: note.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Revision requested", description: "Your expert has been notified and can now adjust your plan." });
    },
    onError: (e: any) => {
      toast({ title: "Couldn't request revision", description: e?.message ?? "Please try again.", variant: "destructive" });
    },
  });

  const p = data?.purchase;
  // Not a ready-made clone the caller owns → render nothing.
  if (!p) return null;

  const expert = p.expertHandle ? `@${p.expertHandle}` : p.expertName;

  return (
    <div className="rounded-lg border border-primary/40 overflow-hidden" data-testid="card-concierge">
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-primary/5">
        <ConciergeBell className="w-4 h-4 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">Concierge support from your expert</div>
          <div className="text-xs text-muted-foreground truncate">Included with this Ready-Made trip · built by {expert}</div>
        </div>
      </div>

      <div className="px-4 py-3">
        {p.revisionStatus === "available" && (
          <>
            <ul className="text-sm text-foreground space-y-1 mb-3">
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-primary" /> 1 consultation with {expert}</li>
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-primary" /> 1 revision — have {expert} adjust the itinerary for your dates &amp; taste</li>
            </ul>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder={`What would you like changed? (sent to ${expert})`}
              className="mb-2 text-sm"
              data-testid="textarea-revision-note"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={() => requestMutation.mutate(p.purchaseId)}
                disabled={requestMutation.isPending}
                data-testid="button-request-revision"
              >
                {requestMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Request my revision
              </Button>
              {p.expertUserId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    askExpert({
                      expertId: p.expertUserId!,
                      subject: `Question about my Ready-Made trip from ${expert}`,
                      fallbackName: p.expertName,
                      returnTo: `/plans/${tripId}`,
                    })
                  }
                  data-testid="button-message-expert"
                >
                  <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> Message {expert}
                </Button>
              )}
            </div>
          </>
        )}

        {p.revisionStatus === "requested" && (
          <div className="text-sm text-muted-foreground" data-testid="text-revision-requested">
            <span className="font-medium text-foreground">Revision requested.</span>{" "}
            {expert} has been notified and can now adjust your plan — you'll see their suggested changes here to approve.
          </div>
        )}
        {p.revisionStatus === "in_progress" && (
          <div className="text-sm text-muted-foreground" data-testid="text-revision-in-progress">
            {expert} is working on your revision.
          </div>
        )}
        {p.revisionStatus === "delivered" && (
          <div className="text-sm text-muted-foreground flex items-center gap-2" data-testid="text-revision-delivered">
            <Check className="w-4 h-4 text-primary" /> Your revision has been delivered.
          </div>
        )}
      </div>
    </div>
  );
}

export default ConciergeCard;
