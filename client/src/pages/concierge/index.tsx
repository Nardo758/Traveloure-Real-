/**
 * THE CONCIERGE PAGE IS A DOOR — ledger `2026-09-07-concierge-door`; CLAUDE.md Locked Decision
 * 45 (2), on the `/quick-start` retirement pattern (Locked Decision 42 D14).
 *
 * ── WHAT IT WAS ─────────────────────────────────────────────────────────────────────────────
 * A one-shot quote funnel: state an intent, get three priced cards (AI / Expert / Full), and be
 * handed off elsewhere. That made it the THIRD place the same question was asked — the plan
 * modal's finish asks myself/AI/local, the Finalize modal asks myself/agent/expert/concierge, and
 * this page asked AI/expert/full. "One question answered in three places is the drift class §18
 * rule 1 names" (brief §1). It also asked for a destination, an occasion and a party size that
 * the one modal then asked for all over again.
 *
 * ── WHAT IT IS NOW ──────────────────────────────────────────────────────────────────────────
 * The intent form is a DOOR. The traveler states their intent, the lead is captured exactly as
 * before, and the ONE modal opens carrying what this page HOLDS (Locked Decision 42 D13):
 * `destination`, and the occasion as a slug the CATALOG resolves. The five ratified steps then
 * ask everything a plan needs, and the tier choice is that modal's FINISH — the map is
 * `client/src/lib/concierge-tiers.ts` and is written down exactly once.
 *
 * §13 — A DOOR PASSES ONLY WHAT IS TRUE (D13's second clause):
 *   · the occasion is resolved against the LIVE catalog (`GET /api/experience-types` +
 *     `findOccasionByKey`). The form's own `eventType` list is the FEE vocabulary, not the
 *     occasion catalog: `wedding`, `proposal`, `corporate`, `honeymoon` and `birthday` are real
 *     seeded slugs, while `vacation`, `anniversary` and `other` resolve to no row at all. An
 *     unresolvable answer passes NOTHING and the modal ASKS the question (Locked Decision 33
 *     rule 2 — the skip is keyed on the resolved row, never on the presence of a string).
 *   · `experienceType` is deliberately NEVER passed: `PlanningSource.experienceType` is one of
 *     five FROZEN coarse keys (travel|wedding|corporate|event|retreat, ruling
 *     `2026-09-01-moment-key`), and this form's values are a different vocabulary. Forwarding one
 *     would be a wrong-vocabulary guess wearing a prefill's clothes.
 *   · the party size is a single stated TOTAL, so it rides in trip context as `travelers` — the
 *     one field that holds exactly that. It is never split into `adults`/`kids`: inventing a
 *     composition nobody gave is the same §13 failure the modal's own seeding refuses.
 *
 * ── WHAT WENT ───────────────────────────────────────────────────────────────────────────────
 * The AI tier's `/cart?step=cart&concierge=<id>` hand-off is DELETED. `cart.tsx` never read that
 * param (brief §6, finding F12), the cart is the `ready_for_checkout` PROJECTION of a plan's
 * items rather than a destination (Locked Decision 39), and an AI action on an empty plan is the
 * FREE DRAFT (Locked Decision 41 (b)) — which is what the modal's AI finish already runs. No
 * consumer plus a state-bearing effect ⇒ delete, don't gate (§18c).
 *
 * `POST /api/concierge/quote` is KEPT and unchanged: it is what captures the lead here (row +
 * guest claim token, the C3 admin notification) and it still has other consumers —
 * `plancard/EscalationCTA.tsx` and two Playwright specs — so it is not consumer-less and §18c
 * does not apply to it.
 *
 * ── THE EXPERT FINISH, AND WHY THE SLIP COMES FIRST (Locked Decision 32) ─────────────────────
 * "Get a local expert" from THIS door is the Destination Concierge tier: a routed lead, not a
 * browse. It goes through `ensureSlipForExpertRequest` — the ONE implementation of "no expert
 * touchpoint without a slip" — so the request is bound to a real `tripId` before it is sent, and
 * the stop screen in front of it is L19's SHARED `ExpertRequestReviewSheet` (ledger
 * `2026-09-07-request-is-a-click`), not a second one. That binding is not decoration: on `main`
 * this page sent the lead with no `tripId`, no `variantId` and no `planSnapshot`, so
 * `POST /api/expert-requests` answered **400** and the UI — which never read `res.ok` — said
 * "Your request is in" anyway.
 */
