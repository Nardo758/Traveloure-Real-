/**
 * LG-2 Ask 5 (decision-maker, Oct 18, 2026): items that must not get a single place point of their own. A private tour,
 * an "Arrive in …", an airport arrival and a hotel check-in route from a provider's meeting point or the traveler's
 * chosen stay — never a city or district centre. With neither, the stop is unlocated. Pure; the ONE reading (§18 rule
 * 1) — the geocoder skips these items and the routing point resolver applies the rule.
 *
 * NEGATIVE SPACE (§18d): read from the title's words. A private tour titled without "private … tour", or an arrival
 * titled without "arrive"/"arrival", is not caught and is matched like any other item.
 */

export type MeetingOrStayKind = "private_tour" | "arrival" | "check_in";

const CHECK_IN = /\bcheck[\s-]?in\b/i;
const ARRIVAL = /\barriv(?:e|es|al|als|ing)\b/i;
const PRIVATE_TOUR = /\bprivate\b(?:\s+\S+){0,4}?\s+tours?\b/i;

/** Pure. The kind of meeting-or-stay item a title names, or null for an ordinary item. */
export function meetingOrStayItem(title: string | null | undefined): MeetingOrStayKind | null {
  const t = (title ?? "").trim();
  if (!t) return null;
  if (CHECK_IN.test(t)) return "check_in";
  if (ARRIVAL.test(t)) return "arrival";
  if (PRIVATE_TOUR.test(t)) return "private_tour";
  return null;
}
