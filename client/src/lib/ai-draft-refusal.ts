/**
 * ai-draft-refusal — the ONE client reader of the free-draft refusal.
 *
 * CLAUDE.md Locked Decision 41 (b) / ledger `2026-09-05-draft-only-on-empty`.
 *
 * The server refuses a free AI draft on a slip that already holds items with a 409 whose body is
 * `{ error: "slip_has_items", message, optimize: true, itemCount, tripId }`. Every draft surface
 * reads it THROUGH THIS MODULE — the sibling of `isTripEmptyRefusal` in `optimization-gate.ts`,
 * and for the same reason: a second surface re-typing the discriminator drifts the first time the
 * code string or the body shape moves (§18 rule 1).
 *
 * §13 — THE COPY IS THE SERVER'S. `message` is rendered as sent, not restated here: the sentence
 * a traveler reads about why the draft did not run must have exactly one author, and it is the
 * one that made the decision. The only thing this module adds is the LINK to the slip, built from
 * the `tripId` the refusal names.
 *
 * IT DOES NOT RE-IMPLEMENT THE GATE. "Optimize this plan instead" opens the slip, whose existing
 * Optimize button runs the ONE pay-gate implementation (`lib/optimization-gate.ts`). Nothing here
 * decides eligibility, price, or coverage — those are server decisions this module never touches.
 */

export const AI_DRAFT_REFUSAL_ERROR = "slip_has_items";

export interface AiDraftRefusal {
  /** The server's own sentence — rendered verbatim, never paraphrased client-side. */
  message: string;
  /** How many items the slip already holds. A fact the traveler can check, not a derivation input. */
  itemCount: number;
  /** The slip to open. Always present on a real refusal; see `slipHref` for the absent case. */
  tripId: string | null;
}

/**
 * True when this response is the free-draft refusal. Keyed on the STATUS AND the stable `error`
 * code — never on the prose, which is copy and may change.
 */
export function isSlipHasItemsRefusal(status: number, body: unknown): boolean {
  return (
    status === 409 &&
    typeof body === "object" &&
    body !== null &&
    (body as Record<string, unknown>).error === AI_DRAFT_REFUSAL_ERROR
  );
}

/**
 * Read the refusal into a shape a surface can render. Returns null when the response is not a
 * refusal, so a caller can keep its existing error path untouched for everything else.
 */
export function readSlipHasItemsRefusal(status: number, body: unknown): AiDraftRefusal | null {
  if (!isSlipHasItemsRefusal(status, body)) return null;
  const b = body as Record<string, unknown>;
  const rawCount = b.itemCount;
  const tripId = typeof b.tripId === "string" && b.tripId !== "" ? b.tripId : null;
  return {
    message:
      typeof b.message === "string" && b.message.trim() !== ""
        ? b.message
        // Only reached if the server ever answers the code with no sentence. Says the same thing
        // the server's own copy says, and still claims nothing about price.
        : "This plan already has items in it, so the free AI draft won't rebuild it.",
    itemCount: typeof rawCount === "number" && Number.isFinite(rawCount) ? rawCount : 0,
    tripId,
  };
}

/**
 * Where "Optimize this plan instead" goes: the slip, which owns the Optimize button. `null` when
 * the refusal named no trip — the surface then shows the message with NO link rather than a dead
 * one or a guessed destination (§13).
 */
export function slipHref(refusal: AiDraftRefusal): string | null {
  return refusal.tripId ? `/plans/${refusal.tripId}` : null;
}
