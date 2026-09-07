/**
 * upcoming.service.ts — HOME OWNS THE TIME AXIS: the dated rows across every plan, nearest first.
 * Ledger `2026-09-07-home-time-axis` (lane L10); executes CLAUDE.md Locked Decision 45 (8)
 * (ruling row `2026-09-07-home-owns-time-axis`, amending R-A). §13, §14 (reads), §18 rule 1.
 *
 * ONE READER, TWO HALVES. `buildUpcomingRows` is PURE — rows in, dated `UpcomingRow[]` out, no
 * db, no clock of its own (`now` is an input) — so every rule below is provable with no database
 * (`server/services/__tests__/upcoming.test.ts`). `loadUpcomingForUser` is the thin loader that
 * fetches the SESSION user's own plans and their rows and hands them to the builder. `../db` is
 * imported DYNAMICALLY there (the `balance-payer.service.ts` shape) so the pure half can be
 * imported without a DATABASE_URL.
 *
 * THE ROW KINDS AND THEIR SOURCES — each row names the column that produced it (`source`), so a
 * reader can always answer "why is this here":
 *   booking_unpaid   `service_bookings.status` ∈ PROVISIONAL (`payment_pending`, the unauthorized
 *                    claim) — DATED by `resolveServiceDate` (booked slot, else the checkout's
 *                    `booking_details.scheduledDate`); `service_bookings` has NO service-date
 *                    column, so a claim with neither is UNDATED and OMITTED.
 *   balance_due      `service_bookings.balance_due_at` on a `deposit_paid` row whose balance is
 *                    not yet paid. A timestamp — an instant, not a day.
 *   handover         DERIVED: `trips.start_date − 48h`, through the ONE window
 *                    (`shared/plan-timing.ts` ← `TRIP_CARD_HANDOVER_WINDOW_MS`). Emitted only for a
 *                    plan with no final yet: once a final exists the Trip Card is already primary
 *                    and there is no takeover to announce.
 *   trip_start       `trips.start_date`.
 *   event            `user_experiences.event_date`, with `start_time` and the invite tally. Invites
 *                    carry `rsvp_status` but NO deadline column, so no deadline is shown — the
 *                    source note says so out loud.
 *   occasion_draft   `occasion_drafts.cycle_key` — the concrete occurrence of
 *                    `occasions.occasion_date` for which a Plus draft has FIRED END TO END
 *                    (`generated_at` stamped and a `trip_id` promoted; Locked Decision 26). An
 *                    occasion with no such draft row is NOT a row here.
 *
 * §13 — THE ABSENCES ARE ANSWERS.
 *   • A row with no date is OMITTED, never guessed (every kind above states its date source).
 *   • `tz` is present ONLY when the plan carries a usable IANA zone (Locked Decision 30). With
 *     NULL the row's date is a CALENDAR DAY (`dateKind: "day"`) compared on the calendar, and a
 *     derived instant (the handover) degrades to a calendar day too — no zone is ever claimed.
 *   • "0 invites" is never rendered: an event with no invites carries no tally clause.
 *   • Item counts appear in the trip-start sentence only when the plan holds items; a plan with
 *     none says "begins." and nothing more.
 *
 * §14 — the owner is the SESSION user, passed in by the route from `getUserId(req)`; nothing here
 * reads a query string or a body.
 */
import { PROVISIONAL_BOOKING_STATUSES } from "@shared/booking-visibility";
import {
  HANDOVER_WINDOW_MS,
  calendarDayOf,
  calendarParts,
  handoverInstant,
  planStartInstant,
} from "@shared/plan-timing";

const DAY_MS = 24 * 60 * 60 * 1000;
const HANDOVER_HOURS = HANDOVER_WINDOW_MS / (60 * 60 * 1000); // derived, never spelled

/** Default and ceiling for `?window=` (days). The route clamps; the builder trusts its input. */
export const UPCOMING_DEFAULT_WINDOW_DAYS = 60;
export const UPCOMING_MAX_WINDOW_DAYS = 365;

export type UpcomingKind =
  | "booking_unpaid"
  | "balance_due"
  | "handover"
  | "trip_start"
  | "event"
  | "occasion_draft";

