/**
 * The plancard's coordinate backfill — the PURE half (smoke 5 item 5, ledger
 * `2026-10-03-smoke5-fixes`). The writer is `resolveMissingItemCoordinates` in trip-plan.service.ts.
 */

/** An item names a place of its own (§13: the plan's city alone is never geocoded as an item). */
export function hasItemLocation(item: { locationName: any; locationAddress: any }): boolean {
  return (
    (item.locationName && String(item.locationName).trim().length > 0) ||
    (item.locationAddress && String(item.locationAddress).trim().length > 0)
  );
}

/**
 * Pure (smoke 5 item 5, ledger `2026-10-03-smoke5-fixes`). TRUE when the per-request cap stopped
 * the backfill with an unpinned, locatable item it never tried — a later read will pin it. An item
 * that was tried and could not be geocoded is NOT pending (it stays un-pinned honestly, §13), so a
 * client that re-reads while this is true always stops.
 *
 * THE RACE IT CLOSES: a fresh draft of 24 stops was pinned 12 per read, so the slip's first render
 * drew "Build my days around this" (which needs a located, dated item) on only half the items, and
 * the other half waited for an unrelated refetch.
 */
export function coordinatesStillPending(
  items: ReadonlyArray<{ id: string; latitude: any; longitude: any; locationName: any; locationAddress: any }>,
  attempted: ReadonlySet<string>,
): boolean {
  return items.some((it) => (it.latitude == null || it.longitude == null) && hasItemLocation(it) && !attempted.has(it.id));
}