import { useState } from "react";
import { Link, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { usePlanning, type PlanningBranch } from "@/contexts/PlanningContext";
import type { CommittedPlan } from "@/components/trip/plan-modal";
import { IntentForm, type IntentSubmission } from "@/components/concierge/IntentForm";
import { DoneForYouCard, type DoneForYouOffer } from "@/components/concierge/DoneForYouCard";
import { ExpertRequestReviewSheet } from "@/components/expert-request-review-sheet";
import { conciergeTierForFinish, planningBranchForTierHint } from "@/lib/concierge-tiers";
import { patchConciergeTier } from "@/lib/concierge-request";
import { findOccasionByKey } from "@shared/occasions";
import { getTripContext, updateTripContext } from "@/lib/trip-context";
import { ensureSlipForExpertRequest, mintTripSlip } from "@/lib/trip-slip";
import type { ExperienceType } from "@shared/schema";

/** The priced route the quote returns. Only the two tiers this surface still renders are read. */
interface ConciergeRoute {
  expert: { priceCents?: number; available: boolean; etaHours?: number };
  full: DoneForYouOffer;
  recommended: "ai" | "expert" | "full";
  branch: string;
}

interface QuoteResponse {
  requestId: string;
  route: ConciergeRoute;
}

/** The lead this page captured, plus what the traveler said, held for the finish. */
interface ConciergeLead {
  requestId: string;
  route: ConciergeRoute;
  submission: IntentSubmission;
}

function formatPrice(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

/**
 * THE expert tier's price line, resolved ONCE (§18 rule 1). The review sheet is HANDED it, so the
 * sheet can never quote a number this page does not stand behind, and a tier with no quoted price
 * says so rather than showing a fabricated 0 (§13).
 */
function expertPriceLabel(route: ConciergeRoute): string {
  return route.expert.priceCents !== undefined
    ? `from ${formatPrice(route.expert.priceCents)}`
    : "Quote on request";
}

export default function ConciergePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { open: openPlanModal } = usePlanning();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const tierHint = params.get("tier"); // /optimize → /concierge?tier=ai
  const intentHint = params.get("intent") ?? "";
  const eventTypeHint = params.get("eventType") ?? undefined;

  const [submitting, setSubmitting] = useState(false);
  const [lead, setLead] = useState<ConciergeLead | null>(null);
  /** Set by the finish hook when the traveler chose the local-expert CTA. Writes nothing. */
  const [expertFinish, setExpertFinish] = useState<{ lead: ConciergeLead; plan: CommittedPlan } | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  /**
   * The occasion catalog — the SAME `GET /api/experience-types` query key the Trip Strip, the plan
   * modal and the IntakePanel already use, so this door costs no extra request and reads the same
   * rows they do. While it is in flight `occasions` is undefined and `findOccasionByKey` answers
   * null, which is the honest "we cannot resolve it yet" and simply means the modal asks step 1.
   */
  const { data: occasions } = useQuery<ExperienceType[]>({
    queryKey: ["/api/experience-types"],
    staleTime: 5 * 60_000,
  });

  /**
   * THE DOOR. One implementation, called from the intent form and from the "reopen" button, so
   * what this surface passes is decided in exactly one place (§18 rule 1).
   */
  function openPlanner(next: ConciergeLead) {
    const occasion = findOccasionByKey(occasions, next.submission.eventType);
    // A `?tier=` hint is a door that already knows the "how", so it narrows the FINISH to that one
    // CTA — the ratified `source.branch` semantic, which never skips a step (Locked Decision 33
    // rule 6). An unrecognised hint, and `full` (which is not a finish), narrow nothing.
    const branch = planningBranchForTierHint(tierHint);
    openPlanModal({
      ...(next.submission.destination ? { destination: next.submission.destination } : {}),
      ...(occasion ? { experienceSlug: occasion.slug } : {}),
      ...(branch ? { branch } : {}),
      onFinish: (chosen, plan) => handlePlanFinish(chosen, plan, next),
    });
  }

  /**
   * THE TIER CHOICE IS THE FINISH. Two of the three tiers ARE modal CTAs, so choosing one here is
   * choosing one there; the map lives in `concierge-tiers.ts` and is not restated.
   *
   * `local` is HANDLED by this door (returns true): the Destination Concierge tier is a routed
   * lead bound to a slip, which the generic `/experts` browse is not. Everything else falls
   * through to the shared rail untouched — the AI finish is the free draft on an empty plan, and
   * "Build it myself" lands on the slip exactly as it does from every other door.
   */
  function handlePlanFinish(branch: PlanningBranch, plan: CommittedPlan, next: ConciergeLead): boolean {
    if (branch === "local") {
      // L19's rule, kept: choosing the tier OPENS the review and writes nothing. The tier record
      // and the lead both live on that sheet's Send button.
      setExpertFinish({ lead: next, plan });
      return true;
    }
    // The funnel record for a tier the traveler has now actually chosen. Fire-and-forget: a
    // failed record must never take the screen away from the rail they picked.
    // `myself` maps to NO tier (`conciergeTierForFinish` answers null) and nothing is written —
    // "build it myself" is not one of the three answers, and filing one would record a tier
    // nobody chose (§13).
    const tier = conciergeTierForFinish(branch);
    if (tier) void patchConciergeTier(next.requestId, tier).catch(() => {});
    return false;
  }

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
      const next: ConciergeLead = { requestId: data.requestId, route: data.route, submission };
      setLead(next);

      // The party size the form captured is a single stated TOTAL — exactly what
      // `TripContext.travelers` holds, and what the modal preserves through its own save when
      // step 4 is walked past. It is never split into adults/kids (§13).
      if (submission.partySize) updateTripContext({ travelers: submission.partySize });

      openPlanner(next);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Couldn't start your plan",
        description: err.message ?? "Please try again in a moment.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * THE SEND — everything that writes, on the review sheet's own button.
   *
   * The slip is the PRECONDITION for the touchpoint, not a field on the request (Locked Decision
   * 32), so this goes through `ensureSlipForExpertRequest`: an existing plan is reused, a missing
   * one is minted through the ONE client mint door (`mintTripSlip`), and basics too short to mint
   * REFUSE with the sentence to show — no invented date, no invented destination. The request
   * only goes out bound to the trip id that helper hands back.
   */
  async function sendExpertRequest() {
    if (!expertFinish) return;
    const { lead: current, plan } = expertFinish;

    // A slip needs an account, so a signed-out traveler has no honest way through this door yet.
    // Saying so beats sending a request the server would refuse (`POST /api/expert-requests` is
    // `isAuthenticated`). The gate is here, on the WRITE — the sheet that opens is a read.
    if (!user) {
      openSignInModal({
        title: "Sign in to reach a local expert",
        description: "Your plan is saved to your account before an expert can pick it up.",
      });
      return;
    }

    setSending(true);
    let outcome: Awaited<ReturnType<typeof ensureSlipForExpertRequest>>;
    try {
      outcome = await ensureSlipForExpertRequest(
        {
          existingTripId: plan.tripId ?? getTripContext().tripId,
          basics: {
            destination: plan.destination,
            // The modal's own committed dates. Absent is where this stops (§13).
            startDate: plan.startDate,
            endDate: plan.endDate,
          },
        },
        {
          mint: (basics) => mintTripSlip(basics),
          onMinted: (tripId) => updateTripContext({ tripId }),
          sendRequest: async (tripId) => {
            await patchConciergeTier(current.requestId, "expert").catch(() => {});
            const res = await fetch("/api/expert-requests", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                requestType: "review",
                // The route reads `destination` (and falls back to the context's). The old body
                // sent `destinationCity`, which the handler does not read at all.
                destination: plan.destination,
                // THE SLIP REFERENCE. Without it the advisor row, the expert's notification and
                // the Assigned Trips entry all sit inside an `if (tripId)` that never runs, and
                // the handler answers 400 before any of them (Locked Decision 32).
                tripId,
                notes: current.submission.intent,
                optimizationContext: {
                  source: "concierge_entry",
                  conciergeRequestId: current.requestId,
                  intent: current.submission.intent,
                  eventType: current.submission.eventType,
                  destination: plan.destination,
                },
              }),
            });
            // `fetch` does not reject on a 4xx, and the old code therefore reported "Request
            // received" for a request the server refused. A claim the platform cannot back is the
            // §13 class this whole surface was rebuilt around.
            if (!res.ok) throw new Error(`expert-requests responded ${res.status}`);
            return res;
          },
        },
      );
    } finally {
      setSending(false);
    }

    if (outcome.status === "sent") {
      setExpertFinish(null);
      setSent(
        current.route.expert.available
          ? "Your request is in. An expert will reach out shortly."
          : `Your request is queued. ETA ~${current.route.expert.etaHours ?? 24}h.`,
      );
      return;
    }

    if (outcome.status === "blocked") {
      // No slip ⇒ no touchpoint and no request. The traveler is told which basic is missing —
      // never a guessed one to make the flow proceed.
      toast({
        variant: "destructive",
        title: "Your plan needs a few basics first",
        description: outcome.message,
      });
      return;
    }

    toast({
      variant: "destructive",
      title: "Couldn't send your request",
      description: "The plan is saved. Please try again in a moment.",
    });
  }

  const isEvent = lead?.route.branch === "event";

  return (
    <Layout>
      <div className="container py-8 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Concierge</h1>
          <p className="text-muted-foreground mt-1">
            Tell us what you want to plan. We'll walk you through the plan itself, then you choose
            how it gets built — with our platform, with a local expert, or by you.
          </p>
          {tierHint === "ai" && !lead && (
            <Card className="mt-3 border-primary/30 bg-primary/5">
              <CardContent className="pt-4 pb-4 text-sm text-muted-foreground">
                Looking for Platform Concierge — powered by our platform? AI-assisted and
                human-backed: our AI gets you started instantly, and our team steps in for
                anything complex. Tell us what you want to plan below.
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

        {sent && (
          <Card className="border-primary/40" data-testid="card-concierge-expert-sent">
            <CardContent className="pt-4 pb-4 flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
              <p className="text-sm">{sent}</p>
            </CardContent>
          </Card>
        )}

        {/* The plan modal closes over this page. A traveler who backs out of it still holds the
            lead we captured, so the door can simply be reopened — never a second form asking the
            same three questions again. */}
        {lead && !expertFinish && !sent && (
          <Card data-testid="card-concierge-reopen">
            <CardContent className="pt-4 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Your request is saved</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pick up where you left off — we'll ask about the plan, then how you want it built.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openPlanner(lead)}
                data-testid="button-concierge-reopen-planner"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Continue planning
              </Button>
            </CardContent>
          </Card>
        )}

        {/* L19's stop screen, shared with `/experiences/:slug` (ledger
            `2026-09-07-request-is-a-click`). It writes nothing; `sendExpertRequest` is reached
            only from its Send button. Every row is a value the traveler actually stated — the
            party is the plan's own total, and a basic nobody answered reads "Not set" (§13). */}
        {expertFinish && (
          <ExpertRequestReviewSheet
            open
            onOpenChange={(v) => {
              if (!v) setExpertFinish(null);
            }}
            basics={{
              destination: expertFinish.plan.destination,
              startDate: expertFinish.plan.startDate,
              endDate: expertFinish.plan.endDate,
              // `CommittedPlan.travelers` is the step-4 steppers' own sum, absent when the
              // traveler walked past step 4. The total this page collected survives in trip
              // context (the modal's save preserves an untouched party), so that is the fallback —
              // and when neither states one the sheet says "Not set" rather than guessing.
              party: expertFinish.plan.travelers ?? getTripContext().travelers,
            }}
            priceLabel={expertPriceLabel(expertFinish.lead.route)}
            note={expertFinish.lead.submission.intent}
            sending={sending}
            onSend={sendExpertRequest}
            sendLabel={expertFinish.lead.route.expert.available ? "Send request" : "Join queue"}
            title={
              isEvent ? "Add a coordinator to this event?" : "Send this to a destination concierge?"
            }
          />
        )}

        {/* FULL / DONE-FOR-YOU. Not a way to BUILD a plan and therefore not a modal finish — it is
            a coordination engagement on the rail it already had. Offered once a lead exists, so
            the traveler has stated what they want coordinated. */}
        {lead && !sent && (
          <DoneForYouCard
            requestId={lead.requestId}
            offer={lead.route.full}
            recommended={lead.route.recommended === "full"}
            isEvent={isEvent}
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
