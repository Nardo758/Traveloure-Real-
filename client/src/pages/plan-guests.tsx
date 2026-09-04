/**
 * /plans/:tripId/guests — ONE list, a column per event.
 * Ledger `2026-09-04-guests-per-event`; CLAUDE.md Locked Decision 37; artboard
 * `docs/design/wedding-flow/Guests.dc.html`.
 *
 * An invite belongs to ONE event (`event_invites.experience_id`) and a plan holds many events, so
 * the plan's roster is DERIVED, not stored: `GET /api/trips/:tripId/guests` returns one row per
 * person (deduplicated by normalised email) with that person's RSVP for each event. This page
 * renders that answer and computes nothing of its own — the derivation has ONE home, on the
 * server (§18 rule 1).
 *
 * WHAT THIS PAGE DELIBERATELY DOES NOT SHOW (§13):
 *   • The artboard's fourth stat tile, "Brunch (family only) — 22". Nothing in the data marks an
 *     event "family only": that is a host's description of who they invited, and no column holds
 *     it. The tile is replaced by EVENTS (a fact the roster carries), rather than inventing a
 *     subset label.
 *   • An event's start TIME. `user_experiences` has `event_date` and no time-of-day column.
 *   • "No dietary restrictions" / "Unknown origin". A blank cell means the guest has not said,
 *     which is not the same as having nothing to say.
 *
 * ONE DELIBERATE DEPARTURE FROM THE ARTBOARD'S GLYPHS. The mock draws three marks and uses the
 * same dash for a guest who DECLINED and a guest who was NEVER INVITED. Those are different facts,
 * and the whole point of the column-per-event layout is that an invite belongs to one event — so
 * declined gets its own ✕. Every cell also carries a written label for screen readers; the glyph
 * is never the only carrier of meaning.
 *
 * The traveling party (`trip_participants` — who owes what, who arrives when) is a DIFFERENT list
 * under a different predicate and is not merged in here, by ruling
 * (`2026-09-04-guest-list-reconciliation`).
 */
import { useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GuestInviteManager } from "@/components/GuestInviteManager";
import { useOccasionSwitches } from "@/hooks/use-occasion-switches";
import { useTrip } from "@/hooks/use-trips";
import { parseTripDate } from "@/lib/calendar-date";

type PlanGuestRsvp = "attending" | "declined" | "pending" | "not_invited";

interface RosterEvent {
  id: string;
  title: string | null;
  eventDate: string | null;
}

interface RosterGuest {
  key: string;
  name: string;
  email?: string;
  from?: string;
  dietary: string[];
  rsvp: Record<string, PlanGuestRsvp>;
}

interface PlanGuestRoster {
  events: RosterEvent[];
  guests: RosterGuest[];
  totals: {
    invited: number;
    attending: number;
    /** ABSENT when no guest states an origin country — the tile is then not rendered at all. */
    countries?: number;
    perEvent: Record<string, { invited: number; attending: number }>;
  };
}

const RSVP_LABEL: Record<PlanGuestRsvp, string> = {
  attending: "Attending",
  declined: "Declined",
  pending: "No reply",
  not_invited: "Not invited",
};

