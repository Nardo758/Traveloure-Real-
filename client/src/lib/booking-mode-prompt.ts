/**
 * booking-mode-prompt — the ONE predicate and the ONE copy for the seller booking-mode banner.
 *
 * Ledger `2026-09-25-seller-booking-mode-prompt`. The decision-maker (Sep 25, 2026, "option 3")
 * holds PR #1101 — checkout refusing request-mode lines — until enough listings are instant, and
 * FIRST asks sellers to choose. The server decides which listings are undecided
 * (`GET /api/me/listings/booking-mode-status`, over `isBookingModeChosen`); this module only decides
 * whether the console asks, and says it. It restates no mode rule of its own (§18 rule 1).
 */
import { isEarnerRole, isExpertRole } from "@shared/roles";

export type BookingModeChoiceState = "chosen" | "undecided" | "quote";

export interface BookingModeStatusListing {
  id: string;
  name: string;
  mode: "instant" | "request" | "hidden";
  state: BookingModeChoiceState;
}

export interface BookingModeStatus {
  listings: BookingModeStatusListing[];
  undecidedCount: number;
}

/**
 * True iff the console should ask. Every clause is load-bearing:
 *   • an EARNER only — nobody else owns listings;
 *   • an ANSWERED status read — a loading or failed read is NOT "no undecided listings", and it is
 *     not "some" either; it asks nobody (§13, the `shouldPromptHandleClaim` posture);
 *   • at least one UNDECIDED listing — quote listings never count (they are request by construction);
 *   • not dismissed THIS SESSION — dismissal is per session so the ask returns until they choose.
 */
export function shouldShowBookingModeBanner(
  viewer: { role?: string | null } | null | undefined,
  status: BookingModeStatus | null | undefined,
  dismissedThisSession: boolean,
): boolean {
  if (!viewer || !isEarnerRole(viewer.role)) return false;
  if (!status || !Array.isArray(status.listings)) return false;
  if (dismissedThisSession) return false;
  return undecidedListings(status).length > 0;
}

/** The listings the banner is about — the server's own classification, never re-derived. */
export function undecidedListings(status: BookingModeStatus): BookingModeStatusListing[] {
  return status.listings.filter((l) => l.state === "undecided");
}

export function bookingModeBannerCopy(undecided: BookingModeStatusListing[]): {
  headline: string;
  detail: string;
  instant: string;
  request: string;
} {
  const n = undecided.length;
  const noun = n === 1 ? "listing is" : "listings are";
  // Name the mode the platform actually resolved (normally "Request to book"); if every undecided
  // listing resolved to instant, say that instead — never claim a default the rows do not carry.
  const allInstant = n > 0 && undecided.every((l) => l.mode === "instant");
  const current = allInstant ? "Instant booking" : "Request to book";
  return {
    headline: "Choose how travelers book your listings.",
    detail: `${n} ${noun} set to '${current}' because you haven't chosen.`,
    instant: "Instant: travelers pay at checkout and you're booked.",
    request: "Request: you approve each booking first.",
  };
}

export const BOOKING_MODE_QUOTE_NOTE =
  "Custom-quote listings are always 'Request to book' — the traveler gets your quote before anything is booked.";

/** Where "Choose per listing" goes — each console's own Catalog. */
export function catalogHrefForRole(role: string | null | undefined): string {
  return isExpertRole(role) ? "/expert/catalog" : "/provider/services";
}

export const BOOKING_MODE_BANNER_DISMISS_KEY = "traveloure_booking_mode_banner_dismissed";
