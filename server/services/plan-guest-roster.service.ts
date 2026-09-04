/**
 * PLAN GUEST ROSTER — the plan's guest list is DERIVED from the events' invites.
 * Ledger `2026-09-04-guests-per-event`; CLAUDE.md Locked Decision 37.
 *
 * THE RULING THIS IMPLEMENTS. An invite already belongs to ONE event
 * (`event_invites.experience_id` → a `user_experiences` row, Locked Decision 29), and a plan holds
 * MANY events (`user_experiences.trip_id` carries no uniqueness). So "the plan's guest list" is not
 * a stored list at all — it is one row per PERSON across every event of the plan, with one COLUMN
 * per event carrying that event's own RSVP for that person. Nothing new is stored: this module
 * reads the two lists that already exist and joins them. NO SCHEMA CHANGE.
 *
 * WHAT IT IS NOT. `trip_participants` — the TRAVELLING PARTY (amount owed, arrival/departure,
 * mobility, emergency contacts) — is a different population under a different predicate and is
 * deliberately NOT read here (ledger `2026-09-04-guest-list-reconciliation`: "an invitee who
 * declines and a planner who travels but was never invited are both ordinary"). The unratified
 * `trip_participants.event_invite_id` proposal is NOT built and this module does not need it.
 *
 * IDENTITY IS THE EMAIL, AND NOTHING ELSE (§13). Two invites are the same person only when their
 * normalised email (lowercased, trimmed) is equal. There is NO name matching and no fuzzy match of
 * any kind — the same ledger row refuses it outright ("a similarity score rendered as an identity
 * is the fabricated-authority failure §13 forbids"). An invite with no email is therefore its OWN
 * row, never merged into anyone else's, because nothing in the data says it is the same person.
 *
 * OMITTED, NOT ZERO-FILLED (§13):
 *   • `from` is absent when the invite carries no origin — never "Unknown".
 *   • `dietary` is `[]` when nothing was stated, which the reader must render as nothing at all —
 *     never "no restrictions", a claim only the guest can make.
 *   • `totals.countries` is ABSENT (not 0) when no guest has an origin COUNTRY: zero countries
 *     would read as a fact about the guests rather than about the data.
 *   • The events' `startTime` the artboard hints at is NOT in the contract: `user_experiences` has
 *     `event_date` (a DATE) and no time-of-day column at all, so there is nothing true to put in
 *     it. A time here would be invented.
 *
 * A COLUMN FOR AN EVENT WITH ZERO INVITES STILL RENDERS. The event exists; every cell in it is
 * `not_invited`, which is the honest answer and is deliberately distinct from `pending` ("invited,
 * no reply"). Collapsing those two is the distinction this whole surface exists to show.
 *
 * ORDER IS THE SERVER'S, RESOLVED ONCE. The builder PRESERVES the order of the `events` it is
 * given and never re-sorts them: the canonical order (`event_date ASC NULLS LAST, created_at ASC`)
 * is `storage.getUserExperiencesByTrip`'s, ratified by ledger `2026-09-04-event-order`. Re-stating
 * it here would be a second ordering authority — the derivation-drift class §18 rule 1 names.
 */

/** The RSVP a person has for ONE event. `not_invited` and `pending` are deliberately distinct. */
export type PlanGuestRsvp = "attending" | "declined" | "pending" | "not_invited";

/** One event column. Shape mirrors the plancard `events` array's first three fields. */
export interface PlanGuestRosterEvent {
  id: string;
  title: string | null;
  eventDate: string | null;
}

export interface PlanGuestRosterGuest {
  /** Stable dedupe key: `email:<normalised>` or, for an invite with no email, `invite:<id>`. */
  key: string;
  name: string;
  email?: string;
  from?: string;
  /** Union across the person's invites. Empty ⇒ nothing was stated; render nothing (§13). */
  dietary: string[];
  /** One entry per event id in `events`, always fully populated. */
  rsvp: Record<string, PlanGuestRsvp>;
}

export interface PlanGuestRosterTotals {
  /** People on the list (deduplicated). NOT a headcount — see the `numberOfGuests` note below. */
  invited: number;
  /** People attending at least one event. */
  attending: number;
  /** Distinct origin COUNTRIES. ABSENT when no guest states one (§13). */
  countries?: number;
  perEvent: Record<string, { invited: number; attending: number }>;
}

export interface PlanGuestRoster {
  events: PlanGuestRosterEvent[];
  guests: PlanGuestRosterGuest[];
  totals: PlanGuestRosterTotals;
}

// ── Inputs ────────────────────────────────────────────────────────────────────────────────────
// Structural, not the Drizzle row types, so the builder is pure and testable with no DB import.
// Every field the builder reads is optional except the two ids, because a caller must be able to
// hand it a real row without the row having answered every question.