/** One cell mark. The label rides along for assistive tech — the glyph is never the only signal. */
function RsvpMark({ rsvp }: { rsvp: PlanGuestRsvp }) {
  const label = RSVP_LABEL[rsvp];
  const common = { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none" } as const;
  return (
    <span className="inline-flex items-center" title={label} data-testid={`rsvp-${rsvp}`}>
      <span className="sr-only">{label}</span>
      {rsvp === "attending" && (
        <svg {...common} stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="text-teal-700 dark:text-teal-400" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
      {rsvp === "declined" && (
        <svg {...common} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="text-muted-foreground" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      )}
      {rsvp === "pending" && (
        <svg {...common} stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground/70" aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
        </svg>
      )}
      {rsvp === "not_invited" && (
        <svg {...common} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-muted-foreground/50" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      )}
    </span>
  );
}

/**
 * The single RSVP summary the artboard puts beside the name. Derived from the per-event answers
 * this page was given and nothing else: a yes anywhere is a yes; otherwise a stated no is a no;
 * otherwise the guest has not replied.
 */
function overallRsvp(guest: RosterGuest): string {
  const answers = Object.values(guest.rsvp);
  if (answers.includes("attending")) return "Yes";
  if (answers.includes("declined")) return "Declined";
  return "No reply";
}

function StatTile({ value, label, testId }: { value: number; label: string; testId: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1.5" data-testid={testId}>
      <span className="text-2xl font-semibold text-foreground">{value}</span>
      <span className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
    </div>
  );
}

function eventLabel(event: RosterEvent, index: number): string {
  return event.title?.trim() || `Event ${index + 1}`;
}

function formatEventDate(value: string | null): string | null {
  const parsed = parseTripDate(value);
  if (!parsed) return null;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function PlanGuestsPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { data: trip } = useTrip(tripId || "");
  const { isHidden } = useOccasionSwitches(tripId);
  const [inviteEvent, setInviteEvent] = useState<RosterEvent | null>(null);

  const { data, isLoading, isError } = useQuery<PlanGuestRoster>({
    queryKey: [`/api/trips/${tripId}/guests`],
    enabled: !!tripId && !isHidden,
    staleTime: 30_000,
  });

  const planTitle = trip?.title || trip?.destination || "This plan";
  const start = formatEventDate((trip?.startDate as unknown as string) ?? null);
  const end = formatEventDate((trip?.endDate as unknown as string) ?? null);
  const dateLine = start && end ? `${start} to ${end}` : start ?? null;

  const header = (
    <div className="flex flex-col gap-1.5">
      <Link href={`/plans/${tripId}`}>
        <a className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground w-fit" data-testid="link-back-to-plan">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to the plan
        </a>
      </Link>
      <h1 className="text-2xl font-semibold text-foreground" data-testid="heading-plan-guests">Guests</h1>
      <p className="text-xs text-muted-foreground" data-testid="text-plan-subline">
        {planTitle}
        {dateLine ? ` · ${dateLine}` : ""}
      </p>
    </div>
  );

  /**
   * A HIDDEN OCCASION HAS NO GUEST SURFACE (migration 276 `default_visibility`; Locked Decision 28,
   * the `SlipProposal` ruling). The proposal case is the point: a guest list is how the other
   * person finds out. Nothing is fetched in this state.
   */
  if (isHidden) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl space-y-4" data-testid="plan-guests-hidden">
        {header}
        <p className="text-sm text-muted-foreground">
          This plan is a surprise, so it has no guest list. Change the occasion's visibility if you
          want to invite people.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl space-y-4">
        {header}
        <p className="text-sm text-muted-foreground" data-testid="text-guests-error">
          Couldn't load this guest list. It may not exist, or you may not have access to it.
        </p>
      </div>
    );
  }

  const { events, guests, totals } = data;

  return (
    <div className="p-4 sm:p-6 space-y-5" data-testid="page-plan-guests">
      {header}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile value={totals.invited} label="Invited" testId="stat-invited" />
        <StatTile value={totals.attending} label="Attending" testId="stat-attending" />
        {/* OMITTED, NOT ZERO (§13): the server sends `countries` only when a guest has stated an
            origin country. "0 countries of origin" would read as a fact about the guests. */}
        {typeof totals.countries === "number" && (
          <StatTile value={totals.countries} label="Countries of origin" testId="stat-countries" />
        )}
        {/* The artboard's fourth tile is "Brunch (family only)". No column marks an event family
            only, so this counts the plan's EVENTS instead — a fact the roster actually carries. */}
        <StatTile value={events.length} label="Events" testId="stat-events" />
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center space-y-2" data-testid="empty-no-events">
          <p className="text-sm font-medium text-foreground">This plan has no events yet</p>
          <p className="text-sm text-muted-foreground">
            An invite belongs to an event, so the first step is setting one up on the plan.
          </p>
          <Link href={`/plans/${tripId}`}>
            <a className="text-sm font-medium text-primary hover:underline">Open the plan</a>
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-plan-guests">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2.5 font-medium text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">Guest</th>
                <th className="px-3 py-2.5 font-medium text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">From</th>
                <th className="px-3 py-2.5 font-medium text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">RSVP</th>
                <th className="px-3 py-2.5 font-medium text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">Dietary</th>
                {events.map((event, index) => (
                  <th key={event.id} className="px-3 py-2.5 font-medium text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground align-top">
                    <div className="flex flex-col gap-1 items-start">
                      <span data-testid={`column-event-${event.id}`}>{eventLabel(event, index)}</span>
                      <span className="normal-case tracking-normal text-[10.5px] text-muted-foreground/80">
                        {totals.perEvent[event.id]?.attending ?? 0} of {totals.perEvent[event.id]?.invited ?? 0} attending
                      </span>
                      {/* The ONE invite writer is GuestInviteManager, opened for THIS event — no
                          second invite rail is built here. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 -ml-1.5 text-[11px] normal-case tracking-normal"
                        onClick={() => setInviteEvent(event)}
                        data-testid={`button-invite-${event.id}`}
                      >
                        <UserPlus className="w-3 h-3 mr-1" />
                        Invite
                      </Button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {guests.length === 0 ? (
                <tr>
                  <td colSpan={4 + events.length} className="px-3 py-8 text-center text-muted-foreground" data-testid="empty-no-guests">
                    No one has been invited yet. Use Invite on an event column to add guests.
                  </td>
                </tr>
              ) : (
                guests.map((guest) => (
                  <tr key={guest.key} className="border-t border-border" data-testid={`row-guest-${guest.key}`}>
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-foreground">{guest.name}</span>
                      {guest.email && guest.email !== guest.name && (
                        <span className="block text-xs text-muted-foreground">{guest.email}</span>
                      )}
                    </td>
                    {/* Blank when the guest has not stated an origin — never "Unknown" (§13). */}
                    <td className="px-3 py-2.5 text-muted-foreground">{guest.from ?? ""}</td>
                    <td className="px-3 py-2.5 text-foreground">{overallRsvp(guest)}</td>
                    {/* Blank when nothing was stated — never "None" (§13). */}
                    <td className="px-3 py-2.5 text-muted-foreground">{guest.dietary.join(", ")}</td>
                    {events.map((event) => (
                      <td key={event.id} className="px-3 py-2.5">
                        <RsvpMark rsvp={guest.rsvp[event.id] ?? "not_invited"} />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground" data-testid="text-guests-footer">
        One list. Each column is an event. An invite belongs to an event, so brunch can be family
        only without a second list.
      </p>

      <Dialog open={!!inviteEvent} onOpenChange={(open) => !open && setInviteEvent(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {inviteEvent ? eventLabel(inviteEvent, events.findIndex((e) => e.id === inviteEvent.id)) : "Invite"}
            </DialogTitle>
          </DialogHeader>
          {inviteEvent && (
            <GuestInviteManager
              experienceId={inviteEvent.id}
              eventName={eventLabel(inviteEvent, events.findIndex((e) => e.id === inviteEvent.id))}
              eventDestination={trip?.destination || ""}
              eventDate={inviteEvent.eventDate || (trip?.startDate as unknown as string) || ""}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
