/**
 * Generic agent-booking hook (remediation item ④ / §16).
 *
 * The §16-correct way for ANY surface to handle a partner "book" action: route through the
 * in-platform booking-agent rail (POST /api/affiliate-booking-requests) instead of a raw
 * window.open(affiliateUrl). The server keeps the affiliate URL server-side, auto-assigns a booking
 * agent, and logs the confirmed booking onto the traveler's trip — preserving commission and
 * preventing disintermediation.
 *
 * §16 closure: the client never holds (or sends) the affiliate URL at all. The descriptor carries
 * exactly one BOOKING REFERENCE the server resolves to the URL itself:
 *   • bookingToken       — opaque vault token a live feed DTO shipped in place of the URL
 *   • affiliateProductId — affiliate_products registry row id (URL from the DB row)
 *   • transportOptionId  — transport_booking_options row id (URL from the DB row)
 *   • partnerRoute       — { partner: "12go", origin?, destination? }: the server constructs the
 *                          deep link itself (the affiliate id no longer lives in client code)
 *
 * useAgentBooking (travelpayouts/useAgentBooking.ts) is the CatalogItem-typed variant used by the
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
  /** Opaque server-minted vault token from a live feed DTO (§16 — never a URL). */
  bookingToken?: string | null;
  /** affiliate_products registry row id — the server resolves the URL from the row. */
  affiliateProductId?: string | null;
  /** transport_booking_options row id — the server resolves the URL from the row. */
  transportOptionId?: string | null;
  /** Server-side deep-link construction for partners without per-item feeds (e.g. 12Go). */
  partnerRoute?: { partner: "12go"; origin?: string | null; destination?: string | null } | null;
  travelers?: number;
}

export function useContentAgentBooking(descriptor: AgentBookingDescriptor) {
  const { user } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();
  const [requested, setRequested] = useState(false);

  const hasBookingReference = !!(
    descriptor.bookingToken ||
    descriptor.affiliateProductId ||
    descriptor.transportOptionId ||
    descriptor.partnerRoute
  );

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/affiliate-booking-requests", {
        itemName: descriptor.itemName,
        itemDescription: descriptor.itemDescription ?? null,
        partnerName: descriptor.partnerName ?? null,
        partnerCategory: descriptor.partnerCategory ?? null,
        bookingToken: descriptor.bookingToken ?? undefined,
        affiliateProductId: descriptor.affiliateProductId ?? undefined,
        transportOptionId: descriptor.transportOptionId ?? undefined,
        partnerRoute: descriptor.partnerRoute ?? undefined,
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
    if (!hasBookingReference) return;
    if (!user) {
      openSignInModal();
      return;
    }
    if (requested || mutation.isPending) return;
    mutation.mutate();
  };

  return { book, isPending: mutation.isPending, requested };
}
