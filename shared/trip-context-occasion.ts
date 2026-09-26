/**
 * A PLAN'S OCCASION IN ITS PEN IS WRITTEN ONLY BY AN OCCASION EDIT (ledger
 * `2026-09-26-occasion-read-only`; audit `docs/planning/trip-slip-ui-audit.md` G4/G5).
 *
 * The pen (`trip_contexts.context`) carries three occasion keys. Once a pen row is SCOPED to a plan
 * (`trip_id` set), those keys are that plan's occasion record — the plan modal seeds from them and
 * its Save writes them onto the trip row. The audit caught two READ surfaces rewriting them:
 * opening a slip pushed the previous plan's `eventType` into the opened plan's row (a wedding plan
 * stored "vacation"), and visiting `/experiences/wedding` pushed "wedding" into whichever plan was
 * active. Neither surface asked the traveler anything.
 *
 * The rule: a trip-scoped write that is not an EXPLICIT occasion edit keeps the row's stored
 * occasion keys exactly as they were — and on a first write, stores none (a plan whose occasion
 * was never recorded does not acquire another plan's by accident, §13). The explicit edit is the
 * plan modal's commit, which flags its push. The legacy pre-trip row (`trip_id IS NULL`) is a draft
 * with no plan behind it and is untouched by this rule.
 *
 * ONE list, read by the server route and its test (§18 rule 1).
 */
export const PEN_OCCASION_KEYS = ["experienceSlug", "experienceType", "eventType"] as const;

export type PenOccasionKey = (typeof PEN_OCCASION_KEYS)[number];

/** The blob without its occasion keys — what a non-edit write is allowed to contribute. */
export function withoutPenOccasion<T extends Record<string, unknown>>(context: T): Omit<T, PenOccasionKey> {
  const next: Record<string, unknown> = { ...context };
  for (const key of PEN_OCCASION_KEYS) delete next[key];
  return next as Omit<T, PenOccasionKey>;
}

