/**
 * Arashiyama local-itinerary wanted tile (rows 250 and 299b).
 * The three strings are the cleared lines. No other traveler-facing wording on this tile.
 * Match is the neighbourhood slug and the offering key. A display label is not a match.
 */

import { WAITLIST_EXPERT_FORM_PATH } from "@shared/launch-waitlist";

export const ARASHIYAMA_ITINERARY_EXPERT_LINK =
  "Know Arashiyama well? Apply now as a local expert.";

export const ARASHIYAMA_ITINERARY_PROVIDER_LINK =
  "Run a business in Arashiyama? Sign up as a provider.";

/** Signed-in travelers. Everyone else sees the two apply lines. */
export const ARASHIYAMA_PLAN_YOUR_DAY = "Plan your day here";

/** Existing Start-a-plan door. `?city=Kyoto` pre-picks Kyoto on an exact match. */
export const ARASHIYAMA_PLAN_YOUR_DAY_HREF = "/experiences?city=Kyoto";

/** Waitlist expert application (WL-B). */
export const ARASHIYAMA_ITINERARY_EXPERT_HREF = WAITLIST_EXPERT_FORM_PATH;

/**
 * Provider sign-up, not the waitlist (#1796 follow-up, item 2). Signup reads `intent=supply` and
 * `supplyRole=provider` and keeps the person on the account form with the provider fields.
 */
export const ARASHIYAMA_ITINERARY_PROVIDER_HREF = "/signup?intent=supply&supplyRole=provider";

const TRAVELER_ROLE = "user";

/**
 * Signed-out visitors, experts, providers, and staff see the two apply lines.
 * A signed-in traveler (stored role `user`, or a session with no role) does not.
 */
export function arashiyamaShowsApplyLinks(
  signedIn: boolean,
  role: string | null | undefined,
): boolean {
  if (!signedIn) return true;
  return (role ?? TRAVELER_ROLE) !== TRAVELER_ROLE;
}

export function isArashiyamaItineraryWanted(slot: {
  offeringKey?: string | null;
  neighborhoodSlug?: string | null;
}): boolean {
  const slug = (slot.neighborhoodSlug ?? "").trim().toLowerCase();
  const key = (slot.offeringKey ?? "").trim().toLowerCase();
  return slug === "arashiyama" && key === "local_city_itinerary";
}
