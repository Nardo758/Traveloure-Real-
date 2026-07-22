/**
 * PartnerizeBookingCTA
 *
 * Primary "book with an expert" action for Partnerize-backed offers, with a
 * secondary direct-link fallback to the affiliate deep link. Mirrors the
 * expert-request flow used by client/src/components/plancard/EscalationCTA.tsx,
 * but scoped to experts who've opted in to booking affiliate offers on a
 * traveler's behalf (requestType: "partnerize_booking_assist").
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { UserCheck, ExternalLink, Loader2, CheckCircle2 } from "lucide-react";

interface PartnerizeBookingCTAProps {
  tripId?: string;
  // Required by POST /api/expert-requests whenever tripId isn't supplied
  // (i.e. non-trip contexts, such as a standalone offer or optimizer variant).
  variantId?: string;
  comparisonId?: string;
  destination?: string;
  partnerName: string;
  partnerId?: string;
  offerTitle: string;
  directUrl: string;
  itemType?: string;
}

export function PartnerizeBookingCTA({
  tripId,
  variantId,
  comparisonId,
  destination,
  partnerName,
  partnerId,
  offerTitle,
  directUrl,
  itemType,
}: PartnerizeBookingCTAProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [requested, setRequested] = useState(false);

  // /api/expert-requests requires either a tripId, or both variantId +
  // comparisonId, for optimizer-based (non-trip) requests. Without one of
  // these the request will always 400 server-side, so we disable the CTA
  // instead of letting the traveler hit a confusing error.
  const canRequestExpert = !!tripId || (!!variantId && !!comparisonId);

  async function handleBookWithExpert() {
    if (!canRequestExpert) {
      toast({
        variant: "destructive",
        title: "Can't request an expert here",
        description: "This offer isn't linked to a trip or plan yet. Use the direct link instead.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/expert-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          requestType: "partnerize_booking_assist",
          tripId,
          variantId,
          comparisonId,
          destination,
          notes: `Please book "${offerTitle}" via ${partnerName} on my behalf.`,
          optimizationContext: {
            source: "partnerize_offer",
            partnerizeAssisted: true,
            partnerId,
            partnerName,
            offerTitle,
            directUrl,
            itemType,
            destination,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      setRequested(true);
      toast({
        title: "Request sent",
        description: "A local expert will handle this booking for you.",
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Couldn't send your request",
        description: err.message ?? "Please try again, or use the direct link instead.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (requested) {
    return (
      <div
        className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 rounded-md px-2.5 py-1.5"
        data-testid="text-partnerize-request-sent"
      >
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        Expert notified — they'll confirm your booking shortly.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        onClick={handleBookWithExpert}
        disabled={submitting || !canRequestExpert}
        title={!canRequestExpert ? "This offer isn't linked to a trip or plan yet" : undefined}
        size="sm"
        className="bg-primary hover:bg-primary/90 text-white"
        data-testid="button-partnerize-book-with-expert"
      >
        {submitting ? (
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        ) : (
          <UserCheck className="h-3.5 w-3.5 mr-1.5" />
        )}
        Book with an expert
      </Button>
      <Button
        asChild
        variant="outline"
        size="sm"
        data-testid="button-partnerize-direct-link"
      >
        <a href={directUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
          Open on {partnerName}
        </a>
      </Button>
    </div>
  );
}
