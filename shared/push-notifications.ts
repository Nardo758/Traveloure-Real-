/**
 * Phone push — the pure rules (Locked Decision 53, ledger `2026-09-24-web-push`).
 *
 * WHICH notices reach a phone, UNDER WHOSE consent, and WHERE a tap opens — stated once so the
 * server sender and its tests read one table (§18 rule 1). Pure: no DB, no env.
 *
 * CONSENT. A notice goes to a phone only when its type maps to one of the five preference keys and
 * the person's `push` switch for that key is on (the Settings page has always labelled that channel
 * "Push"; `NOTIFICATION_PREFERENCE_DEFAULTS` is the default). A type this table does not name is
 * never pushed — a phone buzz is a stronger claim on someone's attention than a bell row, so an
 * unlisted notice stays in the bell rather than being pushed under a guessed key (§13).
 */
import type { NotificationPreferenceKey } from "./notification-preferences";

const TYPE_TO_KEY: Record<string, NotificationPreferenceKey> = {
  // Messages
  message_received: "newMessage",
  new_chat: "newMessage",
  ea_message: "newMessage",
  // Requests and booking activity
  booking_request: "bookingRequest",
  booking_confirmed: "bookingRequest",
  booking_cancelled: "bookingRequest",
  traveler_cancelled: "bookingRequest",
  quote_requested: "bookingRequest",
  review_received: "bookingRequest",
  expert_request: "bookingRequest",
  expert_inquiry: "bookingRequest",
  earner_no_response: "bookingRequest",
  // Plan activity
  itinerary_update: "itineraryUpdate",
  itinerary_item_added: "itineraryUpdate",
  expert_suggestion: "itineraryUpdate",
  trip_card_ready: "itineraryUpdate",
  assistant_plan_created: "itineraryUpdate",
  // Money
  payout_processed: "paymentReceived",
};

export function pushPreferenceKeyFor(type: string | null | undefined): NotificationPreferenceKey | null {
  if (!type) return null;
  return TYPE_TO_KEY[type] ?? null;
}

/** The page a tap on the notification opens — an in-app path, never an external URL. */
export function pushTargetPath(n: { type?: string | null; data?: Record<string, unknown> | null }): string {
  const data = n.data ?? {};
  const workspacePath = typeof data.workspacePath === "string" ? data.workspacePath : null;
  const tripId = typeof data.tripId === "string" ? data.tripId : null;
  const safe = (p: string | null) => (p && p.startsWith("/") && !p.startsWith("//") ? p : null);
  if (tripId && workspacePath?.startsWith("/trip/")) return `/plans/${tripId}`;
  const wp = safe(workspacePath);
  if (wp) return wp;
  if (tripId) return `/plans/${tripId}`;
  if (n.type === "message_received" || n.type === "new_chat") return "/chat";
  return "/";
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  /** Collapses repeats of the same notice on the device. */
  tag: string;
}

export function buildPushPayload(n: {
  id: string;
  type?: string | null;
  title?: string | null;
  message?: string | null;
  data?: Record<string, unknown> | null;
}): PushPayload {
  const title = (n.title ?? "").trim().slice(0, 120) || "Traveloure";
  const body = (n.message ?? "").trim().slice(0, 240);
  return { title, body, url: pushTargetPath(n), tag: `n-${n.id}` };
}
