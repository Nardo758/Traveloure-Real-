/**
 * TripCardRail — the Trip Card's 320px right rail (ledger `2026-09-07-trip-card-one-page`;
 * Console & AI Concierge brief §7 anatomy; CLAUDE.md Locked Decision 45 (6)).
 *
 * Four cards, in the board's order, every one reading a rail that already exists:
 *   1 BOOKING AGENT — a PLACEHOLDER until L16/L17 mount the drawer. It reads this plan's
 *     `affiliate_booking_requests` rows (the traveler's own, `GET /api/affiliate-booking-requests/
 *     user?tripId=` — owner from the SESSION, the trip id only a filter, §14) and draws ONE ROW
 *     PER REQUEST, each carrying the Locked Decision 44 (e) stage the row ACTUALLY holds, through
 *     the one explicit legacy map (`lib/booking-agent-status.ts`). No stage is drawn for a stage
 *     nobody is in, and it never claims a copilot exists — the board's "Ask the agent" control is
 *     the L16/L17 drawer and is deliberately absent here. Punchlist D-10 narrowed what one of
 *     those stages MEANS: `confirmed` is written only on the partner's own reported conversion, so
 *     a purchase an agent made reads as awaiting the partner — this card renders whichever
 *     sentence the one reader returns and restates neither.
 *   2 YOUR EXPERT — the owner-gated advisor read (`GET /api/trips/:id/expert-advisor`), rendered
 *     through the slip's own `slipExpertRailState` / `slipAdvisorStandingLine` (§18 rule 1), with
 *     Message addressed by the PLAN (LD 40 D22) and a storefront link only when a handle exists.
 *     NOTE (reported, not fixed here): LD 42 D7 says the advisor READER returns ALL advisors; on
 *     `main` this route still returns one, so this card shows the one it returns.
 *   3 ASK AI ABOUT THIS PLAN — the SAME `AskAiDrawer` the slip's rail mounts, POST-FINAL here
 *     (L16 lane 4, ledger `2026-09-17-l16-lane4-postfinal`; brief §5.1). It takes the Suggestion
 *     card's SLOT rather than a fifth position: `ExpertSuggestionsPanel` draws nothing unless the
 *     expert has actually posted a suggestion, so the rail still reads FOUR cards in the ordinary
 *     case and five only when a suggestion is genuinely pending. Nothing about the control changes
 *     with the surface — same copy, same owner-only pay/apply, same server-answered price,
 *     staleness and refusals — except ONE sentence D-49 requires: an apply on a plan that is
 *     CURRENTLY final makes a NEW Trip Card version, which the card says before the charge.
 *   3b SUGGESTION FROM YOUR EXPERT — the EXISTING `ExpertSuggestionsPanel` (C2's decline-with-
 *     reason), mounted here and nowhere else on this page (`PlanCard suggestionsHome="rail"`).
 *   4 NEED TO CHANGE THE PLAN? — "Back to planning", the SAME `useReopenMutation` the slip's Finish
 *     card calls, SUPPRESSED inside the 48-hour window and once underway by the SAME predicate the
 *     slip suppresses its Reopen with (`tripCardForcedPrimaryByDateAlone`, now zone-aware through
 *     `shared/plan-timing.ts`). With no zone the predicate compares on the date alone, as stated there.
 *
 * NOT here, deliberately: the push-consent card (the brief draws it absent; no stub), and any
 * booking-agent DRAWER (L17). Every card is owner-only: each rail it reads is owner-gated — which
 * is why the Ask-AI card is mounted with `isExpertViewer={false}`, a fact about this page rather
 * than a narrowing of the drawer's own rule.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ExternalLink, MessageCircle, Undo2, ShoppingBag } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { tripCardForcedPrimaryByDateAlone } from "@shared/trip-primary-surface";
import { readBookingAgentStatus } from "@/lib/booking-agent-status";
import { earnerProfilePath } from "@/lib/earner-address";
import { useAskExpert } from "@/lib/use-ask-expert";
import {
  slipAdvisorStandingLine,
  slipBuildAiAction,
  slipExpertRailState,
  type SlipRailAdvisor,
} from "@/lib/slip-rail";
import { AskAiDrawer } from "./AskAiDrawer";
import { ExpertSuggestionsPanel } from "./ExpertSuggestionsPanel";
import { useReopenMutation } from "./use-reopen-mutation";

export interface TripCardRailTrip {
  id: string;
  title?: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  finalizedAt?: string | null;
  /**
   * `plancard.trip.finalVersion` — the version this Trip Card is showing. Read by the Ask-AI card
   * ONLY, to say what an apply would do to it (D-49); absent/null ⇒ that sentence is omitted (§13).
   */
  finalVersion?: number | null;
}

interface TripCardRailProps {
  trip: TripCardRailTrip;
  isOwner: boolean;
  /**
   * How many activities this plan holds, from the plancard the page already read. It feeds
   * `slipBuildAiAction` — LD 41 (b)'s ONE home — and is never re-derived into a second rule.
   */
  itemCount: number;
}