export interface PlanGuestRosterEventInput {
  id: string;
  title?: string | null;
  eventDate?: string | Date | null;
}

export interface PlanGuestRosterInviteInput {
  id: string;
  experienceId: string;
  guestEmail?: string | null;
  guestName?: string | null;
  rsvpStatus?: string | null;
  dietaryRestrictions?: unknown;
  originCity?: string | null;
  originState?: string | null;
  originCountry?: string | null;
  createdAt?: string | Date | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────────────────────

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * The ONE identity rule. Lowercase + trim, and nothing else — no plus-address stripping, no dot
 * folding: `a.b@gmail.com` and `ab@gmail.com` are the same mailbox at ONE provider and different
 * addresses everywhere else, so folding them would be a provider-specific guess presented as an
 * identity (§13).
 */
function normaliseEmail(raw: unknown): string {
  return clean(raw).toLowerCase();
}

/**
 * `event_invites.rsvp_status` → the four values a column can show.
 *
 * `maybe` maps to `pending` and is NOT counted as attending. The contract has four values and none
 * of them is "maybe"; of the two available readings, "not yet a yes" is the conservative one —
 * counting a maybe as attending would inflate a number a host caters against. A `maybe` guest is
 * therefore visible in the roster as awaiting a reply, never as a confirmed head.
 */
function toRsvp(status: unknown): Exclude<PlanGuestRsvp, "not_invited"> {
  switch (clean(status).toLowerCase()) {
    case "accepted":
      return "attending";
    case "declined":
      return "declined";
    default:
      // pending, no_response, maybe, "" and any value the column has never carried.
      return "pending";
  }
}

/** "City, State, Country" from whichever parts exist. Absent ⇒ the guest stated no origin. */
function originLabel(invite: PlanGuestRosterInviteInput): string {
  return [clean(invite.originCity), clean(invite.originState), clean(invite.originCountry)]
    .filter(Boolean)
    .join(", ");
}

/** `dietary_restrictions` is jsonb: normally string[], but the column has no CHECK. */
function dietaryOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(clean).filter(Boolean);
}

function isoDate(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const s = clean(v);
  return s === "" ? null : s;
}

