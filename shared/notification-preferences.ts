/**
 * Per-event notification preferences (board task #1230, ledger `2026-09-23-phase2-messages`).
 *
 * The expert and provider Settings pages save these under `users.preferences.settings.notifications`,
 * and until now no server code read them: the toggles did nothing. This module is the ONE statement
 * of the keys, the born defaults and how a saved value is read — the Settings page builds its rows
 * from it and the server asks it before creating a notice (§18 rule 1: a second copy of the defaults
 * would drift, and a server default that disagrees with the page would ignore what the page shows).
 *
 * CHANNELS. `email` is an email; `push` is what the Settings page labels Push. There is no device
 * push transport in the platform, so the only non-email notice that exists is the in-app one, and
 * `push` governs that.
 *
 * ABSENT IS NOT OPTED OUT (§13). A key or channel the user never saved reads as its born default,
 * never as `false`.
 */
export type NotificationChannel = "email" | "push";

export const NOTIFICATION_PREFERENCE_KEYS = [
  "newMessage",
  "bookingRequest",
  "itineraryUpdate",
  "paymentReceived",
  "platformAnnouncements",
] as const;

export type NotificationPreferenceKey = (typeof NOTIFICATION_PREFERENCE_KEYS)[number];

export const NOTIFICATION_PREFERENCE_DEFAULTS: Record<
  NotificationPreferenceKey,
  { name: string; email: boolean; push: boolean }
> = {
  newMessage: { name: "New Message", email: true, push: true },
  bookingRequest: { name: "Booking Request", email: true, push: true },
  itineraryUpdate: { name: "Itinerary Update", email: false, push: true },
  paymentReceived: { name: "Payment Received", email: true, push: true },
  platformAnnouncements: { name: "Platform Announcements", email: true, push: false },
};

/** Read one channel of one key out of a `users.preferences` value. Pure. */
export function notificationChannelEnabled(
  preferences: unknown,
  key: NotificationPreferenceKey,
  channel: NotificationChannel,
): boolean {
  const saved = (preferences as any)?.settings?.notifications?.[key]?.[channel];
  return typeof saved === "boolean" ? saved : NOTIFICATION_PREFERENCE_DEFAULTS[key][channel];
}
