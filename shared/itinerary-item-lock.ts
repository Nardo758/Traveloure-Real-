/**
 * ITEM LOCKS — ruling R-ah (decision-maker, Oct 3, 2026; ledger `2026-10-03-item-locks`,
 * migration 342): "Travelers can lock any item ('Keep this'). The Moment item is locked by
 * default. Regeneration, Optimize and Build-around never move or remove locked items. Locked state
 * persists after a reload, and Optimize output leaves locked items in place."
 *
 * A lock is `itinerary_items.locked_at` — NULL = not locked. It joins Locked Decision 42 D3's
 * expert-work class as the ONE class a MACHINE may not rewrite: `itineraryItemIsMachineProtected`
 * is the row-level form, `itineraryItemNotMachineProtected()` (server/services/itinerary-rebuild-guard.ts)
 * the WHERE-clause form, and every machine rail (optimizer baseline, apply-to-trip, regenerate,
 * the AI proposal apply) asks one of the two — never a third test (§18 rule 1).
 *
 * Like expert work, a lock protects the row from MACHINES, not from its owner: the traveler's own
 * ✕, move and edit are unchanged.
 */
import { itineraryItemIsExpertWork, type ExpertWorkProbe } from "./itinerary-item-expert";

export interface LockProbe {
  lockedAt?: Date | string | null;
}

/** True when the row is locked. */
export function itineraryItemIsLocked(item: LockProbe): boolean {
  return item.lockedAt != null && item.lockedAt !== "";
}

/** The ONE machine-protected class: expert work (D3) or a lock (R-ah). */
export function itineraryItemIsMachineProtected(item: ExpertWorkProbe & LockProbe): boolean {
  return itineraryItemIsExpertWork(item) || itineraryItemIsLocked(item);
}
