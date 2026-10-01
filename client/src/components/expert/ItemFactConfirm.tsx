/**
 * "Confirm this fact" — the expert's one tap in the Workstation (A6 (4), ledger
 * `2026-10-01-a6-expert-confirm`; content sourcing brief §8). Lists the item's facts the SERVER marked
 * `confirmable` (a crawled web fact, never a Google Maps fact) and turns one into a verified nugget.
 *
 * Reads the plancard the Workstation already loads; restates no rule — `confirmable` and every
 * provenance line are the server's. A refusal (the byline gate, a fact already confirmed) is shown
 * in the server's own terms.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { FactView } from "@shared/content-facts";

const BYLINE_REASON: Record<string, string> = {
  not_approved: "your expert application is not approved yet",
  no_handle: "you have not claimed a public handle",
  storefront_not_live: "your storefront is not live",
  no_verified_neighborhood_in_market: "you have no verified neighbourhood in this plan's city",
};

export function ItemFactConfirm({ tripId, itemId }: { tripId: string; itemId: string }) {
  const { toast } = useToast();
  const { data } = useQuery<{ placeFacts?: Record<string, FactView[]> }>({ queryKey: [`/api/trips/${tripId}/plancard`] });
  const facts = (data?.placeFacts?.[itemId] ?? []).filter((f) => f.confirmable && f.id && typeof f.value?.text === "string");

  const confirm = useMutation({
    mutationFn: (factId: string) => apiRequest("POST", `/api/trips/${tripId}/place-facts/${factId}/confirm`, {}),
    onSuccess: () => {
      toast({ title: "Confirmed", description: "Saved as a verified fact from a local expert." });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
    },
    onError: (e: Error) => {
      const reason = Object.keys(BYLINE_REASON).find((k) => e.message.includes(k));
      toast({
        title: "Not confirmed",
        description: reason ? `You can confirm facts once ${BYLINE_REASON[reason]}.` : e.message,
        variant: "destructive",
      });
    },
  });

  if (!facts.length) return null;
  return (
    <div data-testid={`item-fact-confirm-${itemId}`} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
      <div style={{ fontWeight: 600 }}>Facts from the web — confirm what you know is right</div>
      {facts.map((f) => (
        <div key={f.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div>{String(f.value.text)}</div>
            <div style={{ opacity: 0.7 }}>{f.provenance}</div>
          </div>
          <button
            type="button"
            onClick={() => confirm.mutate(f.id!)}
            disabled={confirm.isPending}
            data-testid={`button-confirm-fact-${f.id}`}
            style={{ padding: "4px 10px", fontSize: 11.5, borderRadius: 6, border: "1px solid currentColor", background: "transparent", whiteSpace: "nowrap" }}
          >
            Confirm
          </button>
        </div>
      ))}
    </div>
  );
}
