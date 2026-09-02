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
  const linkedExperience = allUserExperiences?.find((e) => e.tripId === tripId) ?? null;
  const isEventTrip = !!linkedExperience || EVENT_TRIP_TYPES.has((trip?.eventType || "").toLowerCase());

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
