/**
 * SlipLogisticsSection — the slip's home for planning-phase logistics (Trip Card rebuild
 * Phase 3b, rows 13/14; ledger 2026-08-31-manifest-is-the-boundary).
 *
 * Relocated verbatim off the trip-details.tsx itinerary/logistics/guests tabs:
 *   - Row 13 (temporal anchors): flight/hotel times are optimizer constraints — planning input.
 *     TemporalAnchorManager + ScheduleValidator + EnergyBudgetDisplay + AnchorSuggestionsPanel,
 *     and WeddingAnchorPresets for wedding trips. The two former TemporalAnchorManager mounts
 *     (a flight/hotel-filtered capture on the itinerary tab + the full one on the logistics tab)
 *     consolidate to ONE unfiltered manager here — a superset, so no anchor affordance is lost.
 *   - Row 14 (guest invites): collaboration is a planning-phase feature. GuestInviteManager /
 *     "Set up guest list" for event trips; Share (B3) covers the post-final companion case.
 *
 * Owner-only and collapsed by default (this is a build tool, not the plan itself). Self-contained:
 * it fetches the full trip (for eventType) and the user-experiences link the guest manager needs,
 * exactly as trip-details did — SlipView's slim DTO does not carry those.
 *
 * TWO MORE ROWS LANDED HERE (ledger `2026-09-04-plan-islands`), both for the same reason row 14
 * is here: this is the plan's ONE home for plan-level logistics, and both were machinery with no
 * door from the couple's own page.
 *   - TRAVELING PARTY (`SlipTravelingParty`) — `trip_participants` had a rich roster and no
 *     surface that could populate it. It sits BESIDE "Guests & invites" and says out loud that it
 *     is a different list: who is TRAVELING, versus who is INVITED. Locked Decision 37 keeps the
 *     two apart, and the hidden-occasion gate covers both for the same reason.
 *   - ORGANIZE INTO EVENTS (`SlipOrganizeEvents`) — a ready-made buyer's clone lands here with
 *     items and zero events, and step 5 is the only place events are created. The offer appears
 *     once, on a scheduled occasion with no events, and never creates anything on its own.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, Loader2, Plane, UserPlus, Users } from "lucide-react";
import { calendarDateToIso } from "@/lib/calendar-date";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTrip } from "@/hooks/use-trips";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  TemporalAnchorManager,
  ScheduleValidator,
  EnergyBudgetDisplay,
  AnchorSuggestionsPanel,
  WeddingAnchorPresets,
} from "@/components/logistics";
import { GuestInviteManager } from "@/components/GuestInviteManager";
import { useOccasionSwitches } from "@/hooks/use-occasion-switches";
import { SlipTravelingParty } from "./SlipTravelingParty";
import { SlipOrganizeEvents } from "./SlipOrganizeEvents";
import { canOrganizeIntoEvents } from "@/lib/organize-events";
import { countPlanEvents, type PlanEvent } from "@/lib/slip-events";
import type { UserExperience } from "@shared/schema";

const EVENT_TRIP_TYPES = new Set(["wedding", "honeymoon", "proposal", "anniversary", "birthday", "corporate"]);

/**
 * THE SLIP'S GUEST TOTALS (re-audit A20, ledger `2026-09-04-reaudit-fixes`).
 *
 * Reads the SAME owner-gated derived roster the Guests page reads, under the SAME query key, so
 * the two surfaces share a cache and can never show a plan two different headcounts. Nothing is
 * counted here: `totals` is the server's answer (`plan-guest-roster.service.ts`), and a second
 * count on the client is the drift class §18 rule 1 names.
 *
 * §13 — EVERY ABSENCE IS PRESERVED. A roster that has not loaded, one the viewer may not read
 * (the route is owner-tier because the rows carry emails and dietary notes), and one with nobody
 * on it all render NOTHING — never "0 invited", which is a claim about the guest list rather than
 * about our knowledge of it. `countries` is omitted server-side when no guest states an origin
 * and is simply not rendered here either.
 */
function SlipGuestTotals({ tripId }: { tripId: string }) {
  const { data } = useQuery<{
    totals?: { invited?: number; attending?: number; countries?: number };
  }>({
    queryKey: [`/api/trips/${tripId}/guests`],
    enabled: !!tripId,
    staleTime: 30_000,
    // A 401/403/404 is an honest "we cannot say", not an empty roster — do not retry it into one.
    retry: false,
  });
  const totals = data?.totals;
  const invited = typeof totals?.invited === "number" ? totals.invited : null;
  const attending = typeof totals?.attending === "number" ? totals.attending : null;
  const countries = typeof totals?.countries === "number" ? totals.countries : null;
  if (invited === null || invited === 0) return null;
  return (
    <p className="text-sm text-muted-foreground" data-testid="text-slip-guest-totals">
      {invited} invited
      {attending !== null ? ` · ${attending} attending` : ""}
      {countries !== null
        ? ` · ${countries} ${countries === 1 ? "country" : "countries"} of origin`
        : ""}
    </p>
  );
}

