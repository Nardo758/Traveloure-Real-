/**
 * Two traveler doors behind switches, both off by default (ledger `2026-10-18-traveler-doors-hidden`; decision-maker,
 * Oct 18, 2026, CS-3 Step 0). Hide only: no row is changed, and nothing that already exists stops working.
 *
 *   event_concierge — the old done-for-you concierge: /concierge (every ?tier= variant), the /optimize redirect into it,
 *                     and the doors that lead there. /my-events stays reachable for existing engagements and its
 *                     "Pay coordination fee" is untouched.
 *   handoff_booking — "Book this for me" / "Book these for me" (the handoff's `book` kind) and the after-a-failed-handoff
 *                     "Hand it to our concierge". With it off the server refuses a NEW `book` ask or quote with 410;
 *                     existing holds and rows are untouched, and the `polish` and `plan_all` kinds are unaffected.
 *
 * A missing row, a read error, a loading read or any value other than "true" reads OFF.
 */
export const EVENT_CONCIERGE_SETTING = "event_concierge";
export const HANDOFF_BOOKING_SETTING = "handoff_booking";

/** The public read every traveler surface asks. Answers exactly `{ eventConcierge, handoffBooking }`. */
export const TRAVELER_DOORS_ROUTE = "/api/traveler-doors";

export interface TravelerDoors {
  eventConcierge: boolean;
  handoffBooking: boolean;
}

/** Each door is open only on an explicit `true` in the server's answer. */
export function travelerDoors(answer: unknown): TravelerDoors {
  const a = answer && typeof answer === "object" ? (answer as Record<string, unknown>) : {};
  return { eventConcierge: a.eventConcierge === true, handoffBooking: a.handoffBooking === true };
}

/** The handoff kinds a traveler is offered: `book` only while `handoff_booking` is on. */
export function offeredHandoffKinds<K extends string>(kinds: readonly K[], doors: Pick<TravelerDoors, "handoffBooking">): K[] {
  return kinds.filter((k) => k !== "book" || doors.handoffBooking);
}

/** The server's refusal for a new `book` handoff while `handoff_booking` is off. */
export const HANDOFF_BOOKING_OFF = { status: 410, code: "handoff_booking_off", message: "Booking hand-offs aren't available right now." } as const;
