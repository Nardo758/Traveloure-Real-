/**
 * Live help — the pure rules (Locked Decision 54, ledger `2026-09-24-live-chat-qa-sessions`).
 *
 * Stated ONCE so the expert list, the storefront, the console switch and the Live Chat tab read one
 * answer (§18 rule 1). Pure: no DB, no env.
 *
 * AVAILABLE NOW is a claim the EARNER makes, with an expiry: `users.available_now_until` in the
 * future means they said "I'm here" and the window has not lapsed. Vacation mode beats it — an
 * away earner is never shown as available. NULL or past = not available; it is never guessed from
 * a websocket connection or a recent login (§13 — being online is not being available).
 *
 * USUALLY REPLIES is MEASURED, never typed: the median minutes between a traveler's opening
 * message of a day and the earner's next reply, over recent history, with unanswered messages
 * counted as "never". Too few samples, or a slow median, shows nothing — we do not advertise a
 * reply time we cannot stand behind, and we never promise one (no SLA; decision-maker, Sep 24).
 */

export function isAvailableNow(
  row: { availableNowUntil?: Date | string | null; vacationUntil?: Date | string | null },
  now: Date = new Date(),
): boolean {
  const t = (v: Date | string | null | undefined) =>
    v == null ? null : (v instanceof Date ? v : new Date(v)).getTime();
  const until = t(row.availableNowUntil);
  const away = t(row.vacationUntil);
  if (away != null && !Number.isNaN(away) && away > now.getTime()) return false;
  return until != null && !Number.isNaN(until) && until > now.getTime();
}

/** Fewest measured conversations before a reply time is shown at all. */
export const REPLY_TIME_MIN_SAMPLES = 5;

export type ReplyTimeBucket = "within_an_hour" | "within_a_few_hours" | "within_a_day";

/** The bare phrase, for a surface that composes its own sentence ("Usually replies within an hour"). */
export const REPLY_TIME_PHRASES: Record<ReplyTimeBucket, string> = {
  within_an_hour: "within an hour",
  within_a_few_hours: "within a few hours",
  within_a_day: "within a day",
};

export const REPLY_TIME_LABELS: Record<ReplyTimeBucket, string> = {
  within_an_hour: "Usually replies within an hour",
  within_a_few_hours: "Usually replies within a few hours",
  within_a_day: "Usually replies within a day",
};

/**
 * The bucket for a measured median, or null when there is nothing honest to say: no median (too
 * few samples, or most openings never answered) or a median slower than a day.
 */
export function replyTimeBucket(medianMinutes: number | null | undefined, samples: number): ReplyTimeBucket | null {
  if (samples < REPLY_TIME_MIN_SAMPLES) return null;
  if (medianMinutes == null || !Number.isFinite(medianMinutes) || medianMinutes < 0) return null;
  if (medianMinutes <= 60) return "within_an_hour";
  if (medianMinutes <= 180) return "within_a_few_hours";
  if (medianMinutes <= 1440) return "within_a_day";
  return null;
}

/** Session lengths an expert may sell a Q&A Session in, in minutes. */
export const QA_SESSION_LENGTHS = [15, 30, 45, 60, 90] as const;

export function isQaSessionLength(n: unknown): n is (typeof QA_SESSION_LENGTHS)[number] {
  return typeof n === "number" && (QA_SESSION_LENGTHS as readonly number[]).includes(n);
}

export function qaSessionLengthLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return "1 hour";
  return minutes % 60 === 0 ? `${minutes / 60} hours` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

/** The offering whose listings are Q&A Sessions (expert catalog, migration 039). */
export const QA_SESSION_OFFERING_KEY = "ask_me_anything";
/** The offering whose listings are "Text a Local" (expert catalog, migration 039). */
export const TEXT_A_LOCAL_OFFERING_KEY = "text_a_local";
/** The price unit a Text a Local listing is sold in. */
export const PER_DAY_PRICING_UNIT = "per_day";

export type QaSessionState =
  | { phase: "not_started"; lengthMinutes: number }
  | { phase: "live"; lengthMinutes: number; startedAt: string; endsAt: string; remainingMs: number }
  | { phase: "ended"; lengthMinutes: number; startedAt: string; endsAt: string };

/** Where a session stands, from its stamp (booking_details.qaSession) and the clock. */
export function qaSessionState(
  lengthMinutes: number,
  stamp: { startedAt?: string | null; endsAt?: string | null } | null | undefined,
  now: Date = new Date(),
): QaSessionState {
  if (!stamp?.startedAt || !stamp?.endsAt) return { phase: "not_started", lengthMinutes };
  const remainingMs = new Date(stamp.endsAt).getTime() - now.getTime();
  if (remainingMs > 0) {
    return { phase: "live", lengthMinutes, startedAt: stamp.startedAt, endsAt: stamp.endsAt, remainingMs };
  }
  return { phase: "ended", lengthMinutes, startedAt: stamp.startedAt, endsAt: stamp.endsAt };
}

export type LiveListingRefusalCode = "PER_DAY_NEEDS_MESSAGING" | "QA_SESSION_LENGTH_REQUIRED";

/**
 * The listing terms these two products need before they can go live (ONE predicate, shared by the
 * create and update rails — §18 rule 1):
 *   · a PER-DAY price is only meaningful for a messaging listing (the day count is cover, not seats);
 *   · a chat Q&A Session (`ask_me_anything` delivered as `async_messaging`) must state its length
 *     from the menu, because the length IS the product.
 */
export function liveListingTermsRefusal(listing: {
  deliveryMethod?: string | null;
  pricingUnit?: string | null;
  expertOfferingTypeKey?: string | null;
  durationMinutes?: number | string | null;
}): { code: LiveListingRefusalCode; message: string } | null {
  if (listing.pricingUnit === PER_DAY_PRICING_UNIT && listing.deliveryMethod !== "async_messaging") {
    return { code: "PER_DAY_NEEDS_MESSAGING", message: "Per-day pricing is for messaging listings (like Text a Local)." };
  }
  if (listing.expertOfferingTypeKey === QA_SESSION_OFFERING_KEY && listing.deliveryMethod === "async_messaging") {
    const n = listing.durationMinutes == null || listing.durationMinutes === "" ? NaN : Number(listing.durationMinutes);
    if (!isQaSessionLength(n)) {
      return { code: "QA_SESSION_LENGTH_REQUIRED", message: "Choose how long the Q&A session lasts before publishing." };
    }
  }
  return null;
}
