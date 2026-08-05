/**
 * TransportBookingCard Component
 *
 * Renders a single booking option with 4 variants:
 * 1. Platform ("Book on Traveloure") - green badge, Stripe checkout
 * 2. Affiliate - blue badge, booking-agent rail (§16)
 * 3. Deep Link - blue badge, booking-agent rail (§16)
 * 4. Info Only (Walking, etc.) - gray label, no action
 *
 * §16 (CLAUDE.md): affiliate/deep-link options never open a partner URL from the client.
 * The transport-hub DTO strips externalUrl server-side (hasBookingLink flag only) and the
 * "book" action routes through the booking-agent rail (POST /api/affiliate-booking-requests)
 * with a transportOptionId reference — the server re-resolves the partner URL from the
 * transport_booking_options row and a booking agent completes the booking. When an option
 * has no server-side URL to derive (hasBookingLink false), the card shows an honest
 * no-link state — never a homepage guess.
 */

import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, CheckCircle2, AlertCircle, UserCheck } from "lucide-react";
import { useContentAgentBooking } from "@/hooks/use-content-agent-booking";
import { PartnerizeBookingCTA } from "./PartnerizeBookingCTA";

interface TransportBookingOption {
  id: string;
  bookingType: "platform" | "affiliate" | "deep_link" | "info_only";
  source: string;
  title: string;
  description?: string;
  modeType: string;
  iconType?: string;
  priceDisplay?: string;
  estimatedMinutes?: number;
  rating?: number;
  reviewCount?: number;
  /** §16: the server never ships externalUrl — only whether a bookable link exists. */
  hasBookingLink?: boolean;
  isRecommended?: boolean;
  bookingStatus?: string;
  confirmationRef?: string | null;
  isPartnerizeSourced?: boolean;
  partnerizePartnerId?: string;
}

interface TransportBookingCardProps {
  option: TransportBookingOption;
  readOnly?: boolean;
  tripId?: string;
  destination?: string;
}

