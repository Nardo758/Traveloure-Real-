/**
 * ai-draft-eligibility.pure.ts — the DECISIONS behind "the free AI draft runs only on an empty
 * slip", with no database in them.
 *
 * CLAUDE.md Locked Decision 41 (b) / ledger `2026-09-05-draft-only-on-empty`.
 *
 * WHY THE SPLIT (the `trip-destinations.pure.ts` / `pending-events.pure.ts` precedent): the
 * predicate needs a database for exactly one thing — counting the trip's `itinerary_items` rows.
 * Everything else it decides is arithmetic and copy, and that half keeps its proof in an
 * environment with no `DATABASE_URL`. `ai-draft-eligibility.ts` is the DB half and re-exports
 * every name here, so a caller has ONE import and there is still only ONE decision (§18 rule 1).
 */

/** Stable machine-readable refusal code — the client routes on this string, never on the prose. */
export const AI_DRAFT_REFUSAL_ERROR = "slip_has_items";

/** HTTP status for the refusal — a conflict with the slip's current state, not a 400 or a 402. */
export const AI_DRAFT_REFUSAL_STATUS = 409;

/**
 * The honest sentence a refused traveler reads. Stated ONCE here so the server rails and the
 * client copy cannot disagree; it makes no claim about PRICE (the pay gate decides that — a Trip
 * Pass or the 24h free-re-run window can make Optimize cost nothing, and promising a charge here
 * would be as wrong as promising none). It also makes no claim about which model wrote anything:
 * the draft's model tier is a cost decision and is never surfaced (LD 41 (c)).
 */
export const AI_DRAFT_REFUSAL_MESSAGE =
  "This plan already has items in it, so the free AI draft won't rebuild it. " +
  "Optimize builds three proposals around what you already have.";

export type AiDraftEligibility =
  | { eligible: true; reason: "new_trip" | "empty_slip" }
  | {
      eligible: false;
      reason: typeof AI_DRAFT_REFUSAL_ERROR;
      itemCount: number;
      /** The slip the traveler should Optimize instead — the client needs it to link there. */
      tripId: string;
      optimizeHint: true;
    };

/**
 * THE DECISION, given the trip id and how many `itinerary_items` rows it holds.
 *
 * "EMPTY" COUNTS EVERY ROW, IN EVERY STATUS — DELIBERATELY. The caller's count is a bare
 * `COUNT(*)`: no status filter, no `origin` filter, no `routing_status` filter, and NOT the
 * rebuild guard's deletable predicate. The question is "does the traveler already have a plan
 * here?", not "what could a rebuild legally delete?". A `purchased` row, a `ready_for_checkout`
 * row, an expert-authored row and a plain `in_planning` AI row all make the slip non-empty — a
 * slip whose only rows are BOUGHT ones is the least appropriate place to run a free
 * wipe-and-rebuild, and answering "empty" there because the rebuild guard would spare those rows
 * would be the honest-looking wrong answer. The two predicates are about different things and
 * must not be merged.
 *
 * §13 — THE ABSENCES ARE ANSWERS. A NULL/absent `tripId` is `new_trip`: there is no slip yet, so
 * there is nothing to overwrite. A trip id whose count is zero is `empty_slip` — deliberately the
 * SAME answer as a trip that does not exist at all, because this is NOT an authorization check
 * and does not claim to be one. Every caller authorizes the trip separately (ownership / advisor
 * status) BEFORE reaching here, and this module must never be read as having done that.
 */
export function decideAiDraftEligibility(
  tripId: string | null | undefined,
  itemCount: number,
): AiDraftEligibility {
  if (!tripId) return { eligible: true, reason: "new_trip" };
  if (!Number.isFinite(itemCount) || itemCount <= 0) return { eligible: true, reason: "empty_slip" };
  return { eligible: false, reason: AI_DRAFT_REFUSAL_ERROR, itemCount, tripId, optimizeHint: true };
}

/**
 * The ONE refusal body shape. `optimize: true` is what tells the client to offer the Optimize
 * route instead of retrying; `itemCount` is a fact the traveler can check against their own slip,
 * not a number anyone derives anything from.
 */
export function aiDraftRefusalBody(
  result: Extract<AiDraftEligibility, { eligible: false }>,
): { error: string; message: string; optimize: true; itemCount: number; tripId: string } {
  return {
    error: result.reason,
    message: AI_DRAFT_REFUSAL_MESSAGE,
    optimize: true,
    itemCount: result.itemCount,
    // The slip to send the traveler to. Carried because the client cannot always know it — a
    // stored generation's trip is resolved server-side from its own row, so without this the
    // refusal could say "go and Optimize" while naming nothing to open (§13).
    tripId: result.tripId,
  };
}

/**
 * Typed error thrown by the SECOND layer (inside `saveGeneratedItinerarySnapshot`'s transaction).
 * The route layer refuses first and never reaches this; it exists so a caller that forgets — or
 * one written after this lane — ABORTS the transaction instead of deleting the traveler's rows.
 * Defence in depth: the same two-layer placement §18 requires for a privileged field.
 */
export class AiDraftSlipHasItemsError extends Error {
  readonly code = AI_DRAFT_REFUSAL_ERROR;
  readonly itemCount: number;
  readonly tripId: string;

  constructor(tripId: string, itemCount: number) {
    super(
      `[ai-draft-eligibility] refusing to rebuild trip ${tripId}: the slip already holds ${itemCount} item(s). ` +
        `The free AI draft runs only on an empty slip (CLAUDE.md Locked Decision 41 (b)).`,
    );
    this.name = "AiDraftSlipHasItemsError";
    this.tripId = tripId;
    this.itemCount = itemCount;
  }
}

/** True when `err` is the second layer's refusal — so a route can answer 409 rather than 500. */
export function isAiDraftSlipHasItemsError(err: unknown): err is AiDraftSlipHasItemsError {
  return err instanceof AiDraftSlipHasItemsError;
}

/**
 * LD 41 (c) — "THE FREE DRAFT IS A SKETCH", the READ side, given the two counts.
 *
 * True when the plan holds at least one item and EVERY item is still an untouched free-draft row
 * (`origin = 'ai'` AND `routing_status = 'in_planning'`) — the exact population the draft writes
 * and nothing else does. An item the traveler added, an expert suggested, or anyone routed to
 * checkout/purchased falls out of it immediately, so the answer stops being true the moment the
 * plan stops being only a sketch.
 *
 * DELIBERATELY NOT the same predicate as eligibility: that asks "is this slip empty?", this asks
 * "is everything on it still the sketch?" — a slip with one AI row is non-empty AND a sketch.
 *
 * §13: `false` for an EMPTY plan too, and that is correct — an empty plan is not a sketch, it is
 * a plan with nothing in it, and the reader must say nothing rather than label a blank slip as
 * AI-drafted.
 */
export function isUntouchedAiDraftFromCounts(total: number, sketch: number): boolean {
  if (!Number.isFinite(total) || !Number.isFinite(sketch)) return false;
  return total > 0 && total === sketch;
}
