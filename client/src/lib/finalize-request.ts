/**
 * Row 328 — "Add to checkout" on the Trip Card opens Finalize, with that item in hand.
 *
 * The control lives on the board (`ActivitiesSection`), the modal lives in the slip rail (`SlipRail`), and
 * they are different components with no shared parent state. This module is the one channel between them:
 * a request names the item, the rail — the modal's owner — opens with it. Same emitter shape the add runner
 * already uses (`plan-add-runner.ts`), so there is one pattern for "one surface asks another to open".
 *
 * The wording of the control does NOT change: it stays "Add to checkout".
 */
export interface FinalizeRequest {
  /** The item the traveler pressed. The modal scopes its copy and its platform set to it. */
  itemId: string;
}

const listeners = new Set<(req: FinalizeRequest) => void>();

/** Ask the modal's owner to open Finalize for this item. Returns false when nothing is listening. */
export function requestFinalizeFor(itemId: string): boolean {
  if (!itemId) return false;
  const req: FinalizeRequest = { itemId };
  listeners.forEach((l) => l(req));
  return listeners.size > 0;
}

/** The rail subscribes while it is mounted. Returns the unsubscribe. */
export function onFinalizeRequest(listener: (req: FinalizeRequest) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
