// §8 phone delivery (ledger `2026-10-17-phone-delivery-calendar`; the bots' review Part C, ratified by Leon Oct 16,
// 2026): "Get your Trip Card on your phone". ONE home for the channels, their admin switches, the chooser's words and
// the rules the calendar feed follows, read by the server's one writer and the client chooser (§18 rule 1).
//
// Channels: the calendar feed and Add to Home Screen are built. Email and push are channels by name only — hidden
// (email until the mailbox exists; push is not in beta). Every switch starts OFF and the server enforces it.

export const PHONE_DELIVERY_CHANNELS = ["calendar", "home_screen", "email", "push"] as const;
export type PhoneDeliveryChannel = (typeof PHONE_DELIVERY_CHANNELS)[number];
/** The channels the chooser may ever show. Email and push are never drawn by this build. */
export const PHONE_DELIVERY_SHOWN_CHANNELS: readonly PhoneDeliveryChannel[] = ["calendar", "home_screen"];

/** platform_settings keys, one per channel. Missing, unreadable or anything but "true" ⇒ off. */
export const PHONE_DELIVERY_SWITCH: Record<PhoneDeliveryChannel, string> = {
  calendar: "phone_delivery_calendar_enabled",
  home_screen: "phone_delivery_home_screen_enabled",
  email: "phone_delivery_email_enabled",
  push: "phone_delivery_push_enabled",
};
export const PHONE_DELIVERY_SWITCH_KEYS: readonly string[] = Object.values(PHONE_DELIVERY_SWITCH);

/** What a person chose, as stored in phone_delivery_choices.choice (app-enforced). */
export const PHONE_DELIVERY_CHOICES = ["opt_in", "opt_out", "reset"] as const;
export type PhoneDeliveryChoice = (typeof PHONE_DELIVERY_CHOICES)[number];

// The chooser's words, word for word (Part C).
export const PHONE_DELIVERY_TITLE = "Get your Trip Card on your phone";
export const PHONE_DELIVERY_CALENDAR_HEADING = "Add to my calendar.";
export const PHONE_DELIVERY_CALENDAR_BODY = "Each stop goes into your phone’s calendar with its time, address and a map link.";
export const PHONE_DELIVERY_CALENDAR_WARNING = "Anyone with this link can see your trip.";
export const PHONE_DELIVERY_RESET_LINK = "Reset link.";
export const PHONE_DELIVERY_HOME_HEADING = "Add to Home Screen.";
export const PHONE_DELIVERY_HOME_BODY = "Open your Trip Card in one tap.";
/** The two sets of steps under Add to Home Screen. */
export const PHONE_DELIVERY_IPHONE_STEPS = [
  "Open this Trip Card in Safari.",
  "Tap the Share button.",
  "Tap Add to Home Screen, then Add.",
] as const;
export const PHONE_DELIVERY_ANDROID_STEPS = [
  "Open this Trip Card in Chrome.",
  "Tap the menu (⋮).",
  "Tap Add to Home screen, then Add.",
] as const;

/** D2: the feed lives for 7 days after the trip's last day; after that it answers 410. */
export const CALENDAR_FEED_DAYS_AFTER_END = 7;
/**
 * The instant a feed stops: the start of the day after `endDate + 7 days`, in UTC. `endDate` is a calendar day
 * ("YYYY-MM-DD" or a Date). Null when the date cannot be read (the caller then treats the feed as expired, §13).
 */
export function calendarFeedExpiresAt(endDate: string | Date | null | undefined): Date | null {
  if (!endDate) return null;
  const iso = endDate instanceof Date ? endDate.toISOString().slice(0, 10) : String(endDate).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + CALENDAR_FEED_DAYS_AFTER_END + 1));
}

/**
 * D1: "Booked" is said only for a booking Traveloure holds — a service booking in one of these statuses, or a
 * LiteAPI stay booking that is confirmed. Anything else (a partner link, a concierge request, a pending checkout)
 * carries no booking language at all.
 */
export const HELD_SERVICE_BOOKING_STATUSES: readonly string[] = [
  "confirmed",
  "deposit_paid",
  "balance_paid",
  "completion_declared",
  "awaiting_acceptance",
  "completed",
];
export const HELD_LITEAPI_BOOKING_STATUSES: readonly string[] = ["confirmed"];

/**
 * D1: each copy says when it was made — "as of Oct 16, 3:15 PM Kyoto time". `placeName` is the plan's city; with no
 * usable zone the time is given in UTC and says so. Never "live", "app" or "works offline".
 */
export function phoneDeliveryAsOf(madeAt: Date, timeZone: string | null | undefined, placeName: string | null | undefined): string {
  const zone = usableZone(timeZone);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone ?? "UTC",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const parts = fmt.formatToParts(madeAt);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const when = `${get("month")} ${get("day")}, ${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
  const where = zone ? (placeName ? `${placeName} time` : zone) : "UTC";
  return `as of ${when} ${where}`;
}

export function usableZone(timeZone: string | null | undefined): string | null {
  if (!timeZone) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return null;
  }
}

/** D1: words a feed must never carry. Checked by the feed tests. */
export const PHONE_DELIVERY_FORBIDDEN_WORDS = /\b(live|app|works offline|leave by|leave-by)\b/i;
