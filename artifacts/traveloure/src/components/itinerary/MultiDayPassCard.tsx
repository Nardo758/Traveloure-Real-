/**
 * MultiDayPassCard Component
 *
 * Displays a multi-day transport pass recommendation
 * Shows: pass name, description, price, savings, rating, validity
 *
 * §16 (CLAUDE.md): the pass is a transport_booking_options row; the hub DTO strips
 * externalUrl (hasBookingLink flag only) and "book" routes through the booking-agent
 * rail (POST /api/affiliate-booking-requests, transportOptionId reference) — the
 * former POST /:id/click → window.open(redirectUrl) off-site hop is gone. When no
 * server-side URL exists, the card shows an honest no-link state.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Star, TrendingDown, UserCheck, CheckCircle2 } from "lucide-react";
import { useContentAgentBooking } from "@/hooks/use-content-agent-booking";

export interface MultiDayPass {
  id: string;
  title: string;
  description: string;
  iconType?: string;
  priceDisplay: string;
  passValidDays: number;
  savingsVsIndividual?: number;
  rating?: number;
  reviewCount?: number;
  /** §16: the server never ships externalUrl — only whether a bookable link exists. */
  hasBookingLink?: boolean;
  source: string;
  isRecommended?: boolean;
}

interface MultiDayPassCardProps {
  pass: MultiDayPass;
  readOnly?: boolean;
}

export function MultiDayPassCard({ pass, readOnly = false }: MultiDayPassCardProps) {
  const agentBooking = useContentAgentBooking({
    itemName: pass.title,
    itemDescription:
      [pass.description, `${pass.passValidDays}-day pass`, pass.priceDisplay].filter(Boolean).join(" · ") || null,
    partnerName: getPartnerName(pass.source),
    partnerCategory: "transport-pass",
    transportOptionId: pass.id,
  });

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

      {/* Action: booking-agent rail, or honest no-link state (§16) */}
      {pass.hasBookingLink ? (
        agentBooking.requested ? (
          <div
            className="flex items-center justify-center gap-1.5 text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/20 rounded-lg p-2"
            data-testid={`text-pass-agent-requested-${pass.id}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Booking request sent
          </div>
        ) : (
          <Button
            onClick={agentBooking.book}
            disabled={readOnly || agentBooking.isPending}
            variant="outline"
            size="sm"
            className="w-full justify-center gap-2"
            data-testid={`button-pass-book-via-agent-${pass.id}`}
          >
            <UserCheck className="h-3 w-3" />
            {agentBooking.isPending ? "Sending…" : "Book via agent"}
          </Button>
        )
      ) : (
        <div
          className="text-xs text-muted-foreground italic text-center py-1"
          data-testid={`text-pass-no-booking-link-${pass.id}`}
        >
          No booking link available
        </div>
      )}

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
