// Item 2 Phase 2 (ledger 2026-08-23-item2-affiliate): the "Book via your Traveloure agent" CTA on
// an affiliate-grounded itinerary item. Self-guarding — renders null unless resolveAffiliateBooking
// says the item is agent-bookable, so it is INERT on every item until the server lane (Phase 2b)
// stamps `affiliateBooking`. Mirrors UpNextHero's BookRideButton verbatim (one agent-rail pattern).
//
// §16: books through POST /api/affiliate-booking-requests with the opaque server-minted
// `bookingToken` only. The affiliate URL is never held by the client; the booking agent resolves it
// server-side, preserving commission and keeping the traveler on-platform. No client-side redirect.
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { useToast } from "@/hooks/use-toast";
import { resolveAffiliateBooking, type AffiliateGroundable } from "./affiliate-booking";

export function AffiliateBookButton({
  activity,
  testId,
}: {
  activity: AffiliateGroundable & { name?: string; location?: string };
  testId?: string;
}) {
  const booking = resolveAffiliateBooking(activity);
  const { user } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/affiliate-booking-requests", {
        itemName: booking?.title || activity.name || "Activity",
        itemDescription:
          [activity.location, booking?.price != null ? `from $${booking.price}` : null]
            .filter(Boolean)
            .join(" · ") || null,
        partnerName: booking?.partnerName ?? null,
        partnerCategory: "activity",
        // §16 closure: opaque server-minted vault token — the client never holds the URL.
        bookingToken: booking?.bookingToken,
        travelers: 1,
      }),
    onSuccess: () => {
      toast({ title: "Booking request sent", description: "Our booking agent will handle this and add it to your trip." });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Couldn't send request", description: err?.message || "Please try again." });
    },
  });

  // Presence-guard: nothing to book here (the common case for every item today) → render nothing.
  if (!booking) return null;

  const done = mutation.isSuccess;
  const handleClick = () => {
    if (!user) {
      openSignInModal();
      return;
    }
    if (mutation.isPending || done) return;
    mutation.mutate();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={mutation.isPending || done}
      className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-primary text-primary-foreground disabled:opacity-70"
      data-testid={testId || "button-affiliate-book"}
    >
      <Sparkles className="w-3 h-3" />
      {done ? "Requested ✓" : mutation.isPending ? "Sending…" : "Book via your Traveloure agent"}
    </button>
  );
}
