/**
 * Method-aware service fundamentals (decision-maker ratified Aug 10, 2026 — D2 of the
 * service-fundamentals brief). ONE definition of which fundamentals apply to which service
 * shape, shared by the server scorers (provider-listing-health.routes.ts, demand.routes.ts)
 * and the client chips (provider/services.tsx, storefront.tsx) — so "place-anchored" means
 * the same thing everywhere, the advisor-fundamentals `parseCoord`/`isLodgingShaped`
 * extraction precedent applied one lane over.
 *
 * Grounding in the canonical vocabulary (CLAUDE.md §3, deliveryMethodEnum):
 *  - `in_person` / `hybrid` happen at a real-world place → the exact-pin fundamentals apply.
 *  - `call` / `video` are LIVE sessions (the storefront's own labels: "Phone call" /
 *    "Video call") → they need bookable calendar slots but no place.
 *  - `pdf` / `voice_notes` / `async_messaging` are artifact/async delivery → neither a place
 *    nor a calendar is fundamental to them.
 *  - `productShape = 'property'` (migration 153) is place-anchored and scheduled regardless
 *    of its deliveryMethod, which is meaningless for an accommodation listing.
 *  - `productShape = 'bundle'` is classified by the bundle row's OWN deliveryMethod — its
 *    components each carry their own fundamentals on their own rows.
 *
 * A row with no deliveryMethod and no property shape cannot be classified honestly; callers
 * keep the historical all-checks behavior for it rather than guessing an omission (§13).
 */

export const PLACE_ANCHORED_METHODS: ReadonlySet<string> = new Set(["in_person", "hybrid"]);
export const SCHEDULED_METHODS: ReadonlySet<string> = new Set(["in_person", "hybrid", "call", "video"]);

export interface FundamentalsShape {
  deliveryMethod: string | null | undefined;
  productShape: string | null | undefined;
}

/** True when the row carries enough signal to classify at all. */
export function isClassifiable(s: FundamentalsShape): boolean {
  return s.productShape === "property" || !!s.deliveryMethod;
}

/** Happens at a real-world place — the exact-pin / meeting-point fundamentals apply. */
export function isPlaceAnchored(s: FundamentalsShape): boolean {
  if (s.productShape === "property") return true;
  return !!s.deliveryMethod && PLACE_ANCHORED_METHODS.has(s.deliveryMethod);
}

/** Needs bookable calendar slots — the availability fundamental applies. */
export function needsScheduling(s: FundamentalsShape): boolean {
  if (s.productShape === "property") return true;
  return !!s.deliveryMethod && SCHEDULED_METHODS.has(s.deliveryMethod);
}