/** One rail card: a mono uppercase eyebrow over its body — the slip rail's own grammar. */
function RailCard({ card, title, children }: { card: string; title: string; children: React.ReactNode }) {
  return (
    <Card data-testid={`trip-card-rail-${card}`}>
      <CardContent className="p-3 space-y-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        {children}
      </CardContent>
    </Card>
  );
}

function RailNote({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <p className="px-1 text-[11px] leading-relaxed text-muted-foreground" data-testid={testId}>
      {children}
    </p>
  );
}

// ── 1 · Booking agent (placeholder) ──────────────────────────────────────────────────────────

interface AffiliateRequestRow {
  id: string;
  itemName?: string | null;
  status?: string | null;
  confirmationRef?: string | null;
  /**
   * D-10 (ledger `2026-09-15-d10-confirmed-needs-partner-evidence`): a `confirmed` row reads
   * "Confirmed by <partner>", so the reader is handed the partner the ROW already carries. The
   * traveler read (`GET /api/affiliate-booking-requests/user`) returns the whole row minus the
   * partner URL, so this arrives with no server change — and when it is absent the reader says
   * "the partner" rather than inventing a name (§13).
   */
  partnerName?: string | null;
}

function BookingAgentCard({ tripId }: { tripId: string }) {
  const { data, isLoading, isError } = useQuery<AffiliateRequestRow[]>({
    queryKey: ["/api/affiliate-booking-requests/user", { tripId }],
    staleTime: 60_000,
  });
  const rows = data ?? [];
  return (
    <RailCard card="booking-agent" title="Booking agent">
      {isLoading ? (
        // A read in flight is not "no requests" (§13) — say so rather than draw an empty state.
        <RailNote testId="trip-card-booking-agent-loading">Checking this plan's booking requests…</RailNote>
      ) : isError ? (
        <RailNote testId="trip-card-booking-agent-error">Couldn't load this plan's booking requests.</RailNote>
      ) : rows.length === 0 ? (
        <RailNote testId="trip-card-booking-agent-empty">
          No booking-agent requests on this plan.
        </RailNote>
      ) : (
        // The board draws ONE ROW PER REQUEST — its name, and the stage the row actually carries.
        // §13: an item with no recorded name is shown as "Booking request", never guessed at.
        <ul className="space-y-1" data-testid="trip-card-booking-agent-list">
          {rows.map((row) => {
            const reading = readBookingAgentStatus(row);
            return (
              <li
                key={row.id}
                className="rounded-md border border-[color:var(--earn-border)] px-2 py-1.5 text-[12px]"
                data-testid={`trip-card-booking-agent-row-${row.id}`}
                data-stage={reading.stage}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <ShoppingBag className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate">{row.itemName?.trim() || "Booking request"}</span>
                </span>
                <span
                  className="mt-0.5 block font-mono text-[10px] text-muted-foreground"
                  data-testid={`trip-card-booking-agent-stage-${row.id}`}
                >
                  {reading.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {/* The card says what it is. No copilot is claimed: the rows record a human queue. */}
      <RailNote testId="trip-card-booking-agent-placeholder-note">
        Requests are handled by a human booking agent. The booking-agent drawer arrives with a later lane.
      </RailNote>
    </RailCard>
  );
}

// ── 2 · Your expert ──────────────────────────────────────────────────────────────────────────

function YourExpertCard({ trip, advisor }: { trip: TripCardRailTrip; advisor: SlipRailAdvisor | null }) {
  const askExpert = useAskExpert();
  const state = slipExpertRailState(advisor);
  if (state.kind !== "message") {
    // §13: no advisor ⇒ the card says so; hiring lives on the slip's Build card, never here
    // (LD 42 D16 — the Trip Card is not a planning surface).
    return (
      <RailCard card="expert" title="Your expert">
        <RailNote testId="trip-card-expert-none">No expert is advising this plan.</RailNote>
      </RailCard>
    );
  }
  const standing = slipAdvisorStandingLine(advisor);
  const storefront = earnerProfilePath({ handle: state.handle });
  const avatarUrl =
    typeof advisor?.profile_image_url === "string" && advisor.profile_image_url.trim().length > 0
      ? advisor.profile_image_url
      : null;
  return (
    <RailCard card="expert" title="Your expert">
      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar className="h-9 w-9 flex-shrink-0">
          <AvatarImage src={avatarUrl ?? undefined} alt="" />
          <AvatarFallback>{state.name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground" data-testid="trip-card-expert-name">
            {state.name}
          </p>
          {standing && (
            <p className="font-mono text-[10px] leading-snug text-muted-foreground" data-testid="trip-card-expert-standing">
              {standing}
            </p>
          )}
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start h-auto py-2 px-2.5 text-[13px] font-semibold"
        onClick={() =>
          void askExpert({
            // LD 40 D22: the address is the PLAN; the server resolves the counterpart.
            tripId: trip.id,
            subject: trip.title || trip.destination || null,
            fallbackName: state.name,
            returnTo: `/trip/${trip.id}`,
          })
        }
        data-testid="trip-card-expert-message"
      >
        <MessageCircle className="w-3.5 h-3.5 mr-2" />
        Message {state.name}
      </Button>
      {storefront && (
        <Button variant="outline" size="sm" className="w-full justify-start h-auto py-2 px-2.5 text-[13px] font-semibold" asChild data-testid="trip-card-expert-storefront">
          <Link href={storefront}>
            <ExternalLink className="w-3.5 h-3.5 mr-2" />
            View storefront
          </Link>
        </Button>
      )}
    </RailCard>
  );
}

// ── 4 · Back to planning ─────────────────────────────────────────────────────────────────────

function BackToPlanningCard({ trip }: { trip: TripCardRailTrip }) {
  const reopen = useReopenMutation(trip.id);
  const [, navigate] = useLocation();
  // The SAME suppression the slip's Finish card applies to its Reopen (§18 rule 1): inside the
  // 48-hour window or underway the Trip Card is primary regardless, so reopening would change
  // nothing visible and offering it would be a false reversal (R-F).
  //
  // IT IS THE ZONE-FREE PREDICATE, DELIBERATELY, AND THAT IS NOT AN OVERSIGHT. Making
  // `tripCardForcedPrimaryByDateAlone` zone-aware means `shared/trip-primary-surface.ts` reading
  // `shared/plan-timing.ts`, which imports the window constant back from it — a cycle. Lane L10
  // owns that module and its import direction; a lane may not silently reverse it, and two
  // predicates answering "is the Trip Card already primary?" would be the drift §18 rule 1 names.
  // So this rail asks the ONE existing question, gets the answer the slip gets, and the zone-aware
  // refinement is left to whichever lane moves the constant deliberately.
  const forcedByDateAlone = tripCardForcedPrimaryByDateAlone({
    startDate: trip.startDate,
    endDate: trip.endDate,
  });
  if (!trip.finalizedAt || forcedByDateAlone) return null;
  return (
    <RailCard card="back-to-planning" title="Need to change the plan?">
      <RailNote>
        Reopening takes you back to the slip. Your Trip Card keeps this version until you make it final again.
      </RailNote>
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start h-auto py-2 px-2.5 text-[13px] font-semibold"
        disabled={reopen.isPending}
        onClick={() => reopen.mutate(undefined, { onSuccess: () => navigate(`/plans/${trip.id}`) })}
        data-testid="trip-card-action-reopen"
      >
        <Undo2 className="w-3.5 h-3.5 mr-2" />
        {reopen.isPending ? "Reopening…" : "Back to planning"}
      </Button>
    </RailCard>
  );
}

// ── The rail ─────────────────────────────────────────────────────────────────────────────────

export function TripCardRail({ trip, isOwner, itemCount }: TripCardRailProps) {
  // ONE advisor read for the rail — the same owner-gated route the card header already reads
  // (React Query dedups the two into one request). 404s for a non-owner, hence `enabled`.
  const { data: advisorData } = useQuery<{ advisor: SlipRailAdvisor | null }>({
    queryKey: [`/api/trips/${trip.id}/expert-advisor`],
    enabled: isOwner && !!trip.id,
    staleTime: 60_000,
  });
  if (!isOwner) return null;
  const advisor = advisorData?.advisor ?? null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 items-start" data-testid="trip-card-rail">
      <BookingAgentCard tripId={trip.id} />
      <YourExpertCard trip={trip} advisor={advisor} />
      {/* 3 · ASK AI — the SAME drawer the slip mounts (L16 lane 4, ledger
          `2026-09-17-l16-lane4-postfinal`), in the Suggestion card's slot, with the suggestion
          panel — which draws nothing unless the expert has actually posted one — directly beneath
          it. The rail therefore still reads FOUR cards in the ordinary case. Owner-only by the
          rail's own gate above, so `isExpertViewer` is false here by construction: an advisor
          never reaches this page's rail at all.
          `planFinal` is what makes this mount post-final — it is the PLAN's state, not the page's,
          and D-49's sentence is derived from it in the drawer's one copy module. */}
      <AskAiDrawer
        tripId={trip.id}
        isOwner={isOwner}
        isExpertViewer={false}
        aiAction={slipBuildAiAction(itemCount)}
        surface="trip-card"
        planFinal={{
          isFinalized: !!trip.finalizedAt,
          finalVersion: typeof trip.finalVersion === "number" ? trip.finalVersion : null,
        }}
      />
      {/* Renders nothing when there are no suggestions (§13 — the panel's own rule). */}
      <div data-testid="trip-card-rail-suggestions">
        <ExpertSuggestionsPanel tripId={trip.id} />
      </div>
      <BackToPlanningCard trip={trip} />
    </div>
  );
}
