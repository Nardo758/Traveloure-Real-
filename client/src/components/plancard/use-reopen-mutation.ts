/**
 * useReopenMutation — `POST /api/trips/:id/reopen`, the ONE client mutation behind "Back to
 * planning" (ruling R-F: reopen clears `finalized_at`; owner-gated server-side).
 *
 * Extracted from `SlipRail.tsx` by ledger `2026-09-07-trip-card-one-page` so the Trip Card's
 * right rail can offer the same control without a second copy of the call, its invalidation or
 * its error toast (§18 rule 1). Two callers: the slip's Finish card and the Trip Card rail.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function useReopenMutation(tripId: string) {
  const { toast } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/reopen`);
      return (await res.json()) as { alreadyOpen: boolean };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't reopen plan",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });
}
