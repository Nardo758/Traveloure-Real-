/**
 * Row 207, screen half (ledger `2026-10-29-invite-send-state-screen`): the guest list's send-state
 * rules, pure so they are tested without React. Display follows the server's derived `sendState`
 * and nothing else. `inviteSentAt` is the send claim's stamp, not a send state, and is not read.
 * A row is never shown as "Sent" or "Waiting to send" because of a click; only the refetch moves it.
 */
import type { InviteSendState } from "@shared/invite-send-state";
import { INVITE_SEND_COPY } from "./invite-send-state-copy";

export interface InviteSendStateRow {
  sendState?: InviteSendState | null;
}

/** The state a row shows: the server's code, or "not_sent" when an older response has none. */
export function displaySendState(row: InviteSendStateRow): InviteSendState {
  return row.sendState ?? "not_sent";
}

/** The rows a bulk click would actually try: not sent, or failed. Held rows are not counted. */
export function sendableInviteCount(rows: readonly InviteSendStateRow[]): number {
  return rows.filter((r) => {
    const s = displaySendState(r);
    return s === "not_sent" || s === "failed";
  }).length;
}

/** "All invites emailed" is true only when every row's state is "sent". */
export function everyInviteSent(rows: readonly InviteSendStateRow[]): boolean {
  return rows.length > 0 && rows.every((r) => displaySendState(r) === "sent");
}

export type BulkSendButton =
  | { kind: "sending"; label: string; disabled: true; title?: undefined }
  | { kind: "all_sent"; label: string; disabled: true; title: string }
  | { kind: "nothing_to_send"; label: string; disabled: true; title?: undefined }
  | { kind: "send"; label: string; disabled: false; title?: undefined };

/**
 * The bulk button (Architect rulings N5/N6/Q2, Oct 29, 2026): "All invites emailed" and its title
 * only when every row is sent; otherwise, with nothing sendable, the existing "Nothing to send",
 * disabled and with no title.
 */
export function bulkSendButton(rows: readonly InviteSendStateRow[], isSendingAll: boolean): BulkSendButton {
  if (isSendingAll) return { kind: "sending", label: "Sending…", disabled: true };
  if (everyInviteSent(rows)) {
    return {
      kind: "all_sent",
      label: "All invites emailed",
      disabled: true,
      title: "Every guest has already been emailed their invitation",
    };
  }
  const n = sendableInviteCount(rows);
  if (n === 0) return { kind: "nothing_to_send", label: "Nothing to send", disabled: true };
  return { kind: "send", label: `Email ${n} un-sent ${n === 1 ? "invite" : "invites"}`, disabled: false };
}

/** The per-row Email invite button: one label in every state; nothing to do once sent. */
export function rowSendButtonDisabled(row: InviteSendStateRow, inFlight: boolean): boolean {
  return inFlight || displaySendState(row) === "sent";
}

export interface SendResponseCounts {
  enqueued?: unknown;
  skipped?: unknown;
  failed?: unknown;
  leftSent?: unknown;
  ambiguous?: unknown;
}

export interface SendToast {
  title: string;
  description: string;
  variant?: "destructive";
}

/**
 * The toast after POST …/invites/send. The server's counts are reported, never upgraded:
 * an enqueued row may be held, so nothing here says it went out. `leftSent` gets no line (N3);
 * the refetched cell shows "Sent".
 */
export function sendResultToast(data: SendResponseCounts | null | undefined): SendToast {
  const n = (v: unknown) => {
    const x = Number(v ?? 0);
    return Number.isFinite(x) && x > 0 ? x : 0;
  };
  const enqueued = n(data?.enqueued);
  const skipped = n(data?.skipped);
  const failed = n(data?.failed);
  const leftSent = n(data?.leftSent);
  const ambiguous = n(data?.ambiguous);

  if (enqueued === 0 && failed === 0 && ambiguous === 0) {
    return {
      title: "Nothing to send",
      description:
        skipped > 0
          ? INVITE_SEND_COPY.skippedNothingToSend(skipped)
          : leftSent > 0
            ? ""
            : "No guests were selected.",
    };
  }
  return {
    title: enqueued > 0 ? INVITE_SEND_COPY.updatedTitle : "Couldn't send",
    description: [
      skipped > 0 ? INVITE_SEND_COPY.skippedLine(skipped) : null,
      failed > 0 ? `${failed} could not be queued.` : null,
      ambiguous > 0 ? INVITE_SEND_COPY.couldNotCheck(ambiguous) : null,
    ]
      .filter(Boolean)
      .join(" "),
    ...(enqueued > 0 ? {} : { variant: "destructive" as const }),
  };
}
