/**
 * TripCardRail — the Trip Card's 320px right rail (ledger `2026-09-07-trip-card-one-page`;
 * Console & AI Concierge brief §7 anatomy; CLAUDE.md Locked Decision 45 (6)).
 *
 * Four cards, in the board's order, every one reading a rail that already exists:
 *   1 BOOKING AGENT — a PLACEHOLDER until L16/L17 mount the drawer. It reads this plan's
 *     `affiliate_booking_requests` rows (the traveler's own, `GET /api/affiliate-booking-requests/
 *     user?tripId=` — owner from the SESSION, the trip id only a filter, §14) and renders the
 *     Locked Decision 44 (e) vocabulary strip ONLY for the stages the rows actually carry, through
 *     the one explicit legacy map (`lib/booking-agent-status.ts`). It never claims a copilot exists.
 *   2 YOUR EXPERT — the owner-gated advisor read (`GET /api/trips/:id/expert-advisor`), rendered
 *     through the slip's own `slipExpertRailState` / `slipAdvisorStandingLine` (§18 rule 1), with
 *     Message addressed by the PLAN (LD 40 D22) and a storefront link only when a handle exists.
 *     NOTE (reported, not fixed here): LD 42 D7 says the advisor READER returns ALL advisors; on
 *     `main` this route still returns one, so this card shows the one it returns.
 *   3 SUGGESTION FROM YOUR EXPERT — the EXISTING `ExpertSuggestionsPanel` (C2's decline-with-
 *     reason), mounted here and nowhere else on this page (`PlanCard suggestionsHome="rail"`).
 *   4 NEED TO CHANGE THE PLAN? — "Back to planning", the SAME `useReopenMutation` the slip's Finish
 *     card calls, SUPPRESSED inside the 48-hour window and once underway by the SAME predicate the
 *     slip suppresses its Reopen with (`tripCardForcedPrimaryByDateAlone`, now zone-aware through
 *     `shared/plan-timing.ts`). With no zone the predicate compares on the date alone, as stated there.
 *
 * NOT here, deliberately: the push-consent card (the brief draws it absent; no stub), and any
 * booking-agent DRAWER (L16/L17). Every card is owner-only: each rail it reads is owner-gated.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ExternalLink, MessageCircle, Undo2, ShoppingBag } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { tripCardForcedPrimaryByDateAlone } from "@shared/trip-primary-surface";
import { bookingAgentStrip } from "@/lib/booking-agent-status";
import { earnerProfilePath } from "@/lib/earner-address";
import { useAskExpert } from "@/lib/use-ask-expert";
import {
  slipAdvisorStandingLine,
  slipExpertRailState,
  type SlipRailAdvisor,
} from "@/lib/slip-rail";
import { ExpertSuggestionsPanel } from "./ExpertSuggestionsPanel";
import { useReopenMutation } from "./use-reopen-mutation";

export interface TripCardRailTrip {
  id: string;
  title?: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  finalizedAt?: string | null;
  /** `trips.timezone` — absent when never captured (Locked Decision 30). */
  timezone?: string | null;
}

interface TripCardRailProps {
  trip: TripCardRailTrip;
  isOwner: boolean;
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
}

function BookingAgentCard({ tripId }: { tripId: string }) {
  const { data, isLoading, isError } = useQuery<AffiliateRequestRow[]>({
    queryKey: ["/api/affiliate-booking-requests/user", { tripId }],
    staleTime: 60_000,
  });
  const strip = bookingAgentStrip(data ?? []);
  return (
    <RailCard card="booking-agent" title="Booking agent">
      {isLoading ? (
        // A read in flight is not "no requests" (§13) — say so rather than draw an empty state.
        <RailNote testId="trip-card-booking-agent-loading">Checking this plan's booking requests…</RailNote>
      ) : isError ? (
        <RailNote testId="trip-card-booking-agent-error">Couldn't load this plan's booking requests.</RailNote>
      ) : strip.length === 0 ? (
        <RailNote testId="trip-card-booking-agent-empty">
          No booking-agent requests on this plan.
        </RailNote>
      ) : (
        <ul className="space-y-1" data-testid="trip-card-booking-agent-strip">
          {strip.map((cell) => (
            <li
              key={cell.stage}
              className="flex items-center justify-between gap-2 rounded-md border border-[color:var(--earn-border)] px-2 py-1.5 text-[12px]"
              data-testid={`trip-card-booking-agent-stage-${cell.stage}`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <ShoppingBag className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="truncate">{cell.label}</span>
              </span>
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{cell.count}</span>
            </li>
          ))}
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
  // nothing visible and offering it would be a false reversal (R-F). Zone-aware via LD 30; with
  // no zone the date-alone comparison `shared/plan-timing.ts` states.
  const forcedByDateAlone = tripCardForcedPrimaryByDateAlone({
    startDate: trip.startDate,
    endDate: trip.endDate,
    timezone: trip.timezone ?? null,
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

export function TripCardRail({ trip, isOwner }: TripCardRailProps) {
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
      {/* Renders nothing when there are no suggestions (§13 — the panel's own rule). */}
      <div data-testid="trip-card-rail-suggestions">
        <ExpertSuggestionsPanel tripId={trip.id} />
      </div>
      <BackToPlanningCard trip={trip} />
    </div>
  );
}
