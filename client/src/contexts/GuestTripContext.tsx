import { createContext, useContext, useEffect, useState } from "react";
import { refreshPlanLists } from "@/lib/plan-lists";

// Guest trips are stored in localStorage as { tripId: shareToken } pairs
// This allows guests to access their draft trips before sign-up.

interface GuestTripContextType {
  guestTrips: Record<string, string>; // tripId → shareToken
  addGuestTrip: (tripId: string, shareToken: string) => void;
  removeGuestTrip: (tripId: string) => void;
  getShareToken: (tripId: string) => string | null;
  claimTrips: (userId: string) => Promise<void>;
}

const GuestTripContext = createContext<GuestTripContextType | undefined>(undefined);

export function GuestTripProvider({ children }: { children: React.ReactNode }) {
  const [guestTrips, setGuestTrips] = useState<Record<string, string>>({});

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("guestTrips");
    if (stored) {
      try {
        setGuestTrips(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse guest trips:", e);
      }
    }
  }, []);

  // Persist to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("guestTrips", JSON.stringify(guestTrips));
  }, [guestTrips]);

  const addGuestTrip = (tripId: string, shareToken: string) => {
    setGuestTrips((prev) => ({ ...prev, [tripId]: shareToken }));
  };

  const removeGuestTrip = (tripId: string) => {
    setGuestTrips((prev) => {
      const { [tripId]: _, ...rest } = prev;
      return rest;
    });
  };

  const getShareToken = (tripId: string): string | null => {
    return guestTrips[tripId] ?? null;
  };

  // Claim all guest trips (called after sign-up)
  const claimTrips = async (userId: string) => {
    const tripIds = Object.keys(guestTrips);
    for (const tripId of tripIds) {
      const shareToken = guestTrips[tripId];
      try {
        await fetch(`/api/trips/${tripId}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shareToken }),
        });
        removeGuestTrip(tripId);
      } catch (err) {
        console.error(`Failed to claim trip ${tripId}:`, err);
      }
    }
    // RC-7 (ledger `2026-09-25-rc7-new-plan-visible`): claimed plans are now this member's —
    // every loaded plan list must see them.
    if (tripIds.length > 0) void refreshPlanLists();
  };

  return (
    <GuestTripContext.Provider
      value={{ guestTrips, addGuestTrip, removeGuestTrip, getShareToken, claimTrips }}
    >
      {children}
    </GuestTripContext.Provider>
  );
}

export function useGuestTrips() {
  const ctx = useContext(GuestTripContext);
  if (!ctx) {
    throw new Error("useGuestTrips must be used within GuestTripProvider");
  }
  return ctx;
}
