/**
 * D8 completion windows — the TIME constants ruling 63 names, as CONFIG rather than literals
 * (the `earnings-hold.config.ts` posture one lane over). These are DAY COUNTS, not fees, not
 * rates and not amounts: nothing here multiplies money, it only decides WHEN a completion event
 * fires. §8 is untouched by this module.
 *
 * There is deliberately NO second dispute window here. Ruling 63's async row says "disputable
 * window" and the build charter says to REUSE the one that already exists — that is
 * `holdWindowDays('service_booking')` in `earnings-hold.config.ts`, which the escrow spine
 * already applies from `completedAt` on BOTH sides (the earning's `availableAt`, and the
 * `POST /api/bookings/:id/dispute` cutoff). A booking completed by any D8 rule inherits it for
 * free precisely because every rule ends at the SAME `updateServiceBookingStatus('completed')`
 * flip. Do not add a parallel constant.
 */

import { holdWindowDays } from "./earnings-hold.config";

function envDays(key: string, dflt: number): number {
  const v = parseInt(process.env[key] || "", 10);
  return Number.isFinite(v) && v >= 0 ? v : dflt;
}

/**
 * Ruling 63's pdf row: "auto-complete at 7 days (7 days after FIRST download, or 7 days
 * UNDOWNLOADED post-delivery)". One window, both arms — the ruling names a single number.
 */
export const ARTIFACT_AUTO_COMPLETE_DAYS = envDays("BOOKING_AUTO_COMPLETE_DAYS_ARTIFACT", 7);

/**
 * Ruling 63's property row: "checkout date". A stay is complete when its checkout DAY has fully
 * passed — the grace is 0 days by default (the day boundary itself is the event) and exists only
 * so an operator can widen it without a code change. Deliberately NOT the artifact window.
 */
export const PROPERTY_AUTO_COMPLETE_GRACE_DAYS = envDays("BOOKING_AUTO_COMPLETE_GRACE_PROPERTY", 0);

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ruling 69 disposition 1's in_person/hybrid row: "auto-complete N days after the booked service
 * date". **N IS NOT A NEW CONSTANT** — it is `holdWindowDays('service_booking')`, re-exported
 * through this one named accessor so the intent is readable where the rule is read.
 *
 * WHY THAT NUMBER AND NOT ANOTHER: the decision-maker's disposition says completion at the moment
 * the dispute window closes is the coherent shape. `holdWindowDays('service_booking')` is already
 * BOTH the held earning's `availableAt` and the `POST /api/bookings/:id/dispute` cutoff, so a
 * separate in-person timer constant could only ever drift away from the window it is supposed to
 * track. The file header's "do not add a parallel constant" rule therefore binds here too — this
 * function delegates, it does not define.
 */
export function serviceDateCompletionDays(): number {
  // Imported lazily-by-reference (a plain call) rather than re-declared: one authority, one value.
  return holdWindowDays("service_booking");
}

/**
 * D-6's ACCEPTANCE WINDOW — how long a traveler has to accept a delivered artifact before the
 * booking escalates (punchlist D-24/D-27; ledger `2026-09-15-d24-d26-acceptance-columns`).
 *
 * THE DECISION-MAKER SET THE NUMBER: 7 days (D-27's period), env-overridable through
 * `BOOKING_ACCEPTANCE_WINDOW_DAYS` — CONFIG, never a literal in a route (§8 posture).
 *
 * WHY IT IS ITS OWN ACCESSOR AND NOT A DELEGATION. `serviceDateCompletionDays()` above delegates to
 * `holdWindowDays('service_booking')` because it measures the SAME thing that window measures — the
 * traveler's chance to object before money settles. This one measures something else: the time a
 * traveler has to ANSWER before the booking leaves them and goes to a human. The earnings hold has
 * not started yet at that point (nothing has minted), so tracking it would tie two windows that
 * answer different questions. This is not the "parallel constant" the file header forbids; it is a
 * second question with its own number.
 *
 * IT ONLY SAYS WHEN THE WINDOW CLOSES. The escalation itself — `awaiting_acceptance` to admin
 * review — is D-27's lane and this lane writes none of it.
 */
export const ACCEPTANCE_WINDOW_DAYS_DEFAULT = 7;

export function acceptanceWindowDays(): number {
  return envDays("BOOKING_ACCEPTANCE_WINDOW_DAYS", ACCEPTANCE_WINDOW_DAYS_DEFAULT);
}

/**
 * D-7's DECLARED-COMPLETION WINDOW — how long a traveler has to dispute after the seller declares
 * the work done, before the booking completes and the held earning mints (punchlist D-36/D-37;
 * ledger `2026-09-15-d36-d39-completion-declared`; brief Part II §12).
 *
 * **THIS IS NOT A NEW CONSTANT.** It is `holdWindowDays('service_booking')` — the number that is
 * ALREADY the held earning's `availableAt` and ALREADY the `POST /api/bookings/:id/dispute` cutoff —
 * reached through one more named accessor so the intent is readable where the rule is read. The
 * file header's "do not add a parallel constant" rule binds here exactly as it binds
 * `serviceDateCompletionDays()` above: this function DELEGATES, it does not define, and it is
 * env-overridable through the existing `EARNINGS_HOLD_DAYS` family and nothing else.
 *
 * WHY THE SAME NUMBER. D-37 puts the mint at the window's CLOSE with `availableAt` anchored to the
 * DECLARATION instant, so the declared window and the earnings hold are the SAME span measured from
 * the same instant — one window, served once. A separate declared-window constant could only ever
 * drift away from the hold it is supposed to coincide with, and the day it did the traveler would be
 * told one deadline while the money obeyed another.
 *
 * IT ONLY SAYS HOW LONG. WHEN it closes for a given booking is `declaredCompletionDeadline()` in
 * `shared/declared-completion-window.ts` (derived, never stored — D-36); what happens at the close
 * is `completeBooking`'s `window_elapsed` arm.
 */
export function declaredCompletionWindowDays(): number {
  return holdWindowDays("service_booking");
}
