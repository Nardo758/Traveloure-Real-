/**
 * Row 207, screen half (ledger `2026-10-29-invite-send-state-screen`): the words the organizer's
 * guest list uses for an invite's send state. The server derives the state (`sendState`, row 207
 * server half, `@shared/invite-send-state`); the screen only names it.
 *
 * SEND_STATE_COPY is APPROVED by Leon (Oct 29, 2026, 9:33 AM ET). INVITE_SEND_COPY is HELD for
 * his approval (Architect rulings N1, N4, N7, N8, Oct 29, 2026). Every new string the guest list
 * shows lives here, so a wording change is one edit.
 */
import type { InviteSendState } from "@shared/invite-send-state";

export const SEND_STATE_COPY: Record<InviteSendState, string> = {
  not_sent: "Not sent",
  held: "Waiting to send",
  sent: "Sent",
  failed: "Didn't send",
};

export const INVITE_SEND_COPY = {
  /** N1: the toast title after a send that wrote or re-addressed an outbox row. */
  updatedTitle: "Invites updated",
  /** N4: outbox rows the server could not check (`ambiguous`). */
  couldNotCheck: (n: number) => `${n} could not be checked. Try again later.`,
  /** N7: the "All Invites" card's explanation of the states. */
  stateExplainer:
    '"Sent" means the email has gone out. "Waiting to send" means it is saved and has not gone out yet. We can\'t tell you whether a guest opened it. You can still copy a link and share it yourself.',
  /** N8: rows the server's 5-minute debounce skipped, when nothing else happened. */
  skippedNothingToSend: (n: number) => `${n} updated moments ago, try again in a few minutes.`,
  /** N8: the same rows, beside other results. */
  skippedLine: (n: number) => `${n} skipped (updated moments ago).`,
} as const;
