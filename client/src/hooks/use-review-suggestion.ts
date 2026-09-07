/**
 * useReviewSuggestion — the ONE client mutation that accepts or declines an expert suggestion
 * (`PATCH /api/trips/:tripId/suggestions/:suggestionId`, owner-gated server-side in
 * booking-actions.ts). Lifted VERBATIM out of `ExpertSuggestionsPanel` (ledger
 * `2026-09-07-home-time-axis`) so Home's "Since you were here" can offer Accept / Decline inline
 * through the same rail, with the same invalidation list — a second copy of that list is how
 * one surface starts showing a suggestion the other has already applied (§18 rule 1).
 *
 * Approval materializes a real itinerary_items row server-side and — when the trip is currently
 * finalized — auto-creates a new final version (reFinalizeIfCurrentlyFinal), so the canonical
 * reads are refreshed on success.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface TripSuggestion {
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

export type ReviewSuggestionInput = {
  suggestionId: string;
  status: "approved" | "rejected";
  rejectionNote?: string;
};

export function suggestionsQueryKey(tripId: string) {
  return [`/api/trips/${tripId}/suggestions`] as const;
}

export function useReviewSuggestion(tripId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ suggestionId, status, rejectionNote }: ReviewSuggestionInput) => {
      const res = await apiRequest("PATCH", `/api/trips/${tripId}/suggestions/${suggestionId}`, { status, rejectionNote });
      return res.json() as Promise<{ suggestion: { status: string } }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: suggestionsQueryKey(tripId) });
      if (result?.suggestion?.status === "approved") {
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
}
