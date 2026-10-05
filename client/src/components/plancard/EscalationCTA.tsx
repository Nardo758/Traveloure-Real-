/**
 * PlanCard expert-escalation CTA (CON-A.P7 / N3).
 *
 * One-tap "have an expert polish this" woven into the AI deliverable. Since R323 (step 7b) it
 * opens the slip's ONE handoff chooser rather than filing a request of its own; availability is
 * still read from the Phase 4 service (/api/concierge/quote).
 *
 * Always visible, soft style (D2). Bookable-now vs queued copy per D4.
 *
 * The "polish this" CTA resolves to the ai_plan_polish expert offering type ($49.99 tier). // fee-literal-ok: UI comment describing band name, fee resolves from config
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { UserCheck, Loader2, CheckCircle2, Clock } from "lucide-react";

interface ExpertOfferingType {
  offering_type_key: string;
  service_tier: string;
  display_name: string;
  tagline: string | null;
  base_price_cents: number | null;
}

function useAiPlanPolishOffering() {
  return useQuery<ExpertOfferingType | null>({
    queryKey: ["/api/offering-types/experts", "ai_plan_polish"],
    queryFn: async () => {
      const res = await fetch("/api/offering-types/experts");
      if (!res.ok) return null;
      const list: ExpertOfferingType[] = await res.json();
      return list.find((o) => o.offering_type_key === "ai_plan_polish") ?? null;
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
}

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
  const [, navigate] = useLocation();
  const { data: polishOffering } = useAiPlanPolishOffering();
  const [availability, setAvailability] = useState<ExpertAvailability | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done] = useState<{ queued: boolean; etaHours?: number } | null>(null);

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

  // R323 (step 7b, surface spec §10 "one expert door, one `expert_requests` route"): the CTA no
  // longer files its own request — it opens the plan's slip with the ONE handoff chooser, which
  // quotes from the server, holds the fee and sends the ask.
  function handleEscalate() {
    setSubmitting(true);
    navigate(`/plans/${tripId}?handoff=open`);
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

  const polishDisplayName = polishOffering?.display_name ?? "AI Plan Polish";
  const polishPriceCents = polishOffering?.base_price_cents ?? null;
  const polishPriceLabel = formatPrice(polishPriceCents ?? undefined);

  return (
    <Card className="border-border" data-testid="plancard-escalation-cta">
      <CardContent className="py-3 px-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <UserCheck className="w-4 h-4 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium">{polishDisplayName}</p>
              {polishPriceLabel && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                  {polishPriceLabel}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {isQueued ? (
                <>
                  Queued — ETA ~{availability?.etaHours ?? 24}h
                  {priceLabel && <> · from {priceLabel}</>}
                </>
              ) : polishOffering?.tagline ? (
                <>{polishOffering.tagline}</>
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
          className={isQueued ? undefined : "text-white"}
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
