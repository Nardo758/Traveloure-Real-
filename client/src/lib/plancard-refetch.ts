/**
 * Smoke 5 item 5 (ledger `2026-10-03-smoke5-fixes`). Pure. How soon the slip re-reads its plancard.
 *
 * The plancard read pins missing item coordinates at most twelve at a time and says so with
 * `coordinatesPending: true`. While it does, the slip re-reads every couple of seconds so items past
 * the cap get their pins — and with them "Build my days around this", which needs a located item —
 * without waiting for an unrelated refetch. The server only reports pending while it has items it
 * has never tried, so this always stops. It also re-reads while the draft's place-facts lookups are
 * still running (`factsPendingItemIds`, item 8 below). Anything else: no polling.
 */
export const PLANCARD_PENDING_REFETCH_MS = 2000;

export function plancardRefetchInterval(
  data: { coordinatesPending?: boolean; factsPendingItemIds?: readonly string[] } | null | undefined,
): number | false {
  if (data?.coordinatesPending === true) return PLANCARD_PENDING_REFETCH_MS;
  if (Array.isArray(data?.factsPendingItemIds) && data!.factsPendingItemIds!.length > 0) return PLANCARD_PENDING_REFETCH_MS;
  return false;
}

/**
 * Smoke 5 item 8 — HOW THE SLIP LEARNS THE LOOKUPS FINISHED: by POLLING, not a server event. The
 * lookups run after the draft responds and write their progress to the draft's row; the plancard
 * read reports `factsPendingItemIds` while any remain, and this re-reads every
 * `PLANCARD_PENDING_REFETCH_MS` until the key is gone — at which point the facts are on the read.
 * Polling needs no socket and survives a reload or a different server instance answering.
 *
 * Pure. An item still being checked shows "checking hours…" where its facts line will go, and only
 * while it has no facts line of its own.
 */
export const CHECKING_HOURS_LABEL = "checking hours…";

export function showsCheckingHours(
  itemId: string,
  pending: readonly string[] | null | undefined,
  hasFactLine: boolean,
): boolean {
  return !hasFactLine && Array.isArray(pending) && pending.includes(itemId);
}
