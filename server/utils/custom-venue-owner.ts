/**
 * The ONE ownership predicate for a `custom_venues` row.
 *
 * Ledger `2026-09-05-custom-venues-owner-scope`; CLAUDE.md §14 (the acting user comes from the
 * SESSION, never from the request) applied to READS.
 *
 * WHY THIS IS A MODULE AND NOT AN INLINE COMPARISON
 * ─────────────────────────────────────────────────
 * `venue.userId !== userId` was written out by hand at four sites (the PATCH and DELETE custom-venue
 * routes and the two cart-add paths) while the two GET routes had no check at all — which is exactly
 * how the list route came to serve every row on the table to an unauthenticated caller. One
 * implementation, N callers (§18 rule 1): a second copy of this decision is how the next surface
 * ships without one.
 *
 * FAIL-CLOSED: a missing venue, a venue with no owner column, or an absent session user is NOT an
 * owner. Nothing here reads the request — the caller resolves the session user with
 * `getUserId(req)` and passes it in, so this predicate cannot be handed a client-chosen identity.
 */

/** The only shape this predicate needs — a row (or row-like) carrying an owner id. */
export interface CustomVenueOwnerRow {
  userId?: string | null;
}

/**
 * True when `userId` is the owner of `venue`.
 *
 * Both arguments are checked for absence explicitly rather than compared loosely: `undefined ===
 * undefined` is the shape that turns "no session" plus "no owner column" into "access granted".
 */
export function isCustomVenueOwner(
  venue: CustomVenueOwnerRow | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!venue) return false;
  if (!userId) return false;
  const owner = venue.userId;
  if (!owner) return false;
  return owner === userId;
}

/**
 * Resolves an optional `tripId` filter that arrived on the query string into one the caller is
 * allowed to filter by.
 *
 * A tripId only NARROWS an already owner-scoped list, so a foreign one matches nothing anyway —
 * but a route should not run a query keyed on a trip its caller does not own, and "you may not
 * filter by that" is not an error worth failing a page load over. So an absent, malformed, or
 * unowned trip id all resolve to `undefined`: the caller's own unfiltered list, which is a true
 * answer to a request that named no trip the caller has.
 *
 * `verify` is injected (it is `verifyTripOwnership` in production) so this rule is unit-testable
 * without a database, and so this module stays free of storage imports.
 */
export async function scopeTripFilter(
  rawTripId: unknown,
  userId: string,
  verify: (tripId: string, userId: string) => Promise<boolean>,
): Promise<string | undefined> {
  if (typeof rawTripId !== "string" || !rawTripId) return undefined;
  if (!userId) return undefined;
  return (await verify(rawTripId, userId)) ? rawTripId : undefined;
}
