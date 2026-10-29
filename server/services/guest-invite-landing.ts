/**
 * Row 277 (Architect, 2026-10-28 01:45 ET, pt847u, and 08:55 ET, pt849u; ledger
 * `2026-10-28-guest-landing-fields`): what a guest holding an invite token may read.
 *
 * PURE: no db, no storage, no express. Both functions build their output by NAMING each allowed
 * key, never by spreading the input, so a column added tomorrow cannot reach a guest.
 */
import type { GuestLanding } from "@shared/guest-invite-landing";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { isUsableTimeZone } from "@shared/plan-timing";
import { userExperienceStartTimeSchema } from "@shared/schema";

/**
 * The rsvpStatus values that release the street address. "Attending" in the ruling is read as
 * `accepted`, the only accepting status rsvpSchema admits. Exact match: anything else, including
 * `maybe`, a padded or differently cased value, or no status, releases nothing (fail closed).
 */
export const ADDRESS_RELEASING_STATUSES: ReadonlySet<string> = new Set(["accepted"]);

export interface GuestLandingInput {
  title?: string | null;
  eventDate?: string | null;
  startTime?: string | null;
  location?: string | null;
  hostNote?: string | null;
  rsvpBy?: string | null;
  venueAddress?: string | null;
  hostFirstName?: string | null;
  marketSlug?: string | null;
  tripTimezone?: string | null;
  rsvpStatus?: string | null;
}

/** A trimmed non-empty string, or undefined (the key is then omitted). */
function present(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** A stored string as is (no trim), or undefined when absent or blank. */
function asStored(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function buildGuestLanding(input: GuestLandingInput): GuestLanding {
  const out: GuestLanding = {};

  const hostFirstName = present(input.hostFirstName);
  if (hostFirstName) out.hostFirstName = hostFirstName;

  const title = present(input.title);
  if (title) out.title = title;

  const eventDate = asStored(input.eventDate);
  if (eventDate) out.eventDate = eventDate;

  // The time ships as the bare stored "HH:MM", accepted only if it passes the shared format
  // authority. The zone rides with it only when the trip's zone is usable; otherwise the time is
  // honestly zone-less (§13). Never converted, never UTC, never a fallback zone.
  const startTime = asStored(input.startTime);
  if (startTime && userExperienceStartTimeSchema.safeParse(startTime).success) {
    out.startTime = startTime;
    if (isUsableTimeZone(input.tripTimezone)) out.timezone = input.tripTimezone;
  }

  const venue = present(input.location);
  if (venue) out.venue = venue;

  // The area is the operating market's city for the trip's STORED market key, exact match only.
  // Never derived from the free text of the venue or the destination.
  if (typeof input.marketSlug === "string" && input.marketSlug.length > 0) {
    const market = OPERATING_MARKETS.find((m) => m.marketKey === input.marketSlug);
    if (market) out.area = market.cityName;
  }

  const hostNote = present(input.hostNote);
  if (hostNote) out.hostNote = hostNote;

  const rsvpBy = asStored(input.rsvpBy);
  if (rsvpBy) out.rsvpBy = rsvpBy;

  // Row 207: the guest can be told an address exists before it is released.
  // The key is present only when true. The street itself stays behind the RSVP gate.
  const venueAddress = present(input.venueAddress);
  if (venueAddress) out.hasVenueAddress = true;

  if (typeof input.rsvpStatus === "string" && ADDRESS_RELEASING_STATUSES.has(input.rsvpStatus)) {
    if (venueAddress) out.venueAddress = venueAddress;
  }

  return out;
}

/** The only invite keys a guest-facing response returns (the keys the guest page reads). */
export interface GuestInviteView {
  id?: unknown;
  guestName?: unknown;
  originCity?: unknown;
  originState?: unknown;
  originCountry?: unknown;
  rsvpStatus?: unknown;
  numberOfGuests?: unknown;
}

/**
 * The guest-safe invite, used by GET /api/invites/:token, POST …/origin and POST …/rsvp. No guest
 * email or phone, no organizer id, no token, no message or other column.
 */
export function projectInviteForGuest(invite: Record<string, unknown>): GuestInviteView {
  return {
    id: invite.id,
    guestName: invite.guestName,
    originCity: invite.originCity,
    originState: invite.originState,
    originCountry: invite.originCountry,
    rsvpStatus: invite.rsvpStatus,
    numberOfGuests: invite.numberOfGuests,
  };
}
