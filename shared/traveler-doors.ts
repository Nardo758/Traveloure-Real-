/**
 * The traveler door behind a switch, off by default (ledger `2026-10-18-traveler-doors-hidden`; decision-maker,
 * Oct 18, 2026, CS-3 Step 0). The old done-for-you concierge door (`event_concierge`) is retired by CN-1g / CN-1g-UI.
 *
 *   handoff_booking — "Book this for me" / "Book these for me" (the handoff's `book` kind). With it off the server refuses a NEW `book` ask or quote with 410;
 *                     existing holds and rows are untouched, and the `polish` and `plan_all` kinds are unaffected.
 *
 * A missing row, a read error, a loading read or any value other than "true" reads OFF.
 */
export const HANDOFF_BOOKING_SETTING = "handoff_booking";

/** The public read every traveler surface asks. Answers exactly `{ handoffBooking }`. */
export const TRAVELER_DOORS_ROUTE = "/api/traveler-doors";

export interface TravelerDoors {
  handoffBooking: boolean;
}

/** Each door is open only on an explicit `true` in the server's answer. */
export function travelerDoors(answer: unknown): TravelerDoors {
  const a = answer && typeof answer === "object" ? (answer as Record<string, unknown>) : {};
  return { handoffBooking: a.handoffBooking === true };
}

/** The handoff kinds a traveler is offered: `book` only while `handoff_booking` is on. */
export function offeredHandoffKinds<K extends string>(kinds: readonly K[], doors: Pick<TravelerDoors, "handoffBooking">): K[] {
  return kinds.filter((k) => k !== "book" || doors.handoffBooking);
}

/** The server's refusal for a new `book` handoff while `handoff_booking` is off. */
export const HANDOFF_BOOKING_OFF = { status: 410, code: "handoff_booking_off", message: "Booking hand-offs aren't available right now." } as const;
