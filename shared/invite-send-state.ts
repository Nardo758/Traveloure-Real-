/**
 * Row 207 server half (Architect, 2026-10-28 20:50 ET). The organizer's send
 * state is derived. Nothing in this module is stored.
 *
 * Codes only. The UI half imports `InviteSendState`; this file has no words
 * for a traveler to read.
 *
 * Mapping (a processing row is queued, and the four codes have no "queued"):
 *   no log row                         → not_sent
 *   outbox status sent, and outbox_id
 *     points at that row               → sent
 *   outbox status held                 → held
 *   outbox status failed, dead,
 *     or cancelled                     → failed
 *   outbox status processing, pending,
 *     or anything else                 → not_sent
 *   log with a null outbox_id          → never sent. One held row (or every
 *     reachable row held) → held. A failed enqueue with no row → failed.
 *     Anything else, including a row whose status is sent → not_sent.
 */
export const INVITE_SEND_STATES = ["not_sent", "held", "sent", "failed"] as const;
export type InviteSendState = (typeof INVITE_SEND_STATES)[number];

const FAILED_OUTBOX_STATUSES = new Set(["failed", "dead", "cancelled"]);

function fromPointedOutbox(status: string): InviteSendState {
  if (status === "sent") return "sent";
  if (status === "held") return "held";
  if (FAILED_OUTBOX_STATUSES.has(status)) return "failed";
  return "not_sent";
}

export function deriveInviteSendState(input: {
  hasLog: boolean;
  logStatus: string | null;
  /** Null when the log has no pointer, including every row written before the column existed. */
  outboxId: number | null;
  /** Status of the row `outboxId` points at. Null when the pointer is null or the row is gone. */
  pointedStatus: string | null;
  /**
   * Statuses of `guest_invite` outbox rows whose metadata names this invite.
   * Consulted only when `outboxId` is null. Ignored when a pointer is set.
   */
  unpointedStatuses: readonly string[];
}): InviteSendState {
  if (!input.hasLog) return "not_sent";

  if (input.outboxId != null) {
    if (input.pointedStatus == null) {
      return input.logStatus === "failed" ? "failed" : "not_sent";
    }
    return fromPointedOutbox(input.pointedStatus);
  }

  const statuses = input.unpointedStatuses;
  if (statuses.length === 0) {
    return input.logStatus === "failed" ? "failed" : "not_sent";
  }
  if (statuses.length > 1) {
    return statuses.every((status) => status === "held") ? "held" : "not_sent";
  }
  // One reachable row and no pointer. A stored "sent" on that row is not believed.
  if (statuses[0] === "sent") return "not_sent";
  return fromPointedOutbox(statuses[0]);
}
