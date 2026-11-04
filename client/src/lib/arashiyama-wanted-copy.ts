/**
 * Arashiyama local-itinerary wanted tile (rows 250 and 299b).
 * The three strings are the cleared lines. No other traveler-facing wording on this tile.
 * Match is the neighbourhood slug and the offering key. A display label is not a match.
 */

import { WAITLIST_EXPERT_FORM_PATH } from "@shared/launch-waitlist";

/**
 * ENTRY-1: the same two cleared sentences, templated on the slot's own neighbourhood name, so the tile
 * names the place it sits in. An empty name falls back to "Arashiyama", the only match today.
 */
export function itineraryExpertLink(neighborhood: string | null | undefined): string {
  return `Know ${neighborhood?.trim() || "Arashiyama"} well? Apply now as a local expert.`;
}

export function itineraryProviderLink(neighborhood: string | null | undefined): string {
  return `Run a business in ${neighborhood?.trim() || "Arashiyama"}? Sign up as a provider.`;
}

export const ARASHIYAMA_ITINERARY_EXPERT_LINK = itineraryExpertLink("Arashiyama");

export const ARASHIYAMA_ITINERARY_PROVIDER_LINK = itineraryProviderLink("Arashiyama");

/** Signed-in travelers. Everyone else sees the two apply lines. */
export const ARASHIYAMA_PLAN_YOUR_DAY = "Plan your day here";

/**
 * PS-4 (f), ledger `2026-11-02-ps4-entry-carry-forward`: "Plan your day here" opens the one planner (the billboard
 * door pattern) with Kyoto chosen and a new plan — no bare link. `local_city_itinerary` is an EXPERT offering key,
 * not an `experience_types` slug, so the occasion is carried as the group a city day belongs to (`trips`), never as
 * a slug the catalog does not carry. The card holds no saved place for the neighbourhood, so no pending item rides.
 */
export function arashiyamaPlanDaySource(): { door: "billboard"; city: string; country: string; destination: string; group: "trips"; newPlan: true } {
  return { door: "billboard", city: "Kyoto", country: "Japan", destination: "Kyoto", group: "trips", newPlan: true };
}

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
