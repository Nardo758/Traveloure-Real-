import { manifestFor } from "@shared/group-manifest";

/**
 * A10 part 2 (Leon, Nov 22 2026): the "Next:" question, one at a time, in the order the board gives -
 * dates, party, stay, flight. Pure: the caller hands in the plan's facts, the module names the first question
 * the plan has not answered. Nothing is stored: "Skip" lives in the caller's own per-visit state, so a skipped
 * question returns on the next visit by design (Leon, Nov 21: no Skip memory).
 */
export type NextQuestionKey = "dates" | "party" | "stay" | "flight";

export interface NextQuestionFacts {
  /** `trips.dates_confirmed_at` - the traveler chose dates. */
  datesConfirmed: boolean;
  /** `trips.number_of_travelers`, null when unstated. */
  travelers: number | null;
  /** A lodging item is on the plan, so "where you stay" is answered. */
  stayChosen: boolean;
  /** The plan already carries a flight. */
  flightKnown: boolean;
}

/** The first unanswered question in the board's order, or null when the plan has answered all four. */
export function nextQuestion(f: NextQuestionFacts): NextQuestionKey | null {
  if (!f.datesConfirmed) return "dates";
  if (f.travelers === null || f.travelers <= 0) return "party";
  if (!f.stayChosen) return "stay";
  if (!f.flightKnown) return "flight";
  return null;
}

/**
 * The copy, verbatim, for "Strings for Leon". Only the flight sentence is drawn on a board; the other three are
 * proposed here so the flow can be built and reviewed as one piece.
 */
export const NEXT_QUESTION_COPY: Record<NextQuestionKey, { sentence: string; action: string }> = {
  dates: {
    sentence: "Next: when are you going? Add your dates and the days will follow.",
    action: "Add dates",
  },
  party: {
    sentence: "Next: who's coming? Add your party and the plan can size itself.",
    action: "Add party",
  },
  stay: {
    sentence: "Next: where are you staying? Add where you are staying and the days can start and end around it.",
    action: "Add where you stay",
  },
  flight: {
    sentence:
      "Next: how are you getting there? Add your flight and the first and last day will start and end around it.",
    action: "Add your flight",
  },
};

/** The dismissive control's one word. */
export const NEXT_QUESTION_SKIP = "Skip";

/**
 * A10 fix (Leon, Nov 22 2026): the strip's surface is a TRIP, and the app already decides what a trip is - `manifestFor`
 * maps `plain_plan`, an unknown group and null all to the Trip manifest (`shared/group-manifest.ts:242-249`). Staging
 * showed owner plans with no occasion resolving to `plain_plan`, which the strip's old `=== "trips"` check skipped while
 * the rest of the app treated those plans as trips. This reads that same mapping instead of naming groups again.
 */
export function stripGroupIsTrip(group: string | null | undefined, occasionSlug?: string | null): boolean {
  return manifestFor(group, occasionSlug).group === "trip";
}

/** The board's order, fixed: four questions, nothing else can be asked. */
export const NEXT_QUESTION_ORDER: readonly NextQuestionKey[] = ["dates", "party", "stay", "flight"];

/** Is ONE question answered by the plan's own facts? */
function answered(f: NextQuestionFacts, key: NextQuestionKey): boolean {
  if (key === "dates") return f.datesConfirmed;
  if (key === "party") return f.travelers !== null && f.travelers > 0;
  if (key === "stay") return f.stayChosen;
  return f.flightKnown;
}

/**
 * A10 fix 2 (Leon, Nov 22 2026): the skip-aware question. The caller used to mark a skip by setting a property named
 * after the question ("party": true) and ask `nextQuestion` again - a property `nextQuestion` never read, so the loop
 * could not advance and span forever. This walks the FIXED four-key order instead, so a skip always consumes one
 * question and the loop is bounded to four passes.
 */
export function nextQuestionSkipping(
  f: NextQuestionFacts,
  skipped: readonly NextQuestionKey[],
): NextQuestionKey | null {
  for (const key of NEXT_QUESTION_ORDER) {
    if (skipped.includes(key)) continue;
    if (!answered(f, key)) return key;
  }
  return null;
}
