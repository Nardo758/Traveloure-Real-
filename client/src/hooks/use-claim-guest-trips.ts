import { useEffect } from "react";
import { useAuth } from "./use-auth";
import { useGuestTrips } from "@/contexts/GuestTripContext";

/**
 * Automatically claims guest trips when a user signs up.
 * Call this hook from a top-level component to wire it in.
 */
export function useClaimGuestTrips() {
  const { user } = useAuth();
  const { guestTrips, claimTrips } = useGuestTrips();

  useEffect(() => {
    // When user becomes authenticated and they have guest trips, claim them
    if (user && Object.keys(guestTrips).length > 0) {
      claimTrips(user.id);
    }
  }, [user?.id, guestTrips, claimTrips]);
}
