/**
 * The signed-in member's open plans, and the add-target resolution over them.
 *
 * Open = `isActivePlan` (My plans' "not Past" rule). The add rule in
 * `client/src/lib/trip-target.ts` reads this list and nothing from the tab pen.
 */
import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTrips } from "@/hooks/use-trips";
import { isActivePlan } from "@/lib/add-target";
import {
  openPlansArgument,
  resolveAddPlanTarget,
  toOpenPlanRef,
  type AddItemFit,
  type OpenPlanRef,
} from "@/lib/trip-target";

type TripListRow = {
  id: string;
  title?: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  finalVersion?: number | null;
};

export function useAddPlanResolution(search: string | null | undefined, item?: AddItemFit | null) {
  const { user, isLoading: authLoading } = useAuth();
  const query = useTrips();
  const openPlans = useMemo(() => {
    if (!Array.isArray(query.data)) return [] as OpenPlanRef[];
    const now = new Date();
    return (query.data as TripListRow[])
      .filter((trip) => isActivePlan(trip, now))
      .map(toOpenPlanRef);
  }, [query.data]);
  const signedIn = !!user;
  const known =
    !authLoading &&
    (!signedIn || query.isError || Array.isArray(query.data) || query.data === null);
  const resolution = resolveAddPlanTarget(
    search,
    openPlansArgument({ authLoading, signedIn, known, openPlans }),
    item,
  );
  return { openPlans, resolution, signedIn, authLoading };
}