export function SlipLogisticsSection({
  tripId,
  planEvents,
}: {
  tripId: string;
  /**
   * THE PLAN'S EVENTS, HANDED DOWN — the plancard DTO's own `events` array, exactly as the slip
   * header counts it (ledger `2026-09-05-slip-events-first-render`). It is a PROP and not a second
   * fetch on purpose: see `eventCount` below.
   */
  planEvents?: readonly PlanEvent[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [anchorsOpen, setAnchorsOpen] = useState(false);
  const [guestsOpen, setGuestsOpen] = useState(false);

  const { data: trip } = useTrip(tripId);
  const { data: allUserExperiences } = useQuery<UserExperience[]>({
    queryKey: ["/api/user-experiences"],
    enabled: !!tripId,
    staleTime: 30_000,
  });
  /**
   * THIS PICK IS EXPLICIT, NOT THE ENDPOINT'S INCIDENTAL ORDER (ledger `2026-09-04-event-order`).
   * It used to be a bare `.find`, which silently took whatever `/api/user-experiences` happened to
   * return first — `created_at DESC` at the time, i.e. the most recently created event bound to
   * this plan. That endpoint's order is now the canonical `event_date ASC NULLS LAST`, so a bare
   * `.find` would have quietly started returning a DIFFERENT event here. Sorting explicitly keeps
   * today's behaviour exactly and removes the hidden coupling rather than moving it.
   *
   * KNOWN AMBIGUITY, deliberately NOT resolved here: a plan can hold many events (migration 277
   * put no uniqueness on `user_experiences.trip_id`), and "the plan's guest list" does not say
   * which one it means. Most-recently-created is what this surface has always used; whether the
   * guest list should instead belong to the event the traveler minted it on is a product decision,
   * not something to settle as a side effect of an ordering fix.
   */
  const linkedExperience =
    allUserExperiences
      ?.filter((e) => e.tripId === tripId)
      .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0] ?? null;
  /**
   * HIDDEN OCCASIONS HAVE NO GUEST SURFACE (migration 276 `default_visibility`; ledger
   * `2026-09-03-switch-readers`, CLAUDE.md Locked Decision 28). The proposal case is the whole
   * point: a guest list and its invites are how the other person finds out. This gate sits BESIDE
   * the existing event-trip test rather than replacing it — `isEventTrip` answers "does this plan
   * have guests at all", `isHidden` answers "may we show them", and the two are independent
   * switches by ruling.
   *
   * §13: an occasion the trip's event type does not uniquely identify, or one whose column is
   * NULL, resolves to NOT hidden — the pre-switch behaviour, unchanged. Nothing disappears
   * because a row was never given a value.
   */
  const { occasion, isHidden } = useOccasionSwitches(tripId);
  /**
   * HOW MANY EVENTS THIS PLAN HAS — ONE SOURCE, AND IT IS THE PLANCARD'S OWN `events` ARRAY
   * (ledger `2026-09-05-slip-events-first-render`; §18 rule 1).
   *
   * ── THE DEFECT THIS CLOSES ────────────────────────────────────────────────────────────────
   * This count used to be derived from `/api/user-experiences` — a USER-scoped list this
   * component fetches for the guest manager — filtered by `tripId`. On a fresh account that list
   * had already been fetched (as `[]`) before the plan existed, and nothing on the mint path
   * invalidated it, so the slip of a plan that had just been minted WITH four events mounted with
   * `eventCount = 0` and offered to organize into events the plan already held — directly under a
   * header that said "4 events". Two sources for one fact is exactly how the two disagreed, so
   * there is now one: the plancard `events` array the header itself counts, handed down as a prop.
   *
   * §13 — an ABSENT prop is still counted as zero, not as unknown, because it is the plancard's
   * own answer for a plan that holds no `user_experiences` row. The list query below survives for
   * what genuinely needs it (the guest manager's event id); it is no longer consulted about this.
   */
  const eventCount = countPlanEvents(planEvents);
  /**
   * The one-time "Organize into events" offer. BOTH halves of the gate live in
   * `canOrganizeIntoEvents`; this reads it and never restates either half. A hidden occasion is
   * excluded for the same reason Guests is — the proposal case must not grow a schedule surface.
   */
  const canOrganize = !isHidden && !!occasion && canOrganizeIntoEvents(occasion, eventCount);
  const isEventTrip =
    !isHidden && (!!linkedExperience || EVENT_TRIP_TYPES.has((trip?.eventType || "").toLowerCase()));

  const createGuestListMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/user-experiences", {
      tripId,
      title: trip?.title || trip?.destination || "My Event",
      location: trip?.destination || "",
      eventDate: trip?.startDate || new Date().toISOString(),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/user-experiences"] }),
    onError: () => toast({ title: "Could not set up guest list", variant: "destructive" }),
  });

  return (
    <div className="space-y-3" data-testid="slip-logistics-section">
      <Collapsible open={anchorsOpen} onOpenChange={setAnchorsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between" data-testid="button-toggle-slip-anchors">
            <span className="flex items-center gap-2">
              <Plane className="w-4 h-4 text-blue-600" />
              Flight, hotel &amp; timing (optional)
            </span>
            <ChevronRight className={`w-4 h-4 transition-transform ${anchorsOpen ? "rotate-90" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-4">
          <TemporalAnchorManager
            tripId={tripId}
            title="Flight & hotel times"
            description="Add arrival, departure, and check-in/out times so we can build a realistic plan around them."
          />
          <div className="grid md:grid-cols-2 gap-4">
            <ScheduleValidator tripId={tripId} />
            <EnergyBudgetDisplay tripId={tripId} />
          </div>
          <AnchorSuggestionsPanel tripId={tripId} />
          {(trip?.eventType || "").toLowerCase() === "wedding" && (
            <WeddingAnchorPresets
              tripId={tripId}
              templateSlug="wedding"
              /* F-1: startDate is already a "YYYY-MM-DD" DATE value — round-tripping it
                 through `new Date().toISOString()` re-reads it as UTC midnight and can slice
                 back the PREVIOUS day. calendarDateToIso keeps the calendar day it was given. */
              eventDate={calendarDateToIso(trip?.startDate)}
            />
          )}
        </CollapsibleContent>
      </Collapsible>

      {/*
        ORGANIZE INTO EVENTS — the one-time offer. It sits ABOVE the two rosters because it is the
        thing that gives the plan the events those rosters hang off (an invite belongs to an
        event, ruling 37). It disappears the moment the plan holds one.

        `existingTitles` reads the SAME ONE source as the count above (the plancard `events`), so
        the idempotency guard and the eligibility gate can never be looking at different lists.
      */}
      {canOrganize && occasion && (
        <SlipOrganizeEvents
          tripId={tripId}
          occasion={occasion}
          startDate={trip?.startDate as unknown as string | null}
          endDate={trip?.endDate as unknown as string | null}
          destination={trip?.destination ?? null}
          existingTitles={(planEvents ?? []).map((e) => e.title ?? null)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["/api/user-experiences"] })}
        />
      )}

      {/*
        THE TRAVELING PARTY — who is coming WITH you. Gated only on the hidden-occasion switch
        (Locked Decision 28): unlike Guests, every plan has a traveling party, so there is no
        event-trip test here. It is NEVER merged with the guest roster (Locked Decision 37) and
        the section's own copy says which question each list answers.
      */}
      {!isHidden && <SlipTravelingParty tripId={tripId} />}

      {isEventTrip && (
        <Collapsible open={guestsOpen} onOpenChange={setGuestsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between" data-testid="button-toggle-slip-guests">
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Guests &amp; invites
              </span>
              <ChevronRight className={`w-4 h-4 transition-transform ${guestsOpen ? "rotate-90" : ""}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            {linkedExperience ? (
              <div className="space-y-3">
                {/*
                  THE PLAN-LEVEL ANSWER TO THE AMBIGUITY NOTED ABOVE (ledger
                  `2026-09-04-guests-per-event`). The manager below still edits ONE event's invites,
                  which is correct — an invite belongs to an event. What was missing was the view
                  across all of them, and this link is it: /plans/:tripId/guests is one row per
                  person with a column per event. It does not replace this block; it is where "who
                  is coming to what" is actually answerable.
                */}
                {/* THE TOTALS THE ARTBOARD DRAWS (re-audit A20). The link below has always been
                    here; what the slip could not say was how the list is doing, so the answer sat
                    one navigation away. These are the SERVER's own numbers from the SAME derived
                    roster the Guests page renders (`GET /api/trips/:tripId/guests`) — this
                    component computes nothing and counts nothing (§18 rule 1; the derivation has
                    one home).
                    §13 — the block is OMITTED, not zero-filled, whenever the roster is empty or
                    has not answered: a plan whose events nobody has been invited to yet says
                    nothing here rather than "0 invited", and a request that failed (a non-owner,
                    an offline tab) is an unknown, not an empty list. `countries` is already
                    omitted-when-absent server-side and stays that way. */}
                <SlipGuestTotals tripId={tripId} />
                <Link href={`/plans/${tripId}/guests`}>
                  <a
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    data-testid="link-open-guest-list"
                  >
                    Open guest list
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </Link>
                <GuestInviteManager
                  experienceId={linkedExperience.id}
                  eventName={linkedExperience.title || trip?.title || trip?.destination || "Your event"}
                  eventDestination={linkedExperience.location || trip?.destination || ""}
                  eventDate={(linkedExperience.eventDate as string | null) || (trip?.startDate as unknown as string) || new Date().toISOString()}
                />
              </div>
            ) : (
              <div className="py-10 flex flex-col items-center gap-4 text-center">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <UserPlus className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground mb-1">Set up your guest list</p>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Track RSVPs, send invites, and manage attendees for {trip?.title || trip?.destination || "this event"}.
                  </p>
                </div>
                <Button
                  onClick={() => createGuestListMutation.mutate()}
                  disabled={createGuestListMutation.isPending}
                  data-testid="button-setup-guest-list"
                >
                  {createGuestListMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Setting up…</>
                  ) : (
                    <><UserPlus className="w-4 h-4 mr-2" />Set up guest list</>
                  )}
                </Button>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
