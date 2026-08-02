/**
 * /plans/:tripId — the Slip's canonical address (SLIP_EXPERIENCE_DISPATCH §4, Spec A + the
 * message→slip deep-link contract). A thin page: it fetches the SAME plancard DTO the
 * PlanCard family reads (auth is server-side on the route — the URL grants nothing) and
 * renders the canonical `SlipView` from the plancard family. `?item=<itemId>` scrolls to and
 * briefly highlights that item row on mount.
 */
import { Loader2 } from "lucide-react";
import { useParams, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { SlipView, type SlipData } from "@/components/plancard/SlipView";

export default function SlipViewPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const searchStr = useSearch();
  const highlightItemId = new URLSearchParams(searchStr).get("item");

  const { data, isLoading, isError } = useQuery<SlipData>({
    // Same key the PlanCard uses, so React Query shares the cache across surfaces.
    queryKey: [`/api/trips/${tripId}/plancard`],
    enabled: !!tripId,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <h2 className="text-xl font-semibold text-foreground">Couldn't load this plan</h2>
        <p className="text-sm text-muted-foreground mt-1">
          It may not exist, or you may not have access to it.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <SlipView tripId={tripId!} data={data} highlightItemId={highlightItemId} />
    </div>
  );
}
