/**
 * Concierge entry page (CON-A.P6 / N1).
 *
 * One unified surface above Local/Travel Experts. The user states a need; the
 * platform routes to the right delivery tier with prices before commit.
 *
 * Flow:
 *   1. IntentForm captures intent + chips.
 *   2. POST /api/concierge/quote → priced { ai, expert, full } + recommended tier.
 *   3. DeliveryOptions renders the three priced cards with CTAs that record the
 *      tier choice and either hand off (AI → cart for paid flow) or create an
 *      expert_request (Expert) or surface a follow-up message (Full).
 *
 * Replaces the static Paris mock at /optimize, which now 301s here per D9.
 */
import { useState } from "react";
import { Link, useSearch } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { IntentForm, type IntentSubmission } from "@/components/concierge/IntentForm";
import { DeliveryOptions, type ConciergeRoute } from "@/components/concierge/DeliveryOptions";

interface QuoteResponse {
  requestId: string;
  route: ConciergeRoute;
}

export default function ConciergePage() {
  const { toast } = useToast();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const tierHint = params.get("tier"); // /optimize → /concierge?tier=ai (D9)
  const intentHint = params.get("intent") ?? "";
  const eventTypeHint = params.get("eventType") ?? undefined;

  const [submitting, setSubmitting] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [submitted, setSubmitted] = useState<IntentSubmission | null>(null);

  async function handleSubmit(submission: IntentSubmission) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/concierge/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          intent: submission.intent,
          eventType: submission.eventType,
          destination: submission.destination,
        }),
      });
      if (!res.ok) {
        throw new Error(`Quote failed (${res.status})`);
      }
      const data: QuoteResponse = await res.json();
      setQuote(data);
      setSubmitted(submission);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Couldn't price your request",
        description: err.message ?? "Please try again in a moment.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <div className="container py-8 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Concierge</h1>
          <p className="text-muted-foreground mt-1">
            One request → priced options across Platform Concierge (powered by our platform),
            Destination Concierge (powered by local experts), and Full / Done-for-You.
          </p>
          {tierHint === "ai" && !quote && (
            <Card className="mt-3 border-primary/30 bg-primary/5">
              <CardContent className="pt-4 pb-4 text-sm text-muted-foreground">
                Looking for Platform Concierge — powered by our platform? AI-assisted and
                human-backed: our AI gets you started instantly, and our team steps in for
                anything complex. Tell us what you want to plan below and pick Platform Concierge.
              </CardContent>
            </Card>
          )}
        </div>

        <IntentForm
          defaultIntent={intentHint}
          defaultEventType={eventTypeHint}
          loading={submitting}
          onSubmit={handleSubmit}
        />

        {quote && submitted && (
          <DeliveryOptions
            requestId={quote.requestId}
            route={quote.route}
            intent={submitted.intent}
            destination={submitted.destination}
            eventType={submitted.eventType}
          />
        )}

        {/* Destination Concierge marketplace teaser — surfaces the concierge_vip-category
            expert offerings via the EXISTING category-filtered Discover deep-link
            (?categoryKey=, issue #51 upsell pattern) — deliberately not a new browse surface. */}
        <Card data-testid="card-concierge-vip-services">
          <CardContent className="pt-4 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Concierge services by local experts</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                VIP access, skip-the-line fixers, 24/7 personal concierges and more — bookable
                directly from local experts.
              </p>
            </div>
            <Link href="/services?categoryKey=concierge_vip">
              <Button variant="outline" size="sm" data-testid="button-browse-concierge-services">
                Browse services
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
