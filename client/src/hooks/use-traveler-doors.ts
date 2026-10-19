import { useQuery } from "@tanstack/react-query";
import { TRAVELER_DOORS_ROUTE, travelerDoors, type TravelerDoors } from "@shared/traveler-doors";

/**
 * The two switched traveler doors (ledger `2026-10-18-traveler-doors-hidden`). Every door is closed while the read
 * is loading or failed, and closed unless the server answers `true` for it.
 */
export function useTravelerDoors(): TravelerDoors & { settled: boolean } {
  const q = useQuery<TravelerDoors>({ queryKey: [TRAVELER_DOORS_ROUTE], staleTime: 60_000, retry: false });
  return { ...travelerDoors(q.data), settled: !q.isLoading };
}
