/**
 * FULL / DONE-FOR-YOU — the one concierge tier that is NOT a way to build a plan.
 * Ledger `2026-09-07-concierge-door`; CLAUDE.md Locked Decision 45 (2).
 *
 * WHAT THIS FILE IS. It is what survives of `DeliveryOptions.tsx`, whose three priced cards were
 * the concierge page's own copy of the three-tier chooser — the third copy of one question, which
 * the ruling collapsed into the plan modal's finish (brief §1/§2). The AI and Destination
 * Concierge cards are GONE: those two tiers ARE finishes now (`client/src/lib/concierge-tiers.ts`
 * holds the map), so offering them here as well would be the drift the ruling closed.
 *
 * WHY THIS ONE STAYS, and why it stays HERE rather than becoming a fifth finish. Done-for-you is
 * a coordination ENGAGEMENT: `PATCH /api/concierge/requests/:id` with `chosenTier: "full"` mints a
 * real `coordination_states` row for a signed-in traveler — the §7 coordination-fee rail — and
 * hands a guest a claim token instead. That rail already exists, it is money-adjacent, and this
 * lane is forbidden to invent a new money path, so it is offered unchanged beside the door rather
 * than mapped onto a finish it does not correspond to. Nothing about the rail changed in this
 * lane: same endpoint, same guest/claim behaviour, same landing on `/my-events`.
 *
 * §13: a tier with no quoted price says "Quote on request" — never a fabricated 0 — and a server
 * answer that carries neither an engagement nor a guest marker is reported as a failure rather
 * than dressed up as a success.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Loader2, CheckCircle2, LogIn } from "lucide-react";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { patchConciergeTier, rememberGuestConciergeRequest } from "@/lib/concierge-request";

export interface DoneForYouOffer {
  available: boolean;
  priceFromCents?: number;
  packageCount?: number;
  note: string;
}

function formatPrice(cents: number | undefined, currency = "USD") {
  if (cents === undefined || cents === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function DoneForYouCard({
  requestId,
  offer,
  recommended = false,
  isEvent = false,
}: {
  requestId: string;
  offer: DoneForYouOffer;
  recommended?: boolean;
  isEvent?: boolean;
}) {
  const [, setLocation] = useLocation();
  const { openSignInModal } = useSignInModal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; isGuest: boolean } | null>(null);

  async function request() {
    setError(null);
    setBusy(true);
    try {
      // PATCH chosenTier=full creates (or reuses) a real coordination engagement for a signed-in
      // traveler and returns its coordinationId — link the traveler straight to it.
      const res = await patchConciergeTier(requestId, "full");
      let hasEngagement = false;
      let isGuest = false;
      let claimToken: string | undefined;
      let serverError = false;
      try {
        const data = res ? await res.json() : null;
        hasEngagement = Boolean(data?.coordinationId);
        isGuest = Boolean(data?.isGuest);
        claimToken = data?.claimToken ?? undefined;
        // No coordinationId and NOT a guest is a silent server error — never a sign-in prompt for
        // someone who is already signed in.
        if (!hasEngagement && !isGuest) serverError = true;
      } catch {
        /* non-JSON — treat as a server error for safety */
        serverError = true;
      }

      if (serverError) {
        setError("Something went wrong. Please try again.");
        return;
      }

      if (!hasEngagement && isGuest) {
        // Guest path: no coordination row was created (auth-gated). Store the requestId + HMAC
        // claim token so the post-auth hook (`useClaimGuestConcierge`) can claim it. THIS is the
        // one place a guest's token is stored, and it is deliberately not moved earlier in the
        // funnel: the claim route defaults an unclaimed row to the FULL tier, so storing a token
        // for a traveler who never picked done-for-you would mint them an engagement they never
        // asked for on their next sign-in.
        rememberGuestConciergeRequest(requestId, claimToken);
      }

      setSuccess({
        isGuest: !hasEngagement && isGuest,
        message: hasEngagement
          ? "Your event coordination is set up. Track its status and pay the coordination fee under My Events."
          : "We'll follow up with a personalized quote for your event.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <Card className="border-primary/40" data-testid="card-concierge-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="w-5 h-5 text-primary" />
            Request received
          </CardTitle>
          <CardDescription>{success.message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {success.isGuest ? (
            <>
              <p className="text-sm text-muted-foreground">
                Sign in or create a free account to track your coordination and receive your quote.
              </p>
              <Button
                className="w-full"
                onClick={() =>
                  openSignInModal({
                    title: "Sign in to track your coordination",
                    description:
                      "Create a free account or sign in to link this request to your profile and receive your personalized quote.",
                    returnTo: "/my-events",
                  })
                }
                data-testid="button-sign-in-to-track"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Sign in to track your coordination
              </Button>
            </>
          ) : (
            <Button onClick={() => setLocation("/my-events")} data-testid="button-view-my-events">
              View My Events
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={recommended ? "border-primary" : "border-border"} data-testid="card-concierge-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="w-4 h-4 text-primary" />
            Full / Done-for-You
          </CardTitle>
          {recommended && (
            <Badge variant="default" className="text-xs">
              {isEvent ? "Premium" : "Recommended"}
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs">{offer.note}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-bold">
          {/* §13 — no quoted price says so; it is never rendered as a number nobody quoted. */}
          {offer.priceFromCents ? <>from {formatPrice(offer.priceFromCents)}</> : <>Quote on request</>}
        </div>
        <Button
          className="w-full"
          variant={offer.available ? "default" : "outline"}
          disabled={!offer.available || busy}
          onClick={() => void request()}
          data-testid="button-concierge-pick-full"
        >
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Crown className="w-4 h-4 mr-2" />}
          {offer.available ? "Request quote" : "Not available"}
        </Button>
        {error && (
          <p className="text-sm text-destructive" data-testid="text-full-error">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default DoneForYouCard;
