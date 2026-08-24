import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Shared "delegate to AI" action for the EA console.
 *
 * There is no real AI backend behind these buttons (§13 — no LLM call, no draft
 * generator, no scorer). Rather than fake a completed AI response (the L7 class
 * of bug), delegating creates a REAL, honestly-`pending` row in `ea_ai_tasks` —
 * the same queue the AI Assistant page's "Pending Your Review" list already
 * renders from live data. This is the one home for delegated work (the §17
 * one-home rule): every "Delegate to AI" / "AI Suggest" / "AI Draft" button
 * across the console feeds this single real queue instead of each inventing
 * its own fake-instant result.
 */
export function useDelegateToAi() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (payload: { type: string; task: string; executiveName?: string }) =>
      apiRequest("POST", "/api/ea/ai-tasks", payload).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ea/ai-tasks"] });
      toast({
        title: "Sent to AI Assistant",
        description: "Added to your pending queue — review and approve it on the AI Assistant page.",
      });
    },
    onError: (e: any) => {
      toast({
        title: "Could not delegate task",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });
}
