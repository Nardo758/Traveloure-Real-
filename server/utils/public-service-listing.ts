/**
 * public-service-listing.ts — what a PUBLIC service LIST row may carry (ledger
 * `2026-10-07-public-service-ids`; CLAUDE.md Locked Decision 40).
 *
 * `GET /api/services` served `storage.getAllActiveServices` rows as read, so every row carried the
 * owner's `users.id` in `userId`. An earner's public identity is their HANDLE; the listing is
 * addressed by its own id (detail, contact `{ serviceId }`, the service-addressed verification
 * badge). No consumer of this list reads the owner id, so it is removed here and nothing replaces it.
 *
 * `scripts/check-public-user-id.cjs` predicate (3) requires the route to call this projector, because
 * a payload built by passing raw rows through is invisible to its object-literal scan.
 */
export function toPublicServiceListing<T extends { userId?: unknown }>(row: T): Omit<T, "userId"> {
  const { userId: _owner, ...rest } = row;
  return rest;
}
