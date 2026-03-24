/**
 * MultiDayPassCard Component
 *
 * Displays a multi-day transport pass recommendation
 * Shows: pass name, description, price, savings, rating, validity
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExternalLink, Star, TrendingDown } from "lucide-react";

interface MultiDayPass {
  id: string;
  title: string;
  description: string;
  iconType?: string;
  priceDisplay: string;
  passValidDays: number;
  savingsVsIndividual?: number;
  rating?: number;
  reviewCount?: number;
  externalUrl?: string;
  source: string;
  isRecommended?: boolean;
}

interface MultiDayPassCardProps {
  pass: MultiDayPass;
  readOnly?: boolean;
}

export function MultiDayPassCard({ pass, readOnly = false }: MultiDayPassCardProps) {
  const { toast } = useToast();
  const [isClicked, setIsClicked] = useState(false);

  // Affiliate click mutation
  const clickMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/transport-booking-options/${pass.id}/click`, {});
    },
    onSuccess: (data) => {
      setIsClicked(true);
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

  const handleViewPass = () => {
    if (readOnly || isClicked) return;
    clickMutation.mutate();
  };

  const savingsAmount = pass.savingsVsIndividual ? (pass.savingsVsIndividual / 100).toFixed(2) : null;

  return (
    <Card className="p-4 space-y-3 hover:border-primary/50 transition-colors border-2 border-amber-200 dark:border-amber-800">
      {/* Header: Icon, Title, Recommended Badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="text-2xl shrink-0">{getPassIcon(pass)}</span>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm">{pass.title}</h4>
            {pass.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{pass.description}</p>
            )}
          </div>
        </div>
        {pass.isRecommended && (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 shrink-0">
            Recommended
          </Badge>
        )}
      </div>

      {/* Key Info: Price, Validity, Savings */}
      <div className="grid grid-cols-3 gap-3 text-center text-xs bg-muted/50 rounded-lg p-3">
        <div>
          <div className="font-semibold text-base">{pass.priceDisplay}</div>
          <div className="text-muted-foreground">Price</div>
        </div>
        <div>
          <div className="font-semibold text-base">{pass.passValidDays}d</div>
          <div className="text-muted-foreground">Valid</div>
        </div>
        {savingsAmount && (
          <div>
            <div className="font-semibold text-base text-green-600 dark:text-green-400 flex items-center justify-center gap-1">
              <TrendingDown className="h-3 w-3" />
              ${savingsAmount}
            </div>
            <div className="text-muted-foreground">Saves</div>
          </div>
        )}
      </div>

      {/* Rating and Details */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {pass.rating && (
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span>{pass.rating} ({pass.reviewCount} reviews)</span>
          </div>
        )}
        <span className="capitalize text-xs font-medium text-amber-700 dark:text-amber-300">
          {getPartnerName(pass.source)}
        </span>
      </div>

      {/* Action Button */}
      <Button
        onClick={handleViewPass}
        disabled={isClicked || readOnly || clickMutation.isPending}
        variant="outline"
        size="sm"
        className="w-full justify-center gap-2"
      >
        {clickMutation.isPending ? (
          <>
            <span className="animate-spin">⏳</span>
            Loading...
          </>
        ) : (
          <>
            <ExternalLink className="h-3 w-3" />
            {isClicked ? "Opened" : `View on ${getPartnerName(pass.source)}`}
          </>
        )}
      </Button>

      {/* Savings Info */}
      {savingsAmount && (
        <div className="text-xs bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300 rounded-lg p-2 text-center">
          💰 Save ~${savingsAmount} compared to buying individual tickets
        </div>
      )}
    </Card>
  );
}

/**
 * Get icon for pass type
 */
function getPassIcon(pass: MultiDayPass): string {
  if (pass.iconType) return pass.iconType;
  return "🚇"; // Default to transit icon
}

/**
 * Get partner display name
 */
function getPartnerName(source: string): string {
  const names: Record<string, string> = {
    "12go": "12Go",
    viator: "Viator",
    getyourguide: "GetYourGuide",
    klook: "Klook",
    booking_com: "Booking.com",
  };
  return names[source] || source;
}
