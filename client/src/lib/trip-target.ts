/**
 * TRIP TARGET — the ONE resolver for "which trip is this marketplace action for?".
 *
 * The slip's row-12 CTA ("Browse services for this trip",
 * client/src/components/plancard/SlipView.tsx) hands the marketplace a trip by URL:
 * `/services?tripId=<id>`. The /services grid already honoured that handoff
 * (cart-is-slip, ledger 2026-08-31-manifest-is-the-boundary): its Add resolves the
 * `?tripId=` handoff first, then the active TripContext, and only a genuinely
 * trip-less click falls through to the generic cart.
 *
 * The leak this module closes: the grid's own links into the SERVICE DETAIL page
 * (`/services/:id`) dropped the query string, and service-detail never read a
 * `tripId` at all — so a traveler who arrived from the slip, opened a listing and
 * booked it landed in a trip-less cart, with the slip's CTA promise silently broken.
 *
 * §18 rule 1 (derivation-drift): the resolution order is written ONCE, here, and
 * BOTH `client/src/pages/discover.tsx` (the grid) and
 * `client/src/pages/service-detail.tsx` (the listing) call it. A second copy of
 * "URL first, then context" is exactly how the two surfaces drift apart again.
 *
 * Nothing in this module touches money: the resolved id is a TRIP SCOPE for a cart
 * row / plan item, never an amount, a rate or a payer identity (§14/§18/§19). The
 * server still owns every ownership check on the trip it names.
 */

/** The trip-identity slice of TripContext this resolver needs (see client/src/lib/trip-context.ts). */
export interface TripTargetContext {
  tripId?: string;
}

/**
 * Resolve the trip a marketplace add should land on.
 *
 * Order, matching the grid's ratified behaviour exactly:
 *   1. the `?tripId=` handoff on the current URL (an explicit "this trip" from the slip);
 *   2. the active TripContext's `tripId` (the trip the traveler is already planning);
 *   3. none — the caller falls through to its trip-less path.
 *
 * @param search the location search string (with or without a leading "?"), e.g. from wouter's `useSearch()`
 * @returns the resolved trip id, or "" when there is no target (never a guessed id — §13)
 */
export function resolveTargetTripId(search: string | null | undefined, context?: TripTargetContext | null): string {
  const fromUrl = readTripIdParam(search);
  if (fromUrl) return fromUrl;
  const fromContext = typeof context?.tripId === "string" ? context.tripId.trim() : "";
  return fromContext;
}

/** Read a `tripId` query parameter out of a search string. Empty/whitespace-only reads as absent. */
export function readTripIdParam(search: string | null | undefined): string {
  if (!search) return "";
  try {
    const raw = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("tripId");
    return typeof raw === "string" ? raw.trim() : "";
  } catch {
    return "";
  }
}

/**
 * The service-detail href a marketplace card links to, carrying the trip handoff forward
 * so the listing page can resolve the same target the grid did. With no target trip the
 * href is byte-identical to the pre-existing `/services/:id` link.
 */
export function serviceDetailHref(serviceId: string, tripId?: string | null): string {
  const base = `/services/${encodeURIComponent(serviceId)}`;
  const trimmed = typeof tripId === "string" ? tripId.trim() : "";
  return trimmed ? `${base}?tripId=${encodeURIComponent(trimmed)}` : base;
}
