/**
 * ── A CART LINE'S QUANTITY CAN BE TYPED, NOT ONLY STEPPED ───────────────────────────────────
 * Ledger `2026-09-05-dead-surfaces-and-cart-qty`.
 *
 * THE DEFECT. `/cart`'s quantity control was a − / + pair around a read-only `<span>`, so the
 * only way to say "eight" was seven clicks on `+`, each one a `PATCH /api/cart/:id` round-trip.
 * The fix is the same shape the plan modal's step-4 party stepper took (`parsePartyCountInput`,
 * `client/src/lib/plan-vocabulary.ts`): a real text input in the middle of the pair, writing
 * through the SAME mutation the buttons already write through — ONE state, TWO controls
 * (§18 rule 1) — with the normalisation stated exactly ONCE, here.
 *
 * WHY THIS IS NOT `parsePartyCountInput`. That normaliser's whole point is that EMPTY IS A REAL
 * ANSWER: an untouched party field is NULL, "never 2" (Locked Decision 33), so it returns `""`
 * and the caller stores nothing. A cart line is the opposite — the row exists, `quantity` is
 * `integer NOT NULL`-shaped in practice (defaulted `1`), and there is no such thing as a line in
 * a cart with no quantity. So an empty box here is a DRAFT, not an answer: it is allowed while
 * the traveler is mid-edit and, on commit, it reverts to the quantity the line already has
 * rather than being written as a 0 or a 1 nobody asked for (§13 — a value nobody stated is not
 * invented, and it is also not silently changed).
 *
 * THE INVARIANTS, all of them the buttons' own:
 *
 *  - **MINIMUM 1.** `MIN_CART_QUANTITY` is the floor `−` already enforced as a literal
 *    (`Math.max(1, q - 1)`, with the button disabled at 1). Removing a line is the `Remove`
 *    action, never a quantity of zero.
 *  - **THE CEILING IS THE STORAGE CEILING, NOT AN INVENTED PRODUCT RULE.** `+` never had a
 *    product cap and this lane does not add one — inventing "max 10" here would be a limit the
 *    buttons do not share and a claim nobody ratified. What it cannot exceed is
 *    `cart_items.quantity`, a Postgres `integer`; a typed 20-digit number would 500 the PATCH,
 *    a failure the buttons cannot reach. So both controls clamp to that column's own maximum.
 *  - **DIGITS ONLY.** Everything else is dropped rather than rejected, so a paste of "3 tickets"
 *    yields 3 instead of clearing the field the traveler was filling.
 *  - **NO FEE, PRICE OR TOTAL IS COMPUTED HERE (§14).** This module maps a string to a count.
 *    The line total, the surcharge and every fee stay server-derived exactly as they were.
 */

/** The floor the `−` button already enforced. */
export const MIN_CART_QUANTITY = 1;

/**
 * The ceiling of `cart_items.quantity` (Postgres `integer`). This is a STORAGE bound, not a
 * product bound: it exists so a typed value cannot reach a state the column cannot hold.
 */
export const MAX_CART_QUANTITY = 2147483647;

/** The digit width of `MAX_CART_QUANTITY` — the input's `maxLength`, so the two cannot drift. */
export const MAX_CART_QUANTITY_DIGITS = String(MAX_CART_QUANTITY).length;

/**
 * Clamp a quantity to the range BOTH controls share.
 *
 * @param n any number a control produced (a stepped value, or a parsed typed value).
 * @returns an integer in `[MIN_CART_QUANTITY, MAX_CART_QUANTITY]`; a non-finite input is the
 *          minimum, because there is no honest way to read one as a count.
 */
export function clampCartQuantity(n: number): number {
  if (!Number.isFinite(n)) return MIN_CART_QUANTITY;
  const i = Math.floor(n);
  if (i < MIN_CART_QUANTITY) return MIN_CART_QUANTITY;
  if (i > MAX_CART_QUANTITY) return MAX_CART_QUANTITY;
  return i;
}

/**
 * Normalise what the traveler typed into the quantity box, for DISPLAY while editing.
 *
 * Digits only, and the empty string is preserved as the DRAFT state (see the note above) — it is
 * never coerced to a number here, because "the box is momentarily empty" and "the traveler wants
 * one" are different facts.
 *
 * @param raw the raw input value as typed or pasted.
 * @returns `""` when the field holds no digits, otherwise the digits clamped to the shared range.
 */
export function parseCartQuantityInput(raw: string | null | undefined): string {
  const digits = String(raw ?? "").replace(/[^0-9]/g, "");
  if (digits === "") return "";
  return String(clampCartQuantity(Number(digits)));
}

/**
 * Resolve a draft box into the quantity to COMMIT.
 *
 * @param draft what is currently in the box.
 * @param current the quantity the line already has.
 * @returns the clamped typed value, or `current` when the box states nothing — an empty or
 *          zero-only box reverts, it never writes.
 */
export function commitCartQuantity(draft: string, current: number): number {
  const digits = String(draft ?? "").replace(/[^0-9]/g, "");
  if (digits === "") return clampCartQuantity(current);
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return clampCartQuantity(current);
  return clampCartQuantity(n);
}