export function TransportBookingCard({
  option,
  readOnly = false,
  tripId,
  destination,
}: TransportBookingCardProps) {
  const { toast } = useToast();

  const isConfirmed = option.bookingStatus === "confirmed";
  const isBooked = option.bookingStatus === "booked" || isConfirmed;
  const isCancelled = option.bookingStatus === "cancelled";

  const bookPlatformMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/transport-booking-options/${option.id}/book`, {
        travelers: 1,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Booking initiated", description: "Redirecting to checkout..." });
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    },
    onError: () => {
      toast({ title: "Booking failed", description: "Could not initiate booking", variant: "destructive" });
    },
  });

  // §16 booking-agent rail — the server resolves the partner URL from the
  // transport_booking_options row (transportOptionId); the client never holds it.
  const agentBooking = useContentAgentBooking({
    itemName: option.title,
    itemDescription:
      [option.description, destination, option.priceDisplay].filter(Boolean).join(" · ") || null,
    partnerName: getPartnerDisplayName(option.source),
    partnerCategory: "ground-transport",
    transportOptionId: option.id,
  });

  const isExternalType = option.bookingType === "affiliate" || option.bookingType === "deep_link";

  const statusBadge = () => {
    if (isCancelled) {
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 flex items-center gap-1 shrink-0">
          <AlertCircle className="h-3 w-3" /> Cancelled
        </Badge>
      );
    }
    if (isConfirmed || isBooked) {
      return (
        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 flex items-center gap-1 shrink-0">
          <CheckCircle2 className="h-3 w-3" /> {isConfirmed ? "Confirmed" : "Booked"}
        </Badge>
      );
    }
    switch (option.bookingType) {
      case "platform":
        return (
          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 shrink-0">
            Book on Traveloure
          </Badge>
        );
      case "affiliate":
      case "deep_link":
        return (
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex items-center gap-1 shrink-0">
            <UserCheck className="h-3 w-3" />
            {getPartnerDisplayName(option.source)}
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-gray-500 shrink-0">
            Free
          </Badge>
        );
    }
  };

  const actionButton = () => {
    if (isCancelled || isBooked || isConfirmed) return null;
    if (option.bookingType === "info_only") return null;

    if (option.bookingType === "platform") {
      return (
        <Button
          onClick={() => bookPlatformMutation.mutate()}
          disabled={readOnly || bookPlatformMutation.isPending}
          size="sm"
          className="bg-primary hover:bg-primary/90 text-white"
          data-testid={`button-book-platform-${option.id}`}
        >
          {bookPlatformMutation.isPending ? "Processing…" : `Book — ${option.priceDisplay || "Select"}`}
        </Button>
      );
    }

    if (isExternalType) {
      // Honest no-link state: no server-derivable booking URL for this option —
      // never guess a partner homepage (§16).
      if (!option.hasBookingLink) {
        return (
          <span
            className="text-xs text-gray-400 dark:text-gray-500 italic"
            data-testid={`text-no-booking-link-${option.id}`}
          >
            No booking link available
          </span>
        );
      }
      if (agentBooking.requested) {
        return (
          <span
            className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-300"
            data-testid={`text-agent-requested-${option.id}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Booking request sent
          </span>
        );
      }
      return (
        <Button
          onClick={agentBooking.book}
          disabled={readOnly || agentBooking.isPending}
          variant="outline"
          size="sm"
          data-testid={`button-book-via-agent-${option.id}`}
        >
          <UserCheck className="h-3.5 w-3.5 mr-1.5" />
          {agentBooking.isPending ? "Sending…" : "Book via agent"}
        </Button>
      );
    }
    return null;
  };

  return (
    <div
      className="rounded-lg border border-gray-200 dark:border-gray-700 p-3.5 space-y-2.5 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
      data-testid={`card-transport-option-${option.id}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <span className="text-xl shrink-0 mt-0.5">{getIcon(option)}</span>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm text-gray-900 dark:text-white">{option.title}</h4>
            {option.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{option.description}</p>
            )}
          </div>
        </div>
        {statusBadge()}
      </div>

      {/* Details row */}
      <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500 dark:text-gray-400">
        {option.rating && (
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            {option.rating} ({option.reviewCount?.toLocaleString()})
          </span>
        )}
        {option.estimatedMinutes && (
          <span>⏱ {option.estimatedMinutes} min</span>
        )}
        {option.priceDisplay && (
          <span className="font-medium text-gray-700 dark:text-gray-300">{option.priceDisplay}</span>
        )}
        {option.isRecommended && (
          <Badge variant="secondary" className="text-xs py-0">Recommended</Badge>
        )}
      </div>

      {/* Action row */}
      {!readOnly && option.isPartnerizeSourced && option.bookingType === "affiliate" && !isBooked && !isConfirmed && !isCancelled && (
        <div className="pt-1">
          <PartnerizeBookingCTA
            tripId={tripId}
            destination={destination}
            partnerName={option.title}
            partnerId={option.partnerizePartnerId}
            offerTitle={option.title}
            transportOptionId={option.id}
            itemType={option.modeType}
          />
        </div>
      )}
      {!readOnly && !(option.isPartnerizeSourced && option.bookingType === "affiliate") && (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {actionButton()}
        </div>
      )}

      {/* Confirmation ref display — shown when booked/confirmed with a ref */}
      {isBooked && option.confirmationRef && (
        <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 rounded-md px-2.5 py-1.5" data-testid={`text-confirmation-ref-${option.id}`}>
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          <span>Ref: <span className="font-medium">{option.confirmationRef}</span></span>
        </div>
      )}
    </div>
  );
}

function getIcon(option: TransportBookingOption): string {
  if (option.iconType && option.iconType.length <= 2) return option.iconType;
  const icons: Record<string, string> = {
    walk: "🚶", transit: "🚇", train: "🚄", bus: "🚌", tram: "🚊",
    taxi: "🚕", rideshare: "🚗", private_driver: "🚐", private_car: "🚙",
    bike: "🚴", ferry: "⛴️", rental_car: "🚙", transit_pass: "🎫",
  };
  return icons[option.modeType] || "🚌";
}

function getPartnerDisplayName(source: string): string {
  const names: Record<string, string> = {
    "12go": "12Go", viator: "Viator", getyourguide: "GetYourGuide",
    klook: "Klook", booking_com: "Booking.com", uber: "Uber",
    bolt: "Bolt", grab: "Grab", ola: "Ola", beat: "Beat", traveloure: "Traveloure",
  };
  return names[source] || source;
}
