/**
 * booking-agent-claim — the ONE reading of whether a pooled booking request is CLAIMED, and by
 * whom the viewer may be told it is claimed.
 *
 * CLAUDE.md Locked Decision 44's reserved question, ruled by ledger
 * `2026-09-08-assignment-is-claimed` and executed by `2026-09-15-booking-agent-claim`: auto-
 * assignment is retired, a request is born unclaimed, and it is CLAIMED from the pool by whoever
 * takes it. **§13: an unclaimed request says it is unclaimed and is never rendered as someone's.**
 *
 * WHAT THE QUEUE CAN AND CANNOT SEE. `GET /api/affiliate-booking-requests/expert` serves
 * `expert_id = me OR expert_id IS NULL` — so a row in that list is either unclaimed or the
 * VIEWER'S OWN, and no other agent's name is ever on the wire. That is why this module answers
 * with a claim STATE rather than a person: there is no third party to name, and inventing one
 * would be the §13 lie in the other direction.
 *
 * THE THREE READINGS, and the third is the one that matters:
 *   · `expertId` null/absent  ⇒ UNCLAIMED. A Claim control, no person's name.
 *   · `expertId` === viewer   ⇒ CLAIMED BY YOU.
 *   · `expertId` set, viewer UNKNOWN (the auth payload has not arrived, or carries no id)
 *                             ⇒ CLAIMED, said plainly. It is NOT "claimed by you" — that would be
 *                               a claim about a person made while the reader does not know who the
 *                               reader is — and it is NOT "unclaimed", which would offer a Claim
 *                               control the server will refuse with 409.
 *
 * NOTHING IS ZERO-FILLED AND NOTHING IS INVENTED. A legacy row carrying an auto-assigned
 * `expert_id` (there is NO BACKFILL — a row that was assigned was assigned) reads as claimed, not
 * as "unassigned"; and a row with no assignee reads as unclaimed, never as "assigned to the pool",
 * which is a thing nobody is.
 *
 * NEGATIVE SPACE. This module decides RENDER only. It grants nothing: the claim rail's own gate
 * (an expert or admin actor, and the atomic `expert_id IS NULL` conditional) is what keeps a write
 * out, and a rule about which buttons draw is never the thing that does (§14 posture).
 */

export interface ClaimableBookingRequest {
  expertId?: string | null;
}

export type BookingRequestClaimState = "unclaimed" | "claimed_by_you" | "claimed";

export interface BookingRequestClaimReading {
  state: BookingRequestClaimState;
  /** True only when nobody holds it — the one state in which the Claim control draws. */
  canClaim: boolean;
  /** The badge text. Never a person's name, because the queue never carries one. */
  label: string;
}

/**
 * Read one pooled row's claim state for a viewer.
 *
 * `viewerUserId` is optional on purpose: the inbox renders before `useAuth` resolves, and a reader
 * that does not yet know who it is must not answer "yours".
 */
export function readBookingRequestClaim(
  row: ClaimableBookingRequest,
  viewerUserId?: string | null,
): BookingRequestClaimReading {
  const holder = typeof row.expertId === "string" && row.expertId.trim().length > 0
    ? row.expertId.trim()
    : null;

  if (!holder) {
    return { state: "unclaimed", canClaim: true, label: "Unclaimed" };
  }
  const viewer = typeof viewerUserId === "string" && viewerUserId.trim().length > 0
    ? viewerUserId.trim()
    : null;
  if (viewer && viewer === holder) {
    return { state: "claimed_by_you", canClaim: false, label: "Claimed by you" };
  }
  return { state: "claimed", canClaim: false, label: "Claimed" };
}
