import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseApiErrorMessage } from "@/lib/api-error";
import type { TripPlanPlanApproval } from "@shared/trip-plan";

/**
 * The delivery handshake (migration 164; QA_PUNCH_LIST W2-A items 11+13). Reads
 * `plancardData.meta.planApproval`, a server read the plancard assembly already makes
 * (`server/services/trip-plan.service.ts::resolvePlanApproval`) — never a client guess.
 *
 * Two renders, both owner-only (gated by the caller):
 *   - Delivered + undecided → "Approve plan / Request changes" banner.
 *   - Approved → a quiet confirmation chip.
 * Anything else (no advisor, still drafting, already sent back for changes) renders nothing —
 * §13, never fabricate a decision state that doesn't exist.
 */
export function PlanApprovalBanner({
  tripId,
  planApproval,
}: {
  tripId: string;
  planApproval: TripPlanPlanApproval | null | undefined;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const decide = useMutation({
    mutationFn: async (payload: { decision: "approve" | "request_changes"; note?: string }) => {
      return apiRequest("POST", `/api/trips/${tripId}/plan-review`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      setNoteOpen(false);
      setNote("");
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't record your decision",
        description: parseApiErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    },
  });

  if (!planApproval) return null;

  if (planApproval.status === "approved") {
    return (
      <div
        className="flex items-center gap-1.5 px-4 py-2 border-b border-border text-[11px] font-semibold"
        style={{ color: "#2C7A44" }}
        data-testid={`chip-plan-approved-${tripId}`}
      >
        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
        Plan approved
        {planApproval.approvedAt && (
          <span className="text-muted-foreground font-normal">
            {" "}
            on{" "}
            {new Date(planApproval.approvedAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            })}
          </span>
        )}
      </div>
    );
  }

  if (planApproval.workspaceStatus !== "delivered" || planApproval.status != null) {
    // Still drafting, or already sent back for changes (workspace_status flips off 'delivered'
    // at that point, so this branch also covers the request_changes state honestly).
    return null;
  }

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-border"
        style={{ background: "linear-gradient(90deg,#FFF4F0,#FFFBF8)" }}
        data-testid={`banner-plan-review-${tripId}`}
      >
        <MessageSquareWarning className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#D85A30" }} />
        <span className="text-[11px] font-semibold" style={{ color: "#A83E1B" }}>
          Your expert delivered this plan — review it?
        </span>
        <div className="ml-auto flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7"
            onClick={() => setNoteOpen(true)}
            disabled={decide.isPending}
            data-testid={`button-request-changes-${tripId}`}
          >
            Request changes
          </Button>
          <Button
            size="sm"
            className="text-xs h-7"
            onClick={() => decide.mutate({ decision: "approve" })}
            disabled={decide.isPending}
            data-testid={`button-approve-plan-${tripId}`}
          >
            Approve plan
          </Button>
        </div>
      </div>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request changes</DialogTitle>
            <DialogDescription>
              Tell your expert what to adjust. They'll see this note, and the plan goes back to
              draft while they work on it.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Can we swap Day 2's dinner for something closer to the hotel?"
            rows={4}
            data-testid={`textarea-request-changes-note-${tripId}`}
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() =>
                decide.mutate({ decision: "request_changes", note: note.trim() || undefined })
              }
              disabled={decide.isPending}
              data-testid={`button-submit-request-changes-${tripId}`}
            >
              Send to expert
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
