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
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2, Plane, UserPlus, Users } from "lucide-react";
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
import type { UserExperience } from "@shared/schema";

const EVENT_TRIP_TYPES = new Set(["wedding", "honeymoon", "proposal", "anniversary", "birthday", "corporate"]);

export function SlipLogisticsSection({ tripId }: { tripId: string }) {
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
  const { isHidden } = useOccasionSwitches(tripId);
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
              <GuestInviteManager
                experienceId={linkedExperience.id}
                eventName={linkedExperience.title || trip?.title || trip?.destination || "Your event"}
                eventDestination={linkedExperience.location || trip?.destination || ""}
                eventDate={(linkedExperience.eventDate as string | null) || (trip?.startDate as unknown as string) || new Date().toISOString()}
              />
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
