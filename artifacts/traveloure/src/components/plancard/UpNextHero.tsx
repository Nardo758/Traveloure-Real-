/**
 * "Up Next" hero — CLAUDE.md §18, item 2 (+ item 5's mode-aware primary action).
 *
 * Mobile-only top-of-card summary of the live day's next activity. Reuses the EXISTING
 * temporal engine (plancard-temporal.ts, extracted from ActivitiesSection) so this is the
 * same "what's next right now" computation the row badges/FAB already use — no second
 * source of truth. Renders nothing when there is no live/upcoming activity today (§13 —
 * honest absence on a fully-past or not-yet-started day), matching the FAB's own gate.
 */
import { Navigation2, MapPin, Phone, Car, ExternalLink } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { useToast } from "@/hooks/use-toast";
import { openInMaps } from "@/lib/navigate";
import type { PlanCardDay, PlanCardLegData } from "./plancard-types";
import { useLiveNow, useVisitedActivities, getUpNextInfo, formatCountdown } from "./plancard-temporal";
import { resolvePrimaryAction } from "./primary-action";

interface UpNextHeroProps {
  tripId: string;
  day: PlanCardDay | undefined;
  legs: PlanCardLegData[];
}

function BookRideButton({ leg, activityName }: { leg: PlanCardLegData; activityName: string }) {
  const { user } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/affiliate-booking-requests", {
        itemName: `Ride to ${activityName}`,
        itemDescription: leg.fromName && leg.toName ? `${leg.fromName} → ${leg.toName}` : null,
        partnerName: null,
        partnerCategory: "transport",
        // §16 closure: opaque server-minted vault token — the client never holds the URL;
        // the booking agent's URL is resolved server-side from the vault.
        bookingToken: leg.bookingToken,
        travelers: 1,
      }),
    onSuccess: () => {
      toast({ title: "Booking request sent", description: "Our booking agent will handle this and add it to your trip." });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Couldn't send request", description: err?.message || "Please try again." });
    },
  });

  const handleClick = () => {
    if (!user) {
      openSignInModal();
      return;
    }
    if (mutation.isPending || mutation.isSuccess) return;
    mutation.mutate();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={mutation.isPending || mutation.isSuccess}
      className="flex-1 min-h-11 bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-[13.5px] font-bold flex items-center justify-center gap-2 disabled:opacity-70"
      data-testid="button-hero-book-ride"
    >
      <ExternalLink className="w-4 h-4" />
      {mutation.isSuccess ? "Requested ✓" : mutation.isPending ? "Sending…" : "Book this ride"}
    </button>
  );
}

export function UpNextHero({ tripId, day, legs }: UpNextHeroProps) {
  const now = useLiveNow();
  const [visited] = useVisitedActivities(tripId, day);
  const { isLiveDay, upNextActivity, upNextLeg } = getUpNextInfo(day, legs, now, visited);

  // §13: no hero on a fully-past or not-yet-started day — only the live day with a real
  // upcoming activity renders anything here.
  if (!isLiveDay || !upNextActivity || !day) return null;

  const countdown = formatCountdown(upNextActivity, day.date, now);
  const action = resolvePrimaryAction(upNextActivity, upNextLeg);

  return (
    <div
      className="sm:hidden relative overflow-hidden rounded-2xl mx-4 mt-3 mb-1 px-4 pt-4 pb-3.5 text-white shadow-lg bg-gradient-to-br from-slate-900 via-slate-800 to-primary/30"
      data-testid={`up-next-hero-${tripId}`}
    >
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-primary-foreground/90" style={{ color: "#ffb3c0" }}>
          Up next
        </span>
        {countdown && (
          <span
            className="text-[11.5px] font-bold bg-white/15 px-2.5 py-1 rounded-full tabular-nums"
            data-testid="text-hero-countdown"
          >
            {countdown}
          </span>
        )}
      </div>

      <h3 className="text-[18px] font-bold leading-tight mb-0.5" data-testid="text-hero-title">
        {upNextActivity.name}
      </h3>
      <p className="text-[13px] text-white/75 tabular-nums mb-2" data-testid="text-hero-time">
        {upNextActivity.time}
      </p>

      {upNextActivity.location && (
        <div className="flex items-start gap-1.5 text-[12px] text-white/85 mb-3" data-testid="text-hero-meeting-point">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{upNextActivity.location}</span>
        </div>
      )}

      {upNextActivity.expertNote && (
        <div
          className="flex items-start gap-2 bg-white/10 border border-white/15 rounded-lg px-2.5 py-2 mb-3 text-[11.5px] leading-relaxed text-white/90"
          data-testid="text-hero-expert-note"
        >
          <span className="text-[10px] font-extrabold uppercase tracking-wide flex-shrink-0" style={{ color: "#ffb3c0" }}>
            Tip
          </span>
          <span>{upNextActivity.expertNote}</span>
        </div>
      )}

      {action.kind === "navigate" && (
        <button
          type="button"
          onClick={() =>
            openInMaps({
              destination: {
                lat: action.activity.lat,
                lng: action.activity.lng,
                name: action.activity.name,
                mapsUrl: action.activity.mapsUrl,
              },
              mode: action.mode,
            })
          }
          className="w-full min-h-11 bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-[13.5px] font-bold flex items-center justify-center gap-2"
          data-testid="button-hero-navigate"
        >
          <Navigation2 className="w-4 h-4" />
          Navigate
        </button>
      )}

      {action.kind === "pickup" && (
        <div className="bg-white/10 border border-white/15 rounded-xl px-3 py-2.5" data-testid="card-hero-pickup">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-300 mb-1.5">
            <Car className="w-3.5 h-3.5" /> Ride booked
          </div>
          {action.pickupPoint && (
            <p className="text-[12px] text-white/90 mb-0.5" data-testid="text-hero-pickup-point">
              Pickup: {action.pickupPoint}
            </p>
          )}
          {action.pickupTime && (
            <p className="text-[12px] text-white/90 mb-0.5" data-testid="text-hero-pickup-time">
              {action.pickupTime}
            </p>
          )}
          {action.rideDetails && (
            <p className="text-[12px] text-white/75 mb-1.5" data-testid="text-hero-ride-details">
              {action.rideDetails}
            </p>
          )}
          {action.driverPhone && (
            <a
              href={`tel:${action.driverPhone}`}
              className="inline-flex items-center gap-1.5 min-h-11 px-3 text-[12.5px] font-bold text-white bg-white/15 rounded-lg"
              data-testid="link-hero-call-driver"
            >
              <Phone className="w-3.5 h-3.5" /> Call driver
            </a>
          )}
        </div>
      )}

      {action.kind === "book_ride" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-[11.5px] text-white/85">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{action.activity.location}</span>
          </div>
          <BookRideButton leg={action.leg} activityName={action.activity.name} />
        </div>
      )}
    </div>
  );
}
