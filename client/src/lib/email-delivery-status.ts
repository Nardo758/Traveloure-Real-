/**
 * What the admin test-email panel may say about a message (board #1426). Pure.
 *
 * Resend's send call answering with an id means Resend ACCEPTED the message — not that it reached
 * the inbox. The panel used to print "Delivered successfully" at that point. It now says
 * "Accepted by Resend" and then reads Resend's own `last_event` to learn what actually happened.
 */
export type DeliveryTone = "success" | "error" | "pending";

export interface DeliveryDisplay {
  tone: DeliveryTone;
  title: string;
  /** No further change is expected — the panel stops asking. */
  terminal: boolean;
}

const DELIVERED = new Set(["delivered", "opened", "clicked"]);
const FAILED: Record<string, string> = {
  bounced: "Bounced — the receiving server refused it",
  failed: "Failed — Resend could not send it",
  complained: "Delivered, then marked as spam",
  suppressed: "Not sent — the address is on Resend's suppression list",
  canceled: "Canceled",
};

/** `lastEvent` undefined = not checked yet; null = Resend reported no event. */
export function deliveryDisplay(lastEvent: string | null | undefined): DeliveryDisplay {
  if (lastEvent && DELIVERED.has(lastEvent)) return { tone: "success", title: "Delivered", terminal: true };
  if (lastEvent && FAILED[lastEvent]) return { tone: "error", title: FAILED[lastEvent], terminal: true };
  if (lastEvent === "delivery_delayed") {
    return { tone: "pending", title: "Accepted by Resend — delivery delayed, still retrying", terminal: false };
  }
  return { tone: "pending", title: "Accepted by Resend — not yet confirmed delivered", terminal: false };
}
