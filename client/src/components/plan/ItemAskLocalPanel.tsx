/**
 * R-r — the item-level question when no local is live in the city: the existing `expert_interest` rail,
 * nothing charged. Shared by the slip's row and (R321 S11-5) the Trip Card's `ItemSheet`.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ASK_LOCAL_WORDS } from "@/lib/item-row-menu";

/** R-r — the item-level question when no local is live in the city. Existing rail, nothing charged. */
export function ItemAskLocalPanel({ tripId, itemId, onClose }: { tripId: string; itemId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [question, setQuestion] = useState("");
  const [savedCity, setSavedCity] = useState<string | null | undefined>(undefined);
  const save = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/trips/${tripId}/slip-events`, {
        type: "expert_interest",
        level: "question",
        itemId,
        question: question.trim(),
      });
      const overview = queryClient.getQueryData<{ market?: { cityName: string | null } }>([`/api/trips/${tripId}/expert-help`]);
      return overview?.market?.cityName ?? null;
    },
    onSuccess: (city) => {
      setSavedCity(city);
      // Smoke 7 item 4: the saved state is read back from the plan, so it survives a reload.
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
    },
    onError: () => toast({ title: "Couldn't save your question", variant: "destructive" }),
  });
  if (savedCity !== undefined) {
    return (
      <p className="mt-2 text-xs text-muted-foreground" data-testid={`item-ask-local-saved-${itemId}`}>
        {ASK_LOCAL_WORDS.saved(savedCity)}
      </p>
    );
  }
  return (
    <div className="mt-2 space-y-2 rounded-md border border-border p-2" data-testid={`item-ask-local-${itemId}`}>
      <label className="block text-xs text-muted-foreground" htmlFor={`item-ask-local-input-${itemId}`}>
        {ASK_LOCAL_WORDS.prompt}
      </label>
      <textarea
        id={`item-ask-local-input-${itemId}`}
        className="w-full rounded-md border border-border bg-background p-2 text-sm"
        rows={2}
        maxLength={500}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        data-testid={`item-ask-local-input-${itemId}`}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => save.mutate()} disabled={!question.trim() || save.isPending} data-testid={`item-ask-local-save-${itemId}`}>
          {ASK_LOCAL_WORDS.save}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} data-testid={`item-ask-local-cancel-${itemId}`}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