export interface UpcomingAction {
  label: string;
  href: string;
}

export interface UpcomingRow {
  /** `"YYYY-MM-DD"` when `dateKind === "day"`; an ISO instant when `dateKind === "instant"`. */
  date: string;
  /** A calendar day (compared on the calendar, no clock) or a real instant. */
  dateKind: "day" | "instant";
  /** The plan's IANA zone — present ONLY when the plan carries a usable one (LD 30). */
  tz?: string;
  kind: UpcomingKind;
  sentence: string;
  /** The plan the row belongs to; null only for a booking that is on no plan. */
  tripId: string | null;
  planName: string;
  /** The column (or derivation) that produced this row — the mono source note on the page. */
  source: string;
  action: UpcomingAction;
}

// ── Builder inputs: the columns each kind reads, nothing more ─────────────────────────────────

export interface UpcomingTrip {
  id: string;
  title?: string | null;
  destination: string;
  startDate: string | Date | null;
  timezone?: string | null;
  finalizedAt?: string | Date | null;
  /** Latest `trip_finals.version`, or null when no final exists (the D8 rule the Trip Card applies). */
  finalVersion?: number | null;
}

export interface UpcomingBooking {
  id: string;
  tripId: string | null;
  status: string | null;
  serviceName?: string | null;
  /** `resolveServiceDate`'s answer ("YYYY-MM-DD"), or null — the ONE derivation, done by the loader. */
  serviceDate?: string | null;
  balanceDueAt?: string | Date | null;
  balancePaid?: boolean | null;
  /** `service_bookings.balance_amount` as stored (decimal string); display only, never a charge. */
  balanceAmount?: string | null;
}

export interface UpcomingEvent {
  id: string;
  tripId: string;
  title?: string | null;
  eventDate: string | Date | null;
  /** "HH:MM" wall-clock, stored verbatim (LD 35); null = no time, never midnight. */
  startTime?: string | null;
  location?: string | null;
  /** Invite tallies from the server's own count (LD 37); 0 invites ⇒ no clause. */
  invited: number;
  answered: number;
}

export interface UpcomingOccasionDraft {
  occasionId: string;
  label?: string | null;
  templateKey: string;
  /** `occasion_drafts.cycle_key` — the occurrence date ("YYYY-MM-DD") this draft fired for. */
  cycleKey: string;
  /** `occasion_drafts.trip_id` — the promoted draft plan. Null ⇒ not fired end to end ⇒ no row. */
  draftTripId: string | null;
  /** `occasion_drafts.generated_at` — null ⇒ claimed but never generated ⇒ no row. */
  generatedAt: string | Date | null;
}

export interface UpcomingItemCounts {
  tripId: string;
  inPlanning: number;
  withExpert: number;
  readyForCheckout: number;
  purchased: number;
}

export interface UpcomingInput {
  now: Date;
  windowDays: number;
  trips: UpcomingTrip[];
  bookings: UpcomingBooking[];
  events: UpcomingEvent[];
  occasionDrafts: UpcomingOccasionDraft[];
  itemCounts: UpcomingItemCounts[];
}

// ── Small pure helpers ────────────────────────────────────────────────────────────────────────

const DEFAULT_TRIP_TITLE = "My Trip";

/** The plan's name as the traveler would say it: a real title, else the destination. */
export function planNameOf(trip: Pick<UpcomingTrip, "title" | "destination">): string {
  const title = (trip.title ?? "").trim();
  if (title && title !== DEFAULT_TRIP_TITLE) return title;
  return (trip.destination ?? "").trim() || "Your plan";
}

function cityOf(destination: string | null | undefined): string {
  return (destination ?? "").split(",")[0]?.trim() || "your trip";
}