function sortKey(v: string | Date | null | undefined): number {
  if (v == null) return 0;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// ── The builder ───────────────────────────────────────────────────────────────────────────────

/**
 * PURE. Given a plan's events (in the server's canonical order) and every invite across them,
 * produce the one-row-per-person, one-column-per-event roster.
 *
 * DELIBERATELY TWO INPUTS, NOT THREE. An earlier sketch of this signature took `guestTravelPlans`
 * as a third input for the "From" column. It does not belong: `guest_travel_plans` carries the
 * guest's chosen flight/hotel/transport and their arrival/departure dates — it has NO origin
 * column at all. The origin lives on `event_invites` (`origin_city/state/country`), which is what
 * this reads. Loading a table nothing here reads would be the collected-and-never-read class.
 */
export function buildPlanGuestRoster(
  events: PlanGuestRosterEventInput[],
  invites: PlanGuestRosterInviteInput[],
): PlanGuestRoster {
  const eventIds = events.map((e) => e.id);
  const eventIdSet = new Set(eventIds);

  const columns: PlanGuestRosterEvent[] = events.map((e) => ({
    id: e.id,
    title: clean(e.title) === "" ? null : clean(e.title),
    eventDate: isoDate(e.eventDate),
  }));

  // Invites grouped by event, each group in a deterministic order: created_at ASC then id. The
  // loader's own read order is `created_at DESC`, and "first non-empty wins" below must not depend
  // on which reader happened to hand us the rows.
  const byEvent = new Map<string, PlanGuestRosterInviteInput[]>();
  for (const invite of invites) {
    if (!eventIdSet.has(invite.experienceId)) continue; // not an event of this plan
    const bucket = byEvent.get(invite.experienceId);
    if (bucket) bucket.push(invite);
    else byEvent.set(invite.experienceId, [invite]);
  }
  byEvent.forEach((bucket) => {
    bucket.sort(
      (a: PlanGuestRosterInviteInput, b: PlanGuestRosterInviteInput) =>
        sortKey(a.createdAt) - sortKey(b.createdAt) || a.id.localeCompare(b.id),
    );
  });

  interface Accumulator {
    key: string;
    names: string[];
    email: string;
    origins: string[];
    dietary: string[];
    dietarySeen: Set<string>;
    rsvp: Map<string, Exclude<PlanGuestRsvp, "not_invited">>;
  }

  const guests = new Map<string, Accumulator>();
  const perEvent: Record<string, { invited: number; attending: number }> = {};

  // A stated answer is never overwritten by silence: if the same person somehow holds two invites
  // to ONE event, attending beats declined and both beat pending.
  const rank = { attending: 3, declined: 2, pending: 1 } as const;

  for (const eventId of eventIds) {
    perEvent[eventId] = { invited: 0, attending: 0 };
    for (const invite of byEvent.get(eventId) ?? []) {
      const email = normaliseEmail(invite.guestEmail);
      // NO EMAIL ⇒ ITS OWN ROW. Merging it into anyone would be an identity claim the data does
      // not make; the invite id is the only thing that distinguishes this person from another.
      const key = email === "" ? `invite:${invite.id}` : `email:${email}`;

      let guest = guests.get(key);
      if (!guest) {
        guest = {
          key,
          names: [],
          email,
          origins: [],
          dietary: [],
          dietarySeen: new Set<string>(),
          rsvp: new Map(),
        };
        guests.set(key, guest);
      }

      const name = clean(invite.guestName);
      if (name !== "") guest.names.push(name);

      const origin = originLabel(invite);
      if (origin !== "" && !guest.origins.includes(origin)) guest.origins.push(origin);

      // UNION, never a silent pick: two invites can carry two different sets of restrictions and
      // dropping either is exactly the thing a caterer must not do.
      for (const note of dietaryOf(invite.dietaryRestrictions)) {
        const seen = note.toLowerCase();
        if (guest.dietarySeen.has(seen)) continue;
        guest.dietarySeen.add(seen);
        guest.dietary.push(note);
      }

      const rsvp = toRsvp(invite.rsvpStatus);
      const prior = guest.rsvp.get(eventId);
      if (!prior || rank[rsvp] > rank[prior]) guest.rsvp.set(eventId, rsvp);
    }
  }

  // Per-event counts are over PEOPLE (deduplicated), so a person invited twice to one event is one
  // invited head, matching what the column renders.
  guests.forEach((guest) => {
    guest.rsvp.forEach((rsvp, eventId) => {
      perEvent[eventId].invited += 1;
      if (rsvp === "attending") perEvent[eventId].attending += 1;
    });
  });

  const rows: PlanGuestRosterGuest[] = Array.from(guests.values()).map((guest) => {
    const rsvp: Record<string, PlanGuestRsvp> = {};
    for (const eventId of eventIds) rsvp[eventId] = guest.rsvp.get(eventId) ?? "not_invited";

    const row: PlanGuestRosterGuest = {
      key: guest.key,
      // First stated name wins; the email is the fallback label, never a fabricated placeholder.
      name: guest.names[0] ?? guest.email,
      dietary: guest.dietary,
      rsvp,
    };
    if (guest.email !== "") row.email = guest.email;
    // Two different stated origins are BOTH shown rather than one being picked silently.
    if (guest.origins.length > 0) row.from = guest.origins.join(" · ");
    return row;
  });

  rows.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));

  // A country is counted only from `origin_country`. Absent for every guest ⇒ the tile is OMITTED
  // rather than shown as 0 (§13) — the reader must not present "no data" as "no countries".
  const countries = new Set<string>();
  for (const invite of invites) {
    if (!eventIdSet.has(invite.experienceId)) continue;
    const country = clean(invite.originCountry).toLowerCase();
    if (country !== "") countries.add(country);
  }

  const totals: PlanGuestRosterTotals = {
    // PEOPLE, NOT HEADS. `event_invites.number_of_guests` counts unnamed +1s; adding it here would
    // produce a total the table below cannot show a row for (§13). Plus-ones are a separate,
    // un-asked question.
    invited: rows.length,
    attending: rows.filter((g) => Object.values(g.rsvp).some((r) => r === "attending")).length,
    perEvent,
  };
  if (countries.size > 0) totals.countries = countries.size;

  return { events: columns, guests: rows, totals };
}

/**
 * The thin loader. Reads the plan's events through the ONE canonical reader
 * (`getUserExperiencesByTrip` — ledger `2026-09-04-event-order`) and each event's invites through
 * the ONE existing invite reader `GET /api/events/:experienceId/invites` already uses. No new
 * storage method and no new query shape.
 *
 * AUTHORIZATION IS THE CALLER'S, exactly like `getUserExperiencesByTrip` itself: this reads by
 * trip alone and the route gates the trip first.
 *
 * `storage` is imported LAZILY on purpose: it transitively imports `server/db`, which throws
 * without `DATABASE_URL`, and the builder above must stay importable in plain CI so its proofs can
 * run with no database (the `participant-write-rail.test.ts` precedent).
 */
export async function loadPlanGuestRoster(tripId: string): Promise<PlanGuestRoster> {
  const { storage } = await import("../storage");
  const events = await storage.getUserExperiencesByTrip(tripId);
  const invites = (
    await Promise.all(events.map((event) => storage.getInvitesByExperience(event.id)))
  ).flat();
  return buildPlanGuestRoster(events, invites as PlanGuestRosterInviteInput[]);
}
