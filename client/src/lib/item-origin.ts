/**
 * The item ORIGIN chip — `itinerary_items.origin` said in the traveler's words.
 *
 * Ledger `2026-09-06-item-origin-chip`; CLAUDE.md Locked Decision 12 (migration 181) and Locked
 * Decision 42's addendum. The ratified `slip-canvas` `ItemRow` artboard, callout ②, draws one chip
 * per item row and names EXACTLY THREE values and no more:
 *
 *   `traveler` → "you added"
 *   `ai`       → "AI draft"
 *   `expert`   → "from your expert"
 *
 * THIS FILE IS THE ONE MAPPING (§18 rule 1). Every surface that draws the chip calls
 * `itemOriginChip` and renders what it returns; a second table of these three labels — a switch in
 * a component, a copy on another surface — is the derivation-drift class, and it is how the slip
 * and the Trip Card would start naming the same provenance two different ways.
 *
 * §13 — AN ABSENT ORIGIN IS AN ANSWER, AND THE ANSWER IS SILENCE. The column is nullable and
 * carries NO DB CHECK (the publish-trap posture), so a row can honestly hold `null` — every item
 * that predates migration 181, and any write path the D2 lane deliberately left unstamped — and
 * the DB can hold a value outside the three. Both cases return `null` here and the caller draws NO
 * CHIP. They are never rendered as "you added": who added an item is a fact only the write that
 * created it knows, and guessing the traveler is exactly the fabricated-claim class. There is no
 * "unknown" chip either — a chip that says nothing is noise on every legacy row.
 *
 * THE VALUE SET IS THE SERVER'S, NOT THIS FILE'S. `origin` is stamped server-side at CREATE from
 * the actor's role and is client-settable NOWHERE (`insertItineraryItemSchema` omits it; the PATCH
 * rail strips it). This module only READS it, and treats anything it does not recognise as absent
 * rather than asserting the set is closed.
 */

/** The three ratified chip labels. Written here and nowhere else. */
export type ItemOriginLabel = "you added" | "AI draft" | "from your expert";

/**
 * How the chip is tinted. `expert` alone carries the surface's existing teal expert accent (the
 * same tone the per-item expert note and the "With your expert" routing pill already wear, so an
 * expert's mark on a plan reads as one colour everywhere); the traveler's own additions and the
 * AI's draft are neutral. Returned as a NAME, never a colour: the hex values live in the slip's
 * token layer, and a component picks the tint from this.
 */
export type ItemOriginTone = "expert" | "neutral";

export interface ItemOriginChip {
  label: ItemOriginLabel;
  tone: ItemOriginTone;
}

/**
 * A `Map`, deliberately, and NOT an object literal keyed by the origin string. The lookup key is a
 * raw column value from the database, so a row holding `"constructor"` or `"__proto__"` would walk
 * an object literal's PROTOTYPE and return a function where a chip was expected — an unrecognised
 * origin rendering as something. A `Map` has no prototype chain to walk, so "not one of the three"
 * is answered the same way for every input.
 */
const ORIGIN_CHIPS = new Map<string, ItemOriginChip>([
  ["traveler", { label: "you added", tone: "neutral" }],
  ["ai", { label: "AI draft", tone: "neutral" }],
  ["expert", { label: "from your expert", tone: "expert" }],
]);

/**
 * The chip for one item's `origin`, or `null` when there is nothing true to draw.
 *
 * Deliberately takes `string | null | undefined` rather than a union: the DTO passes the column
 * through raw (no DB CHECK stands behind it), so narrowing happens HERE, once, instead of at every
 * call site.
 */
export function itemOriginChip(origin: string | null | undefined): ItemOriginChip | null {
  if (!origin) return null;
  return ORIGIN_CHIPS.get(origin) ?? null;
}
