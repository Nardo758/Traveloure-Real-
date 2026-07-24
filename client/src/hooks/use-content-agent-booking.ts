/**
 * Generic agent-booking hook (remediation item ④ / §16).
 *
 * The §16-correct way for ANY surface to handle a partner "book" action: route through the
 * in-platform booking-agent rail (POST /api/affiliate-booking-requests) instead of a raw
 * window.open(affiliateUrl). The server keeps the affiliate URL server-side, auto-assigns a booking
 * agent, and logs the confirmed booking onto the traveler's trip — preserving commission and
 * preventing disintermediation.
 *
 * useAgentBooking (travelpayouts/useAgentBooking.ts) is the CatalogItem-typed variant used by the 10
 * catalog cards. This hook is the same rail but accepts a plain descriptor, so non-catalog surfaces
 * (Fever events, TravelPulse booking options, affiliate transport, curated cards, …) can adopt the
 * rail without a CatalogItem. Same endpoint, same behavior.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { useToast } from "@/hooks/use-toast";

export interface AgentBookingDescriptor {
  itemName: string;
  itemDescription?: string | null;
  partnerName?: string | null;
  partnerCategory?: string | null;
  /** The affiliate/booking URL. Sent to the server (which keeps it private); never opened client-side. */
  affiliateUrl?: string | null;
  travelers?: number;
}

export function useContentAgentBooking(descriptor: AgentBookingDescriptor) {
  const { user } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();
  const [requested, setRequested] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/affiliate-booking-requests", {
        itemName: descriptor.itemName,
        itemDescription: descriptor.itemDescription ?? null,
        partnerName: descriptor.partnerName ?? null,
        partnerCategory: descriptor.partnerCategory ?? null,
        affiliateUrl: descriptor.affiliateUrl ?? null,
        travelers: descriptor.travelers ?? 1,
      }),
    onSuccess: () => {
      setRequested(true);
      toast({
        title: "Booking request sent",
        description: "Our booking agent will handle this and add it to your trip.",
      });
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Couldn't send request",
        description: err?.message || "Please try again.",
      });
    },
  });

  const book = () => {
    if (!descriptor.affiliateUrl) return;
    if (!user) {
      openSignInModal();
      return;
    }
    if (requested || mutation.isPending) return;
    mutation.mutate();
  };

  return { book, isPending: mutation.isPending, requested };
}
