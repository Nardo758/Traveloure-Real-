/**
 * PlanCard expert-escalation CTA (CON-A.P7 / N3).
 *
 * One-tap "have an expert polish this" woven into the AI deliverable. Pre-fills
 * an expert_request with the trip + AI snapshot in optimizationContext, lands in
 * the existing routing queue (server/routes/booking-actions.ts:100), respects
 * availability (Phase 4 service → /api/concierge/quote).
 *
 * Always visible, soft style (D2). Bookable-now vs queued copy per D4.
 */
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { UserCheck, Loader2, CheckCircle2, Clock } from "lucide-react";

interface ExpertAvailability {
  priceCents?: number;
  available: boolean;
  etaHours?: number;
}

function formatPrice(cents: number | undefined) {
  if (cents === undefined || cents === null) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function EscalationCTA({
  tripId,
  destination,
  eventType,
  planSnapshot,
}: {
  tripId: string;
  destination?: string;
  eventType?: string;
  planSnapshot?: unknown;
}) {
  const { toast } = useToast();
  const [availability, setAvailability] = useState<ExpertAvailability | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ queued: boolean; etaHours?: number } | null>(null);

  // Availability lookup — reuses the Phase 5 router to get an expert-tier price + ETA.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/concierge/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            intent: `Polish my plan for ${destination ?? "this trip"}`,
            destination,
            eventType,
            tripId,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setAvailability({
          priceCents: data.route?.expert?.priceCents,
          available: !!data.route?.expert?.available,
          etaHours: data.route?.expert?.etaHours,
        });
      } catch {
        // Non-fatal: render the CTA without an availability hint.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId, destination, eventType]);

  async function handleEscalate() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/expert-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          requestType: "review",
          tripId,
          destinationCity: destination,
          notes: "Please review and polish my AI-generated plan.",
          optimizationContext: {
            source: "plancard_escalation",
            tripId,
            destination,
            eventType,
            planSnapshot,
          },
        }),
      });
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      const queued = availability ? !availability.available : false;
      setDone({ queued, etaHours: availability?.etaHours });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Couldn't send your request",
        description: err.message ?? "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Card className="border-primary/30 bg-primary/5" data-testid="plancard-escalation-done">
        <CardContent className="py-3 px-4 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm">
            {done.queued
              ? `Request queued — an expert will reach out (~${done.etaHours ?? 24}h).`
              : "Your request is in. An expert will reach out shortly."}
          </span>
        </CardContent>
      </Card>
    );
  }

  const priceLabel = formatPrice(availability?.priceCents);
  const isQueued = availability !== null && !availability.available;

  return (
    <Card className="border-border" data-testid="plancard-escalation-cta">
      <CardContent className="py-3 px-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <UserCheck className="w-4 h-4 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Have an expert polish this</p>
            <p className="text-xs text-muted-foreground">
              {isQueued ? (
                <>
                  Queued — ETA ~{availability?.etaHours ?? 24}h
                  {priceLabel && <> · from {priceLabel}</>}
                </>
              ) : priceLabel ? (
                <>From {priceLabel} — a local/travel expert reviews and tweaks your plan.</>
              ) : (
                <>A local/travel expert reviews and tweaks your plan.</>
              )}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant={isQueued ? "secondary" : "default"}
          onClick={handleEscalate}
          disabled={submitting}
          data-testid="button-plancard-escalate"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : isQueued ? (
            <Clock className="w-4 h-4 mr-2" />
          ) : (
            <UserCheck className="w-4 h-4 mr-2" />
          )}
          {isQueued ? "Join queue" : "Request expert"}
        </Button>
      </CardContent>
    </Card>
  );
}
