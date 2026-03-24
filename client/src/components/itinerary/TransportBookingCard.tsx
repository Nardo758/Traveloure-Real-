/**
 * TransportBookingCard Component
 *
 * Renders a single booking option with 4 variants:
 * 1. Platform ("Book on Traveloure") - green badge, Stripe checkout
 * 2. Affiliate ("View on 12Go") - blue badge, external link + mark as booked
 * 3. Deep Link ("Open App") - blue badge, native app or web fallback
 * 4. Info Only (Walking, etc.) - gray label, no action
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink, Star, CheckCircle2, AlertCircle } from "lucide-react";

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
  externalUrl?: string;
  deepLinkScheme?: string;
  isRecommended?: boolean;
  bookingStatus?: string;
  confirmationRef?: string | null;
}

interface TransportBookingCardProps {
  option: TransportBookingOption;
  readOnly?: boolean;
}

export function TransportBookingCard({
  option,
  readOnly = false,
}: TransportBookingCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isConfirmed = option.bookingStatus === "confirmed";
  const isBooked = option.bookingStatus === "booked" || isConfirmed;
  const isCancelled = option.bookingStatus === "cancelled";

  const [hasClicked, setHasClicked] = useState(false);
  const [showMarkBooked, setShowMarkBooked] = useState(false);
  const [confirmationRef, setConfirmationRef] = useState("");
  const [savedConfirmationRef, setSavedConfirmationRef] = useState<string | null>(null);
  const [localBooked, setLocalBooked] = useState(false);

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

  const affiliateClickMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/transport-booking-options/${option.id}/click`, {});
      return res.json();
    },
    onSuccess: (data) => {
      setHasClicked(true);
      if (data.redirectUrl) {
        window.open(data.redirectUrl, "_blank");
      } else if (option.externalUrl) {
        window.open(option.externalUrl, "_blank");
      }
      setTimeout(() => setShowMarkBooked(true), 2000);
    },
    onError: () => {
      if (option.externalUrl) {
        window.open(option.externalUrl, "_blank");
        setHasClicked(true);
        setTimeout(() => setShowMarkBooked(true), 2000);
      } else {
        toast({ title: "Failed to open link", description: "Please try again", variant: "destructive" });
      }
    },
  });

  const markBookedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/transport-booking-options/${option.id}/status`, {
        bookingStatus: "booked",
        confirmationRef: confirmationRef || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      setSavedConfirmationRef(confirmationRef || null);
      setLocalBooked(true);
      toast({ title: "Marked as booked", description: confirmationRef ? `Ref: ${confirmationRef}` : undefined });
      queryClient.invalidateQueries({ queryKey: ["/api/itinerary"] });
      setShowMarkBooked(false);
    },
    onError: () => {
      toast({ title: "Failed to update", variant: "destructive" });
    },
  });

  const effectivelyBooked = localBooked || isBooked;
  const effectivelyConfirmed = isConfirmed;

  const handleDeepLink = () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile && option.deepLinkScheme) {
      window.location.href = option.deepLinkScheme;
    } else {
      const webUrls: Record<string, string> = {
        uber: "https://m.uber.com",
        grab: "https://grab.com/sg/transport/",
        bolt: "https://bolt.eu",
        ola: "https://www.olacabs.com",
        beat: "https://thebeat.co",
        lyft: "https://www.lyft.com",
      };
      const fallback = webUrls[option.source] || option.externalUrl || `https://www.google.com/maps`;
      window.open(fallback, "_blank");
    }
    setHasClicked(true);
  };

  const statusBadge = () => {
    if (isCancelled) {
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 flex items-center gap-1 shrink-0">
          <AlertCircle className="h-3 w-3" /> Cancelled
        </Badge>
      );
    }
    if (effectivelyConfirmed || effectivelyBooked) {
      return (
        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 flex items-center gap-1 shrink-0">
          <CheckCircle2 className="h-3 w-3" /> {effectivelyConfirmed ? "Confirmed" : "Booked"}
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
        return (
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex items-center gap-1 shrink-0">
            <ExternalLink className="h-3 w-3" />
            {getPartnerDisplayName(option.source)}
          </Badge>
        );
      case "deep_link":
        return (
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex items-center gap-1 shrink-0">
            <ExternalLink className="h-3 w-3" />
            Open App
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
    if (isCancelled || effectivelyBooked || effectivelyConfirmed) return null;
    if (option.bookingType === "info_only") return null;

    if (option.bookingType === "platform") {
      return (
        <Button
          onClick={() => bookPlatformMutation.mutate()}
          disabled={readOnly || bookPlatformMutation.isPending}
          size="sm"
          className="bg-[#FF385C] hover:bg-[#E23350] text-white"
          data-testid={`button-book-platform-${option.id}`}
        >
          {bookPlatformMutation.isPending ? "Processing…" : `Book — ${option.priceDisplay || "Select"}`}
        </Button>
      );
    }

    if (option.bookingType === "affiliate") {
      return (
        <Button
          onClick={() => affiliateClickMutation.mutate()}
          disabled={readOnly || affiliateClickMutation.isPending}
          variant="outline"
          size="sm"
          data-testid={`button-view-affiliate-${option.id}`}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
          {affiliateClickMutation.isPending ? "Opening…" : `View on ${getPartnerDisplayName(option.source)}`}
        </Button>
      );
    }

    if (option.bookingType === "deep_link") {
      return (
        <Button
          onClick={handleDeepLink}
          disabled={readOnly}
          variant="outline"
          size="sm"
          data-testid={`button-deeplink-${option.id}`}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
          Open {option.title}
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
      {!readOnly && (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {actionButton()}
          {/* Mark as booked flow for affiliate options after click */}
          {showMarkBooked && !effectivelyBooked && option.bookingType === "affiliate" && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-gray-500 hover:text-gray-800"
              onClick={() => setShowMarkBooked(false)}
              data-testid={`button-mark-booked-${option.id}`}
            >
              ✓ Mark as booked
            </Button>
          )}
        </div>
      )}

      {/* Confirmation ref display — shown when booked/confirmed with a ref */}
      {effectivelyBooked && (savedConfirmationRef || option.confirmationRef) && (
        <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 rounded-md px-2.5 py-1.5" data-testid={`text-confirmation-ref-${option.id}`}>
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          <span>Ref: <span className="font-medium">{savedConfirmationRef || option.confirmationRef}</span></span>
        </div>
      )}

      {/* Mark as booked panel */}
      {showMarkBooked && !effectivelyBooked && (
        <div className="mt-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 space-y-2">
          <p className="text-xs font-medium text-blue-800 dark:text-blue-200">Did you complete the booking?</p>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Confirmation ref (optional)"
              value={confirmationRef}
              onChange={e => setConfirmationRef(e.target.value)}
              className="h-7 text-xs flex-1"
              data-testid={`input-confirmation-ref-${option.id}`}
            />
            <Button
              size="sm"
              className="h-7 text-xs bg-[#FF385C] hover:bg-[#E23350] text-white"
              onClick={() => markBookedMutation.mutate()}
              disabled={markBookedMutation.isPending}
              data-testid={`button-confirm-booked-${option.id}`}
            >
              {markBookedMutation.isPending ? "Saving…" : "Yes, booked"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setShowMarkBooked(false)}
            >
              Not yet
            </Button>
          </div>
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
