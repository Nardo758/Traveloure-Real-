/**
 * Agent-booking hook for affiliate catalog cards (Travelpayouts et al).
 *
 * Platform rule (CLAUDE.md §16): affiliate content must NEVER send the traveler off-site with a
 * raw window.open. Any "book" action on partner-fulfilled content routes through the in-platform
 * booking-agent rail instead — POST /api/affiliate-booking-requests, the same rail Discover's
 * unified-result-card uses. The server auto-assigns a booking agent (expert), keeps the affiliate
 * URL server-side (it is never returned to the client — the agent books through it, preserving
 * commission and preventing disintermediation), and the confirmed booking is logged onto the
 * traveler's trip (migration 051).
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { useToast } from "@/hooks/use-toast";
import type { CatalogItem } from "@/types/catalog";

export function useAgentBooking(item: CatalogItem, partnerCategory: string) {
  const { user } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();
  const [requested, setRequested] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/affiliate-booking-requests", {
        itemName: item.title,
        itemDescription:
          [item.description, item.destination, item.price != null ? `from $${item.price}` : null]
            .filter(Boolean)
            .join(" · ") || null,
        partnerName: item.provider,
        partnerCategory,
        affiliateUrl: item.affiliateUrl || item.bookingUrl,
        travelers: 1,
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
    if (!(item.affiliateUrl || item.bookingUrl)) return;
    if (!user) {
      openSignInModal();
      return;
    }
    if (requested || mutation.isPending) return;
    mutation.mutate();
  };

  return { book, isPending: mutation.isPending, requested };
}
