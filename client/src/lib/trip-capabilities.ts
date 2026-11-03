/**
 * CAP-1 (ledger `2026-11-03-cap1-trip-capabilities`): the ONE client read of GET /api/trips/:tripId/capabilities.
 * A surface gates on `actions.*` and never re-derives money, handoff kinds or viewer roles itself.
 *
 * FAIL-CLOSED: no answer yet, an error, or no QueryClientProvider (a static render) gives `data: undefined`, and every
 * `actions.*` reader treats that as "no" — a surface never draws a paid action it cannot confirm.
 */
import { useContext } from "react";
import { QueryClient, QueryClientContext, useQuery, type QueryClient as QC } from "@tanstack/react-query";
import type { TripCapabilities } from "@shared/trip-capabilities";

export type { TripCapabilities };

export function tripCapabilitiesQueryKey(tripId: string) {
  return ["/api/trips", tripId, "capabilities"] as const;
}

/** Used only where no QueryClientProvider is mounted (a static render): nothing is fetched. */
const NO_PROVIDER_CLIENT = new QueryClient();

export function useTripCapabilities(tripId: string | null | undefined, enabled = true): { data: TripCapabilities | undefined; isLoading: boolean } {
  const client = useContext(QueryClientContext);
  const q = useQuery<TripCapabilities>(
    { queryKey: tripCapabilitiesQueryKey(tripId ?? ""), retry: false, staleTime: 30_000, enabled: !!client && !!tripId && enabled },
    client ?? NO_PROVIDER_CLIENT,
  );
  return { data: q.data, isLoading: q.isLoading };
}

/** Called after every mutation that changes a capabilities input (handoff, Trip Pass, suggestion answers). */
export function invalidateTripCapabilities(qc: QC, tripId: string | null | undefined): Promise<void> {
  if (!tripId) return Promise.resolve();
  return qc.invalidateQueries({ queryKey: tripCapabilitiesQueryKey(tripId) });
}

/** HandoffBanner / HandoffFooter: Approve and Request changes are drawn only on the server's "approve". */
export function handoffApproveShown(caps: TripCapabilities | undefined): boolean {
  return caps?.actions.handoff === "approve";
}

/** TripPassCard: which face it draws — the offer, the active card, or nothing. */
export function tripPassCardView(caps: TripCapabilities | undefined): "offer" | "active" | null {
  const a = caps?.actions.tripPass;
  // "verify" is drawn as the offer: the purchase route's own verify prompt runs, exactly as before.
  if (a === "offer" || a === "verify") return "offer";
  return a === "active" ? "active" : null;
}

/** BottomActionBar: the paid help door is drawn only when this viewer can pay on the plan. */
export function paidActionsShown(caps: TripCapabilities | undefined): boolean {
  // "verify" keeps the door: the existing verify prompt runs when it is used.
  const a = caps?.actions.checkout;
  return a === "yes" || a === "verify";
}
