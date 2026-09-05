/**
 * The one-line "what event is this?" caption on the Guest Invites surface (QA F3).
 *
 * WHY THIS IS A MODULE AND NOT AN EXPRESSION IN THE COMPONENT. The line renders a DATE-ONLY
 * value — `user_experiences.event_date` is a Postgres DATE column, so it reaches the client as a
 * bare "YYYY-MM-DD" string — and `new Date("2026-10-10")` is specified to parse as UTC MIDNIGHT.
 * Every viewer west of UTC therefore read the PREVIOUS calendar day (10/9/2026 for an event on
 * the 10th), a day that can sit outside the plan's own date range. The bug is invisible at UTC
 * and east of it, which is exactly why the derivation is pulled out here and pinned under three
 * timezones rather than eyeballed in a component.
 *
 * THE PARSER IS NOT RE-IMPLEMENTED. `parseTripDate` (`@/lib/calendar-date`) is the client's ONE
 * date-only parser — the same one `plan-guests.tsx`, `SlipView`, `my-trips` and the plan modal
 * read trip dates through — and a second copy of that rule is the drift class CLAUDE.md §18
 * rule 1 names.
 *
 * §13 — EVERY ABSENCE IS AN ABSENCE. A blank name, a blank destination and an absent or
 * unparseable date are each OMITTED from the line, separator and all. They are never rendered as
 * "Invalid Date" (what `new Date("")` produced here before) or as the epoch (what
 * `new Date(null)` produces), both of which are days nobody stated.
 */
import { parseTripDate } from "@/lib/calendar-date";

export const GUEST_INVITE_META_SEPARATOR = " • ";

export interface GuestInviteMetaInput {
  eventName?: string | null;
  eventDestination?: string | null;
  /** "YYYY-MM-DD" (the DATE column's own shape), a full ISO timestamp, or nothing. */
  eventDate?: string | Date | null;
}

/**
 * Formats the caption. `locale`/`options` are handed straight to `toLocaleDateString`, so a
 * caller may state a format; the default is the viewer's own.
 */
export function guestInviteMetaLine(
  input: GuestInviteMetaInput,
  locale?: string | string[],
  options?: Intl.DateTimeFormatOptions,
): string {
  const day = parseTripDate(input.eventDate ?? null);
  return [
    input.eventName,
    input.eventDestination,
    day ? day.toLocaleDateString(locale, options) : null,
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0)
    .join(GUEST_INVITE_META_SEPARATOR);
}
