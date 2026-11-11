/**
 * `useActivePlan()` — the ONE "which plan is current" hook (`client/src/lib/active-plan.ts` is the
 * rule; this reads its inputs). A signed-in member's binding is `?tripId=` on the URL, then the pen's
 * `tripId`; otherwise the most recently updated un-finalized plan in `/api/trips`. The list query is
 * the same `["/api/trips"]` key `useTrips` and the picker read, so there is one fetch and one answer.
 */
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTripContext } from "@/lib/trip-context";
import { boundTripId, pickActivePlan } from "@/lib/active-plan";
import type { HeaderTrip } from "@/lib/header-plan";

export function useActivePlan(): {
  trips: HeaderTrip[] | null;
  bound: string | null;
  active: HeaderTrip | null;
  signedIn: boolean;
  /** Signed in and the list has not answered yet. */
  loading: boolean;
} {
  const { user } = useAuth();
  const search = useSearch();
  const [ctx] = useTripContext();
  const { data, isLoading } = useQuery<HeaderTrip[]>({ queryKey: ["/api/trips"], enabled: !!user });
  const trips = Array.isArray(data) ? data : null;
  const bound = boundTripId(search, ctx.tripId);
  return { trips, bound, active: pickActivePlan(trips, bound), signedIn: !!user, loading: !!user && isLoading };
}
