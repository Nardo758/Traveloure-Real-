/**
 * ExpertSuggestionsPanel — the family home for expert-authored suggestion review
 * (Trip Card rebuild Phase 3b, row 11; ledger 2026-08-31-manifest-is-the-boundary).
 *
 * Ported OUT of the trip-details.tsx expert-tab bolt-on so there is ONE renderer of the
 * "Sofia suggested — accept?" loop, mounted in the family instead of duplicated on a tab:
 *   - pre-final it renders on the SLIP (SlipView) — accepting acts on the live plan;
 *   - post-final it renders on the Trip Card (PlanCard stage="full") — accepting a
 *     suggestion AUTO-CREATES a new final version. That auto-v+1 is server-side
 *     (reFinalizeIfCurrentlyFinal on suggestion-approve, booking-actions.ts, wired in
 *     Phase 2), so this component only needs to PATCH and then refresh the plancard read;
 *     it is the ratified exception to "frozen snapshot" and it is honest — the traveler chose.
 *
 * Self-contained: it fetches its own suggestions and renders NOTHING when there are none
 * (§13 — no expert / no suggestions ⇒ no panel, never an empty "no suggestions" claim on a
 * trip that never had an expert). The parent decides only WHERE it mounts.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Lightbulb, Loader2, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TripSuggestion {
  id: string;
  trip_id: string;
  expert_id: string;
  type: string;
  day_number: number | null;
  title: string;
  description: string | null;
  estimated_cost: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  expert_first_name: string;
  expert_last_name: string;
  expert_profile_image_url: string | null;
}

export function ExpertSuggestionsPanel({ tripId, className }: { tripId: string; className?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");

  const { data, isLoading } = useQuery<{ suggestions: TripSuggestion[] }>({
    queryKey: [`/api/trips/${tripId}/suggestions`],
    enabled: !!tripId,
    staleTime: 30_000,
  });

  const reviewSuggestionMutation = useMutation({
    mutationFn: async ({ suggestionId, status, rejectionNote }: { suggestionId: string; status: "approved" | "rejected"; rejectionNote?: string }) => {
      const res = await apiRequest("PATCH", `/api/trips/${tripId}/suggestions/${suggestionId}`, { status, rejectionNote });
      return res.json() as Promise<{ suggestion: { status: string } }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/suggestions`] });
      if (result?.suggestion?.status === "approved") {
        // Approval materializes a real itinerary_items row server-side (booking-actions.ts)
        // and — when the trip is currently finalized — auto-creates a new final version
        // (reFinalizeIfCurrentlyFinal). Refresh the canonical reads so the new item and the
        // bumped final version render without a manual reload.
        queryClient.invalidateQueries({ queryKey: ["/api/generated-itineraries", tripId] });
        queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
        queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      }
      toast({ title: "Suggestion reviewed", description: "Your response has been saved." });
    },
    onError: () => {
      toast({ title: "Could not review suggestion", variant: "destructive" });
    },
  });

  const suggestions = data?.suggestions ?? [];
  const pendingCount = suggestions.filter((s) => s.status === "pending").length;

  // §13: no expert / no suggestions ⇒ render nothing (never an empty-state claim). While the
  // very first load is in flight we also render nothing rather than a skeleton for a panel that
  // is empty on most trips — the loading skeleton would be a false "an expert is here" signal.
  if (isLoading || suggestions.length === 0) return null;

  return (
    <div className={className} data-testid="expert-suggestions-panel">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="w-5 h-5 text-amber-500" />
        <h4 className="text-lg font-semibold text-foreground">Expert Suggestions</h4>
        {pendingCount > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
            {pendingCount} pending
          </span>
        )}
      </div>

      <div className="space-y-3" data-testid="suggestions-list">
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className={`rounded-xl border p-4 transition-colors ${
              suggestion.status === "approved"
                ? "border-green-200 bg-green-50/50 dark:bg-green-950/20"
                : suggestion.status === "rejected"
                ? "border-red-200 bg-red-50/50 dark:bg-red-950/20"
                : "border-border bg-muted/20"
            }`}
            data-testid={`suggestion-card-${suggestion.id}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase font-medium tracking-wide">
                    {suggestion.type}
                  </span>
                  {suggestion.day_number && (
                    <span className="text-[10px] text-muted-foreground">Day {suggestion.day_number}</span>
                  )}
                  {suggestion.status === "approved" && (
                    <span className="flex items-center gap-1 text-[10px] text-green-700 font-medium">
                      <CheckCircle className="w-3 h-3" /> Approved
                    </span>
                  )}
                  {suggestion.status === "rejected" && (
                    <span className="flex items-center gap-1 text-[10px] text-red-700 font-medium">
                      <XCircle className="w-3 h-3" /> Declined
                    </span>
                  )}
                </div>
                <p className="font-medium text-foreground mb-1">{suggestion.title}</p>
                {suggestion.description && (
                  <p className="text-sm text-muted-foreground mb-2">{suggestion.description}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    {suggestion.expert_first_name} {suggestion.expert_last_name}
                  </span>
                  {suggestion.estimated_cost && (
                    <span className="text-primary font-medium">~${parseFloat(suggestion.estimated_cost).toFixed(0)}</span>
                  )}
                  <span>{new Date(suggestion.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                </div>
                {suggestion.rejection_note && (
                  <p className="text-xs text-red-600 mt-1 italic">Note: {suggestion.rejection_note}</p>
                )}
              </div>
            </div>
            {suggestion.status === "pending" && (
              <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
                  onClick={() => reviewSuggestionMutation.mutate({ suggestionId: suggestion.id, status: "approved" })}
                  disabled={reviewSuggestionMutation.isPending}
                  data-testid={`button-approve-suggestion-${suggestion.id}`}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Approve &amp; add to itinerary
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => {
                    setRejectTargetId(suggestion.id);
                    setRejectionNote("");
                    setRejectDialogOpen(true);
                  }}
                  disabled={reviewSuggestionMutation.isPending}
                  data-testid={`button-reject-suggestion-${suggestion.id}`}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Decline
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={rejectDialogOpen} onOpenChange={(open) => { setRejectDialogOpen(open); if (!open) setRejectTargetId(null); }}>
        <DialogContent className="sm:max-w-sm" data-testid="dialog-reject-suggestion">
          <DialogHeader>
            <DialogTitle>Decline suggestion</DialogTitle>
            <DialogDescription>
              Let the expert know why you're passing on this idea (optional).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Textarea
              placeholder="e.g. Budget doesn't fit, already have plans for this day…"
              value={rejectionNote}
              onChange={(e) => setRejectionNote(e.target.value)}
              rows={3}
              data-testid="input-rejection-note"
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setRejectDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  if (rejectTargetId) {
                    reviewSuggestionMutation.mutate({ suggestionId: rejectTargetId, status: "rejected", rejectionNote: rejectionNote || undefined });
                  }
                  setRejectDialogOpen(false);
                  setRejectTargetId(null);
                }}
                disabled={reviewSuggestionMutation.isPending}
                data-testid="button-confirm-reject"
              >
                {reviewSuggestionMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4 mr-2" />
                )}
                Decline suggestion
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
