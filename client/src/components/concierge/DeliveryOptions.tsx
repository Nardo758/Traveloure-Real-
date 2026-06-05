/**
 * Concierge DeliveryOptions (CON-A.P6 / D2, D4).
 *
 * Renders priced options for all three Concierge tiers from the /api/concierge/quote
 * response. Recommended tier gets a soft badge (D2). Expert option flips between
 * "book now" and "queued" by availability (D4).
 *
 * CTA wiring (Phase 6 minimum):
 *   AI    → PATCH chosenTier=ai, then hand off to /cart?step=optimize where the
 *           existing Stripe Elements flow handles checkout.
 *   Expert → PATCH chosenTier=expert + POST /api/expert-requests with the AI
 *            snapshot/intent context. Surface success state.
 *   Full   → PATCH chosenTier=full. Surface "admin will follow up" state.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, UserCheck, Crown, Loader2, CheckCircle2, Clock } from "lucide-react";

export interface ConciergeRoute {
  ai: { priceCents: number; currency: string; available: boolean; disabled: boolean };
  expert: { priceCents?: number; available: boolean; etaHours?: number };
  full: { available: boolean; note: string };
  recommended: "ai" | "expert" | "full";
}

function formatPrice(cents: number | undefined, currency = "USD") {
  if (cents === undefined || cents === null) return "—";
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(dollars);
}

export function DeliveryOptions({
  requestId,
  route,
  destination,
  eventType,
  intent,
}: {
  requestId: string;
  route: ConciergeRoute;
  destination?: string;
  eventType?: string;
  intent: string;
}) {
  const [, setLocation] = useLocation();
  const [busy, setBusy] = useState<"ai" | "expert" | "full" | null>(null);
  const [success, setSuccess] = useState<{ tier: "expert" | "full"; message: string } | null>(null);

  async function patchTier(tier: "ai" | "expert" | "full") {
    await fetch(`/api/concierge/requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ chosenTier: tier }),
    });
  }

  async function handleAi() {
    setBusy("ai");
    try {
      await patchTier("ai");
      // Hand off intent + context to cart's existing payment flow.
      sessionStorage.setItem("experienceContext", JSON.stringify({
        experienceType: eventType,
        destination,
        intent,
      }));
      setLocation(`/cart?step=cart&concierge=${requestId}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleExpert() {
    setBusy("expert");
    try {
      await patchTier("expert");
      // Create an expert_request carrying the intent + destination so the routing
      // queue picks it up. Reuses the existing rail per the brief's reuse map.
      await fetch("/api/expert-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          requestType: "review",
          destinationCity: destination,
          notes: intent,
          optimizationContext: {
            source: "concierge_entry",
            conciergeRequestId: requestId,
            intent,
            eventType,
            destination,
          },
        }),
      });
      setSuccess({
        tier: "expert",
        message: route.expert.available
          ? "Your request is in. An expert will reach out shortly."
          : `Your request is queued. ETA ~${route.expert.etaHours ?? 24}h.`,
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleFull() {
    setBusy("full");
    try {
      await patchTier("full");
      setSuccess({
        tier: "full",
        message: "We'll follow up with a personalized quote for your event.",
      });
    } finally {
      setBusy(null);
    }
  }

  if (success) {
    return (
      <Card className="border-primary/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-primary" />
            Request received
          </CardTitle>
          <CardDescription>{success.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="concierge-delivery-options">
      {/* AI Concierge */}
      <Card
        className={route.recommended === "ai" ? "border-primary" : "border-border"}
        data-testid="card-concierge-ai"
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              AI Concierge
            </CardTitle>
            {route.recommended === "ai" && (
              <Badge variant="default" className="text-xs">Recommended</Badge>
            )}
          </div>
          <CardDescription className="text-xs">
            Instant AI-optimized plan. Free re-runs within 24h.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-2xl font-bold">
            {route.ai.disabled ? "Unavailable" : formatPrice(route.ai.priceCents, route.ai.currency)}
          </div>
          <Button
            className="w-full"
            disabled={!route.ai.available || busy !== null}
            onClick={handleAi}
            data-testid="button-concierge-pick-ai"
          >
            {busy === "ai" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {route.ai.disabled ? "Disabled" : "Get plan"}
          </Button>
        </CardContent>
      </Card>

      {/* Expert Concierge */}
      <Card
        className={route.recommended === "expert" ? "border-primary" : "border-border"}
        data-testid="card-concierge-expert"
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-primary" />
              Expert Concierge
            </CardTitle>
            {route.recommended === "expert" && (
              <Badge variant="default" className="text-xs">Recommended</Badge>
            )}
          </div>
          <CardDescription className="text-xs">
            A local/travel expert delivers — human judgment on top of your plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-2xl font-bold">
            {route.expert.priceCents !== undefined
              ? <>from {formatPrice(route.expert.priceCents)}</>
              : <>Quote on request</>}
          </div>
          {!route.expert.available && route.expert.etaHours !== undefined && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              Queued — ETA ~{route.expert.etaHours}h
            </div>
          )}
          <Button
            className="w-full"
            variant={route.expert.available ? "default" : "secondary"}
            disabled={busy !== null}
            onClick={handleExpert}
            data-testid="button-concierge-pick-expert"
          >
            {busy === "expert" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserCheck className="w-4 h-4 mr-2" />}
            {route.expert.available ? "Request expert" : "Join queue"}
          </Button>
        </CardContent>
      </Card>

      {/* Full / Done-for-You */}
      <Card
        className={route.recommended === "full" ? "border-primary" : "border-border"}
        data-testid="card-concierge-full"
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="w-4 h-4 text-primary" />
              Full / Done-for-You
            </CardTitle>
            {route.recommended === "full" && (
              <Badge variant="default" className="text-xs">Recommended</Badge>
            )}
          </div>
          <CardDescription className="text-xs">{route.full.note}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-2xl font-bold">Quote on request</div>
          <Button
            className="w-full"
            variant={route.full.available ? "default" : "outline"}
            disabled={!route.full.available || busy !== null}
            onClick={handleFull}
            data-testid="button-concierge-pick-full"
          >
            {busy === "full" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Crown className="w-4 h-4 mr-2" />}
            {route.full.available ? "Request quote" : "Not available"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