function toInstant(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Sentence tail for a plan's item counts — absent when the plan holds nothing (§13). */
function itemCountsClause(c: UpcomingItemCounts | undefined): string {
  if (!c) return "";
  const total = c.inPlanning + c.withExpert + c.readyForCheckout + c.purchased;
  if (total <= 0) return "";
  const parts: string[] = [];
  if (c.purchased > 0) parts.push(`${c.purchased} booked`);
  if (c.readyForCheckout > 0) parts.push(`${c.readyForCheckout} in checkout`);
  if (c.withExpert > 0) parts.push(`${c.withExpert} with your expert`);
  if (c.inPlanning > 0) parts.push(`${c.inPlanning} planned`);
  return ` ${plural(total, "item")}: ${parts.join(", ")}.`;
}

interface Candidate {
  row: UpcomingRow;
  /** Ordering key only — never rendered, never a claim. */
  sortMs: number;
  /** For day rows: the calendar day the window floor is compared against. */
  day?: string;
  /** For day rows: which zone (or none) the "today" floor is read in. */
  tz?: string | null;
}

const KIND_ORDER: Record<UpcomingKind, number> = {
  booking_unpaid: 0,
  balance_due: 1,
  handover: 2,
  trip_start: 3,
  event: 4,
  occasion_draft: 5,
};

// ── The builder ───────────────────────────────────────────────────────────────────────────────

export function buildUpcomingRows(input: UpcomingInput): UpcomingRow[] {
  const { now, windowDays } = input;
  const ceilingMs = now.getTime() + windowDays * DAY_MS;
  const tripsById = new Map(input.trips.map((t) => [t.id, t] as const));
  const countsByTrip = new Map(input.itemCounts.map((c) => [c.tripId, c] as const));
  const candidates: Candidate[] = [];

  /** A calendar-day row: `date` is the day itself; ordering uses the plan's (or UTC) midnight. */
  const dayRow = (day: string, timezone: string | null | undefined, row: Omit<UpcomingRow, "date" | "dateKind" | "tz">) => {
    const start = planStartInstant(day, timezone);
    if (!start) return; // unparseable day — nothing to date the row with (§13)
    candidates.push({
      row: { date: start.day, dateKind: "day", ...(start.zoned ? { tz: timezone as string } : {}), ...row },
      sortMs: start.instant.getTime(),
      day: start.day,
      tz: start.zoned ? (timezone as string) : null,
    });
  };

  /** A real-instant row (a timestamp column, or a derived instant on a zoned plan). */
  const instantRow = (instant: Date, timezone: string | null | undefined, zoned: boolean, row: Omit<UpcomingRow, "date" | "dateKind" | "tz">) => {
    candidates.push({
      row: { date: instant.toISOString(), dateKind: "instant", ...(zoned && timezone ? { tz: timezone } : {}), ...row },
      sortMs: instant.getTime(),
    });
  };

  // trip_start + handover — one pass over the plans.
  for (const trip of input.trips) {
    const planName = planNameOf(trip);
    const city = cityOf(trip.destination);
    const hasFinal = trip.finalVersion != null;

    dayRow(String(trip.startDate instanceof Date ? trip.startDate.toISOString() : trip.startDate ?? ""), trip.timezone, {
      kind: "trip_start",
      sentence: `${city} begins.${itemCountsClause(countsByTrip.get(trip.id))}`,
      tripId: trip.id,
      planName,
      source: "trips.start_date",
      action: hasFinal ? { label: "Trip Card", href: `/trip/${trip.id}` } : { label: "Open slip", href: `/plans/${trip.id}` },
    });

    // The handover is announced only while there is a takeover to come: a plan that already has
    // a final (or was explicitly finalized) has the Trip Card as primary already.
    if (!hasFinal && !trip.finalizedAt) {
      const opens = handoverInstant(trip.startDate, trip.timezone);
      if (opens) {
        const handoverRow = {
          kind: "handover" as const,
          sentence: `The Trip Card takes over for ${city}: the ${HANDOVER_HOURS}-hour handover.`,
          tripId: trip.id,
          planName,
          source: `derived: trips.start_date − ${HANDOVER_HOURS}h`,
          action: { label: "View Trip Card", href: `/trip/${trip.id}` },
        };
        if (opens.zoned) {
          instantRow(opens.instant, trip.timezone, true, handoverRow);
        } else {
          // NULL zone (LD 30): `start − 48h` is not an instant anyone can vouch for, so the row
          // degrades to the calendar day it falls on, compared on the calendar, no zone claimed.
          dayRow(opens.day, null, handoverRow);
        }
      }
    }
  }

  // booking_unpaid + balance_due.
  const provisional = new Set<string>(PROVISIONAL_BOOKING_STATUSES);
  for (const b of input.bookings) {
    const trip = b.tripId ? tripsById.get(b.tripId) : undefined;
    const planName = trip ? planNameOf(trip) : "Booking";
    const name = (b.serviceName ?? "").trim() || "A booking";
    const bookingsHref = trip ? `/plans/${trip.id}` : "/bookings";

    if (b.status && provisional.has(b.status)) {
      // Dated by `resolveServiceDate` (loader) — a claim with no service date is undated ⇒ omitted.
      if (!b.serviceDate) continue;
      dayRow(b.serviceDate, trip?.timezone, {
        kind: "booking_unpaid",
        sentence: `${name} is unpaid. The claim is released if it is not paid.`,
        tripId: trip?.id ?? null,
        planName,
        source: "service_bookings.status",
        action: { label: "Complete payment", href: bookingsHref },
      });
      continue;
    }

    if (b.status === "deposit_paid" && !b.balancePaid) {
      const due = toInstant(b.balanceDueAt);
      if (!due) continue; // no cutoff recorded ⇒ undated ⇒ omitted (§13)
      const amount = b.balanceAmount && Number(b.balanceAmount) > 0 ? ` of $${Number(b.balanceAmount).toFixed(2)}` : "";
      instantRow(due, trip?.timezone, !!(trip && planStartInstant(trip.startDate, trip.timezone)?.zoned), {
        kind: "balance_due",
        sentence: `${name} balance${amount} is due.`,
        tripId: trip?.id ?? null,
        planName,
        source: "service_bookings.balance_due_at",
        action: { label: "Pay balance", href: bookingsHref },
      });
    }
  }

  // event — bound to one of the session user's plans by construction (the loader joins on it).
  for (const e of input.events) {
    const trip = tripsById.get(e.tripId);
    if (!trip) continue;
    const day = e.eventDate instanceof Date ? e.eventDate.toISOString() : e.eventDate;
    if (!calendarParts(day)) continue; // no event day ⇒ omitted (§13)
    const zone = planStartInstant(day as string, trip.timezone)?.zoned ? trip.timezone : null;
    const title = (e.title ?? "").trim() || "Event";
    const place = (e.location ?? "").trim();
    const time = (e.startTime ?? "").trim();
    const when = time ? `, ${time}${zone ? ` ${zone}` : ""}` : "";
    const tally = e.invited > 0 ? ` ${e.answered} of ${plural(e.invited, "guest")} ${e.answered === 1 ? "has" : "have"} answered.` : "";
    dayRow(day as string, trip.timezone, {
      kind: "event",
      sentence: `${title}${place ? ` at ${place}` : ""}${when}.${tally}`,
      tripId: trip.id,
      planName: planNameOf(trip),
      source: "user_experiences.event_date · no RSVP deadline column exists, so none is shown",
      action: e.invited > 0 ? { label: "Guest list", href: `/plans/${trip.id}/guests` } : { label: "Open slip", href: `/plans/${trip.id}` },
    });
  }

  // occasion_draft — ONLY a draft that fired end to end (generated + promoted to a trip).
  for (const o of input.occasionDrafts) {
    if (!o.generatedAt || !o.draftTripId) continue;
    const label = (o.label ?? "").trim() || o.templateKey.replace(/[_-]+/g, " ");
    dayRow(o.cycleKey, null, {
      kind: "occasion_draft",
      sentence: `Your ${label}. A draft plan is ready.`,
      tripId: o.draftTripId,
      planName: label,
      source: "occasion_drafts.cycle_key · the occurrence of occasions.occasion_date that fired",
      action: { label: "Open draft", href: `/plans/${o.draftTripId}` },
    });
  }

  // Window: "coming up" = from today (on the row's own calendar) to now + window. A day row is
  // kept for the whole of its day; an instant row is past the moment it passes.
  const kept = candidates.filter((c) => {
    if (c.sortMs > ceilingMs) return false;
    if (c.day !== undefined) return c.day >= calendarDayOf(now, c.tz);
    return c.sortMs >= now.getTime();
  });

  kept.sort((a, b) => a.sortMs - b.sortMs || KIND_ORDER[a.row.kind] - KIND_ORDER[b.row.kind] || a.row.planName.localeCompare(b.row.planName));
  return kept.map((c) => c.row);
}

// ── The loader: the session user's own plans and their rows ───────────────────────────────────

export interface UpcomingPayload {
  rows: UpcomingRow[];
  windowDays: number;
  /** The instant the rows were computed against — the client's "today" reference. */
  asOf: string;
}

export async function loadUpcomingForUser(
  userId: string,
  windowDays: number = UPCOMING_DEFAULT_WINDOW_DAYS,
  now: Date = new Date(),
): Promise<UpcomingPayload> {
  const [{ db }, { and, eq, inArray, isNotNull, sql, or }, schema, invitesSchema, completion, roster] = await Promise.all([
    import("../db"),
    import("drizzle-orm"),
    import("@shared/schema"),
    import("@shared/guest-invites-schema"),
    import("./booking-completion.service"),
    import("./plan-guest-roster.service"),
  ]);
  const { trips, tripFinals, serviceBookings, providerServices, userExperiences, itineraryItems, occasions, occasionDrafts } = schema;
  const { eventInvites } = invitesSchema;

  const tripRows = await db
    .select({
      id: trips.id,
      title: trips.title,
      destination: trips.destination,
      startDate: trips.startDate,
      timezone: trips.timezone,
      finalizedAt: trips.finalizedAt,
    })
    .from(trips)
    .where(eq(trips.userId, userId));
  const tripIds = tripRows.map((t) => t.id);

  const finalsByTrip = new Map<string, number>();
  if (tripIds.length > 0) {
    const finals = await db
      .select({ tripId: tripFinals.tripId, latest: sql<number>`max(${tripFinals.version})` })
      .from(tripFinals)
      .where(inArray(tripFinals.tripId, tripIds))
      .groupBy(tripFinals.tripId);
    for (const f of finals) finalsByTrip.set(f.tripId, Number(f.latest));
  }

  const bookingRows = await db
    .select({
      id: serviceBookings.id,
      tripId: serviceBookings.tripId,
      status: serviceBookings.status,
      slotId: serviceBookings.slotId,
      bookingDetails: serviceBookings.bookingDetails,
      balanceDueAt: serviceBookings.balanceDueAt,
      balancePaid: serviceBookings.balancePaid,
      balanceAmount: serviceBookings.balanceAmount,
      serviceName: providerServices.serviceName,
    })
    .from(serviceBookings)
    .leftJoin(providerServices, eq(serviceBookings.serviceId, providerServices.id))
    .where(
      and(
        eq(serviceBookings.travelerId, userId),
        or(
          inArray(serviceBookings.status, [...PROVISIONAL_BOOKING_STATUSES]),
          and(eq(serviceBookings.status, "deposit_paid"), eq(serviceBookings.balancePaid, false)),
        ),
      ),
    );
  const bookings: UpcomingBooking[] = [];
  for (const b of bookingRows) {
    let serviceDate: string | null = null;
    if (b.status && (PROVISIONAL_BOOKING_STATUSES as readonly string[]).includes(b.status)) {
      // The ONE derivation of a booking's service date (slot, then the checkout snapshot).
      const dated = await completion.resolveServiceDate({
        slotId: b.slotId ?? null,
        bookingDetails: (b.bookingDetails as Record<string, any> | null) ?? null,
      });
      serviceDate = dated?.date ?? null;
    }
    bookings.push({
      id: b.id,
      tripId: b.tripId ?? null,
      status: b.status ?? null,
      serviceName: b.serviceName ?? null,
      serviceDate,
      balanceDueAt: b.balanceDueAt ?? null,
      balancePaid: b.balancePaid ?? null,
      balanceAmount: b.balanceAmount ?? null,
    });
  }

  const events: UpcomingEvent[] = [];
  if (tripIds.length > 0) {
    const eventRows = await db
      .select({
        id: userExperiences.id,
        tripId: userExperiences.tripId,
        title: userExperiences.title,
        eventDate: userExperiences.eventDate,
        startTime: userExperiences.startTime,
        location: userExperiences.location,
      })
      .from(userExperiences)
      .where(and(inArray(userExperiences.tripId, tripIds), isNotNull(userExperiences.eventDate)));
    const eventIds = eventRows.map((e) => e.id);
    const tally = new Map<string, { invited: number; answered: number }>();
    if (eventIds.length > 0) {
      const inviteRows = await db
        .select({ experienceId: eventInvites.experienceId, rsvpStatus: eventInvites.rsvpStatus })
        .from(eventInvites)
        .where(inArray(eventInvites.experienceId, eventIds));
      for (const inv of inviteRows) {
        const t = tally.get(inv.experienceId) ?? { invited: 0, answered: 0 };
        t.invited += 1;
        if (roster.toRsvp(inv.rsvpStatus) !== "pending") t.answered += 1;
        tally.set(inv.experienceId, t);
      }
    }
    for (const e of eventRows) {
      if (!e.tripId) continue;
      const t = tally.get(e.id) ?? { invited: 0, answered: 0 };
      events.push({
        id: e.id,
        tripId: e.tripId,
        title: e.title,
        eventDate: e.eventDate,
        startTime: e.startTime,
        location: e.location,
        invited: t.invited,
        answered: t.answered,
      });
    }
  }

  const draftRows = await db
    .select({
      occasionId: occasionDrafts.occasionId,
      cycleKey: occasionDrafts.cycleKey,
      draftTripId: occasionDrafts.tripId,
      generatedAt: occasionDrafts.generatedAt,
      label: occasions.label,
      templateKey: occasions.templateKey,
    })
    .from(occasionDrafts)
    .innerJoin(occasions, eq(occasionDrafts.occasionId, occasions.id))
    .where(and(eq(occasions.userId, userId), isNotNull(occasionDrafts.generatedAt), isNotNull(occasionDrafts.tripId)));
  const occasionDraftsIn: UpcomingOccasionDraft[] = draftRows.map((d) => ({
    occasionId: d.occasionId,
    label: d.label,
    templateKey: d.templateKey,
    cycleKey: d.cycleKey,
    draftTripId: d.draftTripId ?? null,
    generatedAt: d.generatedAt ?? null,
  }));

  const itemCounts: UpcomingItemCounts[] = [];
  if (tripIds.length > 0) {
    const countRows = await db
      .select({
        tripId: itineraryItems.tripId,
        routingStatus: itineraryItems.routingStatus,
        n: sql<number>`count(*)`,
      })
      .from(itineraryItems)
      .where(inArray(itineraryItems.tripId, tripIds))
      .groupBy(itineraryItems.tripId, itineraryItems.routingStatus);
    const byTrip = new Map<string, UpcomingItemCounts>();
    for (const r of countRows) {
      const c = byTrip.get(r.tripId) ?? { tripId: r.tripId, inPlanning: 0, withExpert: 0, readyForCheckout: 0, purchased: 0 };
      const n = Number(r.n);
      switch (r.routingStatus) {
        case "in_planning": c.inPlanning += n; break;
        case "with_expert": c.withExpert += n; break;
        case "ready_for_checkout": c.readyForCheckout += n; break;
        case "purchased": c.purchased += n; break;
        default: break; // an unknown status is not counted under any label (§13)
      }
      byTrip.set(r.tripId, c);
    }
    // `Array.from` rather than a spread: this file compiles under the repo's current target,
    // where iterating a Map iterator directly needs --downlevelIteration.
    itemCounts.push(...Array.from(byTrip.values()));
  }

  const rows = buildUpcomingRows({
    now,
    windowDays,
    trips: tripRows.map((t) => ({
      id: t.id,
      title: t.title,
      destination: t.destination,
      startDate: t.startDate,
      timezone: t.timezone,
      finalizedAt: t.finalizedAt,
      finalVersion: finalsByTrip.get(t.id) ?? null,
    })),
    bookings,
    events,
    occasionDrafts: occasionDraftsIn,
    itemCounts,
  });

  return { rows, windowDays, asOf: now.toISOString() };
}
