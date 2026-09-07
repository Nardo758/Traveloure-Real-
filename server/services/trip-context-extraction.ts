/**
 * trip-context-extraction — the AI planner's date ANCHOR, and the past dates it refuses to keep.
 *
 * Lane L21, ledger `2026-09-07-extraction-date-anchor`; Console & AI Concierge brief §11.2
 * finding F5; CLAUDE.md §13, §18 rule 1, Locked Decision 42 **D12** (no mint may invent a date).
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────────────────────────
 * `POST /api/trip-context/extract` asks a model to read a chat transcript and return the calendar
 * dates the traveler stated. Its prompt carried NO reference point for "now", so a traveler who
 * wrote "March 10–14" — the overwhelmingly common way a person says a date out loud — got a year
 * the model picked out of nothing. It picked the one nearest its own training horizon, `2025`, and
 * the panel then wrote a plan tagged as being in the PAST: dated, real-looking, and wrong.
 *
 * Two things were wrong and both are fixed here, in that order:
 *
 * **(a) THE PROMPT NOW CARRIES THE ANCHOR.** "Today is <date>" is a FACT the server holds and the
 * model does not, so it is stated rather than left to be guessed. A bare month-and-day is then
 * resolvable the way a person resolves it — the next occurrence — instead of being a coin toss.
 *
 * **(b) A DATE THAT STILL RESOLVES TO THE PAST IS ASKED ABOUT, NEVER KEPT (§13).** An anchor makes
 * the guess better; it does not make it TRUE. A transcript can name a genuinely past date, a model
 * can still return one, and "we improved the prompt" is not a reason to trust the output. So a
 * returned date earlier than the anchor day is WITHHELD from the fields and reported separately as
 * something the traveler must confirm. It is deliberately NOT repaired — bumping "2025-03-10" to
 * "2026-03-10" would be this module inventing the year the model was already inventing, one layer
 * further from anyone who could notice. An absent date is how the plan modal is told "not known",
 * and its When step then ASKS; a silently corrected one is how a wrong year becomes the
 * traveler's own stated answer.
 *
 * ── NEGATIVE SPACE (§18d, the guard-registry habit applied to a service module) ────────────────
 *  · Nothing here PARSES natural language. It reads the `YYYY-MM-DD` strings the extraction schema
 *    has already validated, and compares them as calendar days. A second date parser beside the
 *    model's is exactly the drift §18 rule 1 names.
 *  · Nothing here REPAIRS, defaults, rounds or shifts a date. Withheld means withheld.
 *  · Nothing here fetches, writes, or authorizes anything, and it takes `today` as an argument
 *    rather than reading the clock — so the whole rule is provable in CI with no model call and no
 *    date-dependent flakiness.
 *  · The comparison is CALENDAR-DAY, on the server's own day. A plan has no timezone yet at this
 *    point in the flow (Locked Decision 30 stamps `trips.timezone` at MINT, and this runs before
 *    any mint), so no zone is claimed. The consequence is stated rather than hidden: within a day
 *    of the boundary a traveler west of the server could have today's date withheld as "past".
 *    Being ASKED about a date one day early is the harmless failure; keeping a wrong year is not.
 */

/** The exact `YYYY-MM-DD` shape the extraction schema already guarantees. */
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The anchor day as `YYYY-MM-DD`, in the server's own local calendar. */
export function extractionDateAnchor(today: Date): string {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * THE ONE EXTRACTION PROMPT, with today's date stated in it.
 *
 * It was a module-level constant; it is a function now for exactly one reason — the anchor is not
 * a constant. Everything else in it is verbatim what it was, including the conservatism rules that
 * are the §13 half of this endpoint, so this lane changed what the model KNOWS and not what it is
 * asked to do.
 *
 * @param eventTypes the `eventTypeEnum` members, passed in so this module states no vocabulary of
 *                   its own (§18 rule 1 — `shared/schema.ts` is the authority on that list).
 */
export function buildExtractionSystemPrompt(today: Date, eventTypes: readonly string[]): string {
  const anchor = extractionDateAnchor(today);
  return `You extract trip-planning facts from a travel-planning chat transcript. You are strictly conservative.

Today's date is ${anchor}. Use it as the reference point for any date the traveler states; a bare month and day means the NEXT occurrence of that month and day on or after today.

Rules:
- Extract a field ONLY if the traveler (the "user" role) explicitly stated it in their own words.
- NEVER guess, infer, assume, or fill in a typical/default value. An assistant suggestion the user has not agreed to is NOT established.
- If a field was not clearly and explicitly stated by the user, its value MUST be null.
- "eventType" must be null unless one of these exact values clearly applies: ${eventTypes.join(", ")}.
- "startDate"/"endDate" must be null unless the user gave (or clearly confirmed) an actual calendar date; convert to YYYY-MM-DD. Do not compute a date from a vague phrase like "next month" or "in the summer".
- Never return a date before ${anchor}. If the traveler named a date that has already passed, return null for it rather than moving it to a different year.
- "travelers" must be null unless the user stated a specific headcount.

Respond with ONLY a JSON object, no other text, in this exact shape:
{"destination": string|null, "startDate": string|null, "endDate": string|null, "travelers": number|null, "eventType": string|null}`;
}

/** One withheld date and why, so the surface can ASK rather than silently show nothing. */
export interface WithheldDate {
  /** `startDate` or `endDate` — the field the traveler must confirm. */
  field: string;
  /** The value the model returned, reported back verbatim and never used. */
  value: string;
  /** Machine reason. One value today; a discriminant so a later one is additive. */
  reason: "in_the_past";
}

export interface PastDateFilterResult<T> {
  /** The fields with any past-resolving date REMOVED. Never repaired, never shifted. */
  fields: T;
  /** What was taken out, and why. Empty when nothing was. */
  withheld: WithheldDate[];
}

/**
 * Withhold any `startDate`/`endDate` that resolves BEFORE the anchor day.
 *
 * Pure, total, and order-preserving. A value that is absent, null, or not the `YYYY-MM-DD` shape
 * is passed through untouched — this function's job is one comparison, and silently dropping a
 * malformed value would hide a different problem behind this one. A date ON the anchor day is
 * kept: today is not the past.
 */
export function withholdPastDates<T extends Record<string, unknown>>(
  fields: T,
  today: Date,
): PastDateFilterResult<T> {
  const anchor = extractionDateAnchor(today);
  const out: Record<string, unknown> = { ...fields };
  const withheld: WithheldDate[] = [];
  for (const field of ["startDate", "endDate"] as const) {
    const value = out[field];
    if (typeof value !== "string" || !ISO_DAY.test(value)) continue;
    // Lexicographic comparison IS calendar comparison for zero-padded ISO days — no Date object,
    // so no timezone re-interpretation of a string that carries no zone.
    if (value >= anchor) continue;
    withheld.push({ field, value, reason: "in_the_past" });
    delete out[field];
  }
  return { fields: out as T, withheld };
}
