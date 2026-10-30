/**
 * Row 278 (ledger `2026-10-28-guest-landing-render`): what the guest invite landing shows, decided
 * from the server's `landing` key ONLY (row 277, `shared/guest-invite-landing.ts`). The server
 * decides what is released; this file never reads the invite's other fields, the free-text
 * destination, or anything else. An absent key shows nothing: no placeholder, no "Your host".
 *
 * The "address is shared after you RSVP" line shows only when `landing.hasVenueAddress` is true
 * and the guest has not accepted (Architect, Oct 28, 2026, 20:50 ET). The server does not send
 * `hasVenueAddress` yet (that lands with 3B), so today the key is absent and the line never shows.
 */
import type { GuestLanding } from "@shared/guest-invite-landing";
import { parseTripDate } from "./calendar-date";
import { GUEST_LANDING_COPY } from "./guest-landing-copy";

/** `hasVenueAddress` is not on the server contract yet (3B); read only if it ever arrives. */
export type GuestLandingPayload = GuestLanding & { hasVenueAddress?: boolean };

export interface GuestLandingRow {
  key: "host" | "date" | "time" | "venue" | "city" | "note" | "rsvpBy" | "address" | "addressAfterRsvp";
  /** The label, from GUEST_LANDING_COPY; absent for a row that is its own sentence. */
  label?: string;
  value?: string;
}

function present(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** A stored "YYYY-MM-DD" as the guest's own locale reads a calendar day (never shifted by UTC). */
export function landingDay(value: string | undefined): string | undefined {
  if (!present(value)) return undefined;
  const day = parseTripDate(value);
  return day ? day.toLocaleDateString() : undefined;
}

/** Row 280c: the slip anchor item's "RSVP by {date}" line, the same approved guest copy and day reading. */
export function slipRsvpByLine(rsvpBy: string | undefined): string | undefined {
  const day = landingDay(rsvpBy);
  return day ? GUEST_LANDING_COPY.rsvpBy(day) : undefined;
}

export function guestLandingRows(
  landing: GuestLandingPayload | null | undefined,
  rsvpStatus: string | null | undefined,
): GuestLandingRow[] {
  if (!landing) return [];
  const rows: GuestLandingRow[] = [];
  const host = present(landing.hostFirstName) ? landing.hostFirstName.trim() : undefined;
  if (host) rows.push({ key: "host", value: GUEST_LANDING_COPY.hostedBy(host) });
  const day = landingDay(landing.eventDate);
  if (day) rows.push({ key: "date", label: GUEST_LANDING_COPY.date, value: day });
  if (present(landing.startTime)) {
    const zone = present(landing.timezone) ? ` (${landing.timezone})` : "";
    rows.push({ key: "time", label: GUEST_LANDING_COPY.time, value: `${landing.startTime}${zone}` });
  }
  if (present(landing.venue)) rows.push({ key: "venue", label: GUEST_LANDING_COPY.venue, value: landing.venue });
  if (present(landing.area)) rows.push({ key: "city", label: GUEST_LANDING_COPY.city, value: landing.area });
  if (present(landing.hostNote)) {
    rows.push({ key: "note", label: host ? GUEST_LANDING_COPY.noteFrom(host) : undefined, value: landing.hostNote });
  }
  const rsvpBy = landingDay(landing.rsvpBy);
  if (rsvpBy) rows.push({ key: "rsvpBy", value: GUEST_LANDING_COPY.rsvpBy(rsvpBy) });
  if (present(landing.venueAddress)) {
    rows.push({ key: "address", value: landing.venueAddress });
  } else if (landing.hasVenueAddress === true && rsvpStatus !== "accepted") {
    rows.push({ key: "addressAfterRsvp", value: GUEST_LANDING_COPY.addressAfterRsvp });
  }
  return rows;
}
