/**
 * THE REVIEW A TRAVELER READS BEFORE AN EXPERT REQUEST GOES OUT — lane L19 of the Console &
 * AI Concierge brief (ledger `2026-09-07-request-is-a-click`), findings F1 and F2.
 *
 * WHY THIS MODULE EXISTS. Two surfaces sent a real lead on a control that reads as a way to
 * LOOK at something. `/experiences/:slug`'s "Get Expert Help" minted a slip and POSTed
 * `/api/expert-requests` as the dialog OPENED, then toasted "Shared with an expert"; the
 * Destination Concierge tier's "Request expert" PATCHed the concierge request and POSTed the
 * same rail on one click and answered "Request received". Neither traveler was ever shown what
 * was being sent, to whom, or at what price. The fix is not new plumbing: it is a stop screen,
 * and the send moves onto ITS button.
 *
 * THE RULES THIS FILE HOLDS, and why they live here rather than in the sheet's JSX:
 *
 * 1. **NOTHING IS INVENTED (§13).** A basic the traveler never stated renders as "Not set" —
 *    never a guessed date, never a party of one, never the destination the page happens to be
 *    about. "Not set" is also a fact the traveler needs: it says what the expert will NOT have.
 * 2. **THE RECIPIENT IS DESCRIBED, NEVER NAMED.** These leads are auto-routed
 *    (`lead-routing.service.ts` picks the expert server-side, after the POST), so the sheet
 *    cannot name a person without inventing one. It says the platform will match a local
 *    expert, and where a destination is stated it says for where.
 * 3. **THE PRICE IS THE CALLER'S OWN LINE.** The free lead rail creates no PaymentIntent
 *    (`booking-actions.ts`), so its price is FREE and says so; the concierge tier's price is the
 *    SAME "from $N" its card already renders, passed in rather than recomputed here — a second
 *    price derivation beside the one on screen is the drift class §18 rule 1 names, and it is
 *    how a review sheet starts quoting a number the card does not.
 *
 * Pure by construction: no React, no DOM, no fetch, no imports. Every decision above is
 * therefore provable without mounting anything.
 */

/** What an unanswered basic reads as. One spelling, so two surfaces cannot disagree (§13). */
export const EXPERT_REQUEST_NOT_SET = "Not set";

/** The free-lead price line. The rail mints no PaymentIntent, so this is a fact, not a promise. */
export const EXPERT_REQUEST_FREE_PRICE = "Free request";

export interface ExpertRequestPlanBasics {
  destination?: string | null;
  /** `YYYY-MM-DD`, as stated. Absent = never answered. */
  startDate?: string | null;
  /** `YYYY-MM-DD`, as stated. Absent = never answered. */
  endDate?: string | null;
  /** Total party size, as stated. Absent = never answered; 0 is not a party. */
  party?: number | null;
}

export interface ExpertRequestReviewRow {
  label: string;
  /** `null` means NOT STATED — the sheet prints `EXPERT_REQUEST_NOT_SET`, never a guess. */
  value: string | null;
}

function trimmed(value?: string | null): string | null {
  const text = (value ?? "").trim();
  return text.length > 0 ? text : null;
}

/**
 * The dates line, from the two stated strings and nothing else. Both stated ⇒ a range; one
 * stated ⇒ that one alone (half an answer is still the traveler's answer, and the other half is
 * not manufactured); neither ⇒ `null`. The strings are printed AS STATED: parsing a `YYYY-MM-DD`
 * through `new Date` shifts the day in negative-offset zones, which is how a plan starting on
 * the 10th gets reviewed as starting on the 9th.
 */
export function expertRequestDateLine(basics: ExpertRequestPlanBasics): string | null {
  const start = trimmed(basics.startDate);
  const end = trimmed(basics.endDate);
  if (start && end) return `${start} – ${end}`;
  return start || end;
}

/** The party line. A stated positive number only; `0`, negatives and absent are all "not set". */
export function expertRequestPartyLine(basics: ExpertRequestPlanBasics): string | null {
  const party = basics.party;
  if (typeof party !== "number" || !Number.isFinite(party) || party <= 0) return null;
  const whole = Math.floor(party);
  if (whole <= 0) return null;
  return whole === 1 ? "1 traveler" : `${whole} travelers`;
}

/** The three plan basics an expert reads, in the order the sheet draws them. */
export function expertRequestPlanRows(basics: ExpertRequestPlanBasics): ExpertRequestReviewRow[] {
  return [
    { label: "Destination", value: trimmed(basics.destination) },
    { label: "Dates", value: expertRequestDateLine(basics) },
    { label: "Travelers", value: expertRequestPartyLine(basics) },
  ];
}

/**
 * Who the request goes to. The lead is auto-routed AFTER it is sent, so no person can honestly
 * be named here (§13) — only the promise the platform can actually keep.
 */
export function expertRequestRecipientLine(destination?: string | null): string {
  const where = trimmed(destination);
  return where
    ? `A local expert we match for ${where}`
    : "A local expert we match for your plan";
}
