/**
 * TransportBookingCard Component
 *
 * Renders a single booking option with 4 variants:
 * 1. Platform ("Book on Traveloure") - green badge, Stripe checkout
 * 2. Affiliate ("View on 12Go") - blue badge, external link
 * 3. Deep Link ("Open App") - blue badge, app deep link
 * 4. Info Only (Walking, etc.) - no action
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Zap, Star } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

interface TransportBookingCardProps {
  option: TransportBookingOption;
  readOnly?: boolean;
  onBookingClick?: (optionId: string) => void;
}

export function TransportBookingCard({
  option,
  readOnly = false,
  onBookingClick,
}: TransportBookingCardProps) {
  const { toast } = useToast();
  const [isBooked, setIsBooked] = useState(option.bookingStatus === "booked" || option.bookingStatus === "confirmed");

  // Platform booking mutation
  const bookPlatformMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/transport-booking-options/${option.id}/book`, {
        travelers: 1, // Default to 1 traveler, could be extended with form input
        specialRequests: undefined,
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Booking initiated",
        description: "Redirecting to checkout...",
      });
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
    onError: () => {
      toast({
        title: "Booking failed",
        description: "Could not initiate booking",
        variant: "destructive",
      });
    },
  });

  // Affiliate click mutation
  const affiliateClickMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/transport-booking-options/${option.id}/click`, {});
    },
    onSuccess: (data) => {
      if (data.redirectUrl) {
        window.open(data.redirectUrl, "_blank");
      }
    },
    onError: () => {
      toast({
        title: "Failed to open link",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const getBadge = () => {
    if (isBooked) {
      return (
        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
          ✓ Booked
        </Badge>
      );
    }

    switch (option.bookingType) {
      case "platform":
        return (
          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
            Book on Traveloure
          </Badge>
        );
      case "affiliate":
        return (
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            {getPartnerDisplayName(option.source)}
          </Badge>
        );
      case "deep_link":
        return (
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            Open App
          </Badge>
        );
      default:
        return null;
    }
  };

  const getButtonText = () => {
    if (isBooked) return "Booked";
    switch (option.bookingType) {
      case "platform":
        return `Book — ${option.priceDisplay || "Free"}`;
      case "affiliate":
        return `View on ${getPartnerDisplayName(option.source)}`;
      case "deep_link":
        return `Open ${option.title}`;
      default:
        return null;
    }
  };

  const handleAction = () => {
    if (readOnly || isBooked) return;

    switch (option.bookingType) {
      case "platform":
        bookPlatformMutation.mutate();
        break;
      case "affiliate":
        affiliateClickMutation.mutate();
        break;
      case "deep_link":
        if (option.deepLinkScheme) {
          window.location.href = option.deepLinkScheme;
        }
        break;
    }
  };

  return (
    <div className="rounded-lg border border-border p-4 space-y-3 hover:border-primary/50 transition-colors">
      {/* Header: Icon, Title, Badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="text-2xl shrink-0">{getIcon(option)}</span>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm">{option.title}</h4>
            {option.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
            )}
          </div>
        </div>
        {getBadge()}
      </div>

      {/* Details: Duration, Cost, Rating */}
      <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
        {option.estimatedMinutes && (
          <span className="flex items-center gap-1">
            ⏱️ {option.estimatedMinutes} min
          </span>
        )}
        {option.priceDisplay && (
          <span className="flex items-center gap-1">
            💰 {option.priceDisplay}
          </span>
        )}
        {option.rating && (
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            {option.rating} ({option.reviewCount})
          </span>
        )}
        {option.isRecommended && (
          <Badge variant="secondary" className="text-xs">
            Recommended
          </Badge>
        )}
      </div>

      {/* Action Button or Info */}
      {option.bookingType !== "info_only" && (
        <div className="pt-2">
          <Button
            onClick={handleAction}
            disabled={isBooked || readOnly || bookPlatformMutation.isPending || affiliateClickMutation.isPending}
            variant={option.bookingType === "platform" ? "default" : "outline"}
            size="sm"
            className="w-full"
          >
            {bookPlatformMutation.isPending || affiliateClickMutation.isPending ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                {getButtonText()}
              </>
            ) : (
              getButtonText()
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Get icon for transport mode
 */
function getIcon(option: TransportBookingOption): string {
  if (option.iconType) return option.iconType;

  const icons: Record<string, string> = {
    walk: "🚶",
    transit: "🚇",
    train: "🚄",
    bus: "🚌",
    tram: "🚊",
    taxi: "🚕",
    rideshare: "🚗",
    private_driver: "🚐",
    private_car: "🚙",
    bike: "🚴",
    ferry: "⛴️",
    rental_car: "🚙",
    transit_pass: "🚇",
  };

  return icons[option.modeType] || "🚌";
}

/**
 * Get display name for partner
 */
function getPartnerDisplayName(source: string): string {
  const names: Record<string, string> = {
    "12go": "12Go",
    viator: "Viator",
    getyourguide: "GetYourGuide",
    klook: "Klook",
    booking_com: "Booking.com",
    uber: "Uber",
    bolt: "Bolt",
    grab: "Grab",
    ola: "Ola",
    beat: "Beat",
    traveloure: "Traveloure",
  };

  return names[source] || source;
}
