/**
 * Slice 0 (ledger `2026-11-10-slice0-staff-roles`): a staff approval that waits for the owner's sign-off.
 *
 * The approve routes answer 202 `{ awaitingOwnerSignoff: true }` when the approval was stamped and the owner has not
 * confirmed it yet; a publishing approval answers 200. The admin screens read that answer here and never decide it
 * themselves. Copy: Wording approved — Leon (Nov 11, 2026, PR #1979).
 */
export const OWNER_SIGNOFF_TITLE = "Sent for owner sign-off";
export const LISTING_AWAITING_OWNER_DESCRIPTION = "It goes live once the owner approves it.";
export const PROVIDER_AWAITING_OWNER_DESCRIPTION = "The provider is approved once the owner confirms.";

/** Pure: did the server say this approval is waiting for the owner? Unreadable bodies read as not waiting. */
export function isAwaitingOwnerSignoff(status: number, body: unknown): boolean {
  return status === 202 && !!body && typeof body === "object" && (body as { awaitingOwnerSignoff?: unknown }).awaitingOwnerSignoff === true;
}

/** Read an approve response into the one fact the screens need. */
export async function readApprovalOutcome(res: Response): Promise<{ awaitingOwnerSignoff: boolean }> {
  let body: unknown = null;
  try {
    body = await res.clone().json();
  } catch {
    body = null;
  }
  return { awaitingOwnerSignoff: isAwaitingOwnerSignoff(res.status, body) };
}
