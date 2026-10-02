/**
 * WHERE TO STAY — the container (smoke test 4, item 5; ledger `2026-10-02-smoke4-draft-fixes`). The
 * view is read by `SlipView` (one query key, so the slip can tell whether the panel is showing) and
 * handed in; this wires the three answers to `POST /api/trips/:tripId/where-to-stay` and the free M8
 * re-anchor to the EXISTING `/anchor/promote` rail.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { StayHotel, WhereToStayView } from "@shared/where-to-stay";
import { WhereToStayPanelView } from "./WhereToStayPanelView";

type Bind =
  | { kind: "stay_here"; hotel: { kind: StayHotel["kind"]; id: string } }
  | { kind: "own"; hotelName: string | null; neighborhoodSlug: string | null }
  | { kind: "skip" };

export function WhereToStayPanel({ tripId, view, canChoose }: { tripId: string; view: WhereToStayView; canChoose: boolean }) {
  const { toast } = useToast();
  const [bound, setBound] = useState<{ name: string; itemId: string } | null>(null);

  const refresh = () => {
    for (const k of ["where-to-stay", "plancard", "option-sets"]) {
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/${k}`] });
    }
  };

  const bind = useMutation({
    mutationFn: async (input: { body: Bind; name: string | null }) => {
      const out = await (await apiRequest("POST", `/api/trips/${tripId}/where-to-stay`, input.body)).json();
      return { ...out, name: input.name } as { setId: string; itemId: string | null; name: string | null };
    },
    onSuccess: (out, input) => {
      // "Stay here" offers the free re-anchor before the panel closes; the other answers just close it.
      if (input.body.kind === "stay_here" && out.itemId && out.name) setBound({ name: out.name, itemId: out.itemId });
      else refresh();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Couldn't save where you're staying", description: e?.message }),
  });

  const reanchor = useMutation({
    mutationFn: async (itemId: string) => (await apiRequest("POST", `/api/trips/${tripId}/anchor/promote`, { itemId })).json(),
    onSuccess: () => {
      setBound(null);
      refresh();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Couldn't start your days from there", description: e?.message }),
  });

  return (
    <WhereToStayPanelView
      view={view}
      canChoose={canChoose}
      busy={bind.isPending || reanchor.isPending}
      bound={bound}
      onStayHere={(h) => bind.mutate({ body: { kind: "stay_here", hotel: { kind: h.kind, id: h.id } }, name: h.name })}
      onOwn={(a) => bind.mutate({ body: { kind: "own", ...a }, name: null })}
      onSkip={() => bind.mutate({ body: { kind: "skip" }, name: null })}
      onReanchor={() => bound && reanchor.mutate(bound.itemId)}
      onDismissReanchor={() => {
        setBound(null);
        refresh();
      }}
    />
  );
}
