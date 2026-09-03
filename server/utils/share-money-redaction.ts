/**
 * PUBLIC-SHARE MONEY REDACTION — ledger `2026-09-03-share-link-price-redaction`.
 *
 * `GET /api/itinerary-share/:token` is PUBLIC: any token holder reaches it, including an
 * anonymous "view"-only link forwarded to a friend. It already redacted the expert's private
 * review commentary on an owner/non-owner axis, but it sent every MONEY figure — per-activity
 * `cost`, per-leg `estimatedCostUsd`, the plan-level `totalCost` and the transport
 * `totalCostUsd` — to every holder. What a traveler paid (or budgeted) for their trip is
 * theirs; a share link is an itinerary, not an invoice.
 *
 * TWO PROPERTIES THIS MODULE EXISTS TO GUARANTEE:
 *
 *  1. ONE redaction, applied ONCE (§18 rule 1). The caller builds the FULL response object and
 *     hands it to `redactMoneyForNonOwner` in a single place. Restating "which fields are money"
 *     at each of the four emit sites is the derivation-drift class — the fifth money field added
 *     to this response would be added at a site nobody remembered to gate.
 *
 *  2. STRIP BY DEFAULT, NAME THE EXCEPTIONS (§19's allowlist posture, inverted for output). The
 *     predicate is a PATTERN over key names, not a list of the four keys that leak today, so a
 *     money field added to this payload tomorrow is redacted the day it is added rather than the
 *     day someone notices. A key that matches the pattern but is NOT money must be named in
 *     `NON_MONEY_KEYS` deliberately — the same "someone has to name it" property the pick-based
 *     body schemas give the write side.
 *
 * ABSENT, NOT ZEROED (§13). A redacted key is DELETED. Emitting `cost: 0` would be the platform
 * stating a price of zero — a claim it has no basis for. A price-free plan is honest; a plan
 * priced at nothing is a lie. Clients must render the absence, not fill it (see
 * `client/src/pages/itinerary-view.tsx`, which hides its cost stats when nothing resolves).
 */

/**
 * A key naming money. Deliberately broad: cost / price / total / budget / fee / amount /
 * payment / charge / refund / savings / earning / payout / deposit / balance. Substring match,
 * case-insensitive, so `estimatedCostUsd`, `totalCostUsd`, `perPersonCost` and a future
 * `platformFee` are all covered without an edit here.
 */
export const MONEY_KEY_PATTERN =
  /(cost|price|total|budget|fee|amount|payment|charge|refund|savings|earning|payout|deposit|balance)/i;

/**
 * Keys that MATCH `MONEY_KEY_PATTERN` but carry no money. Each entry is a deliberate exception
 * with a stated reason — the list is short on purpose; a long one means the pattern is wrong.
 *
 *  • `energyCost`     — `transport_legs.energy_cost`, a 0-100 fatigue score (shared/schema.ts).
 *  • `totalLegs`      — a COUNT of transport legs.
 *  • `totalMinutes`   — a DURATION in minutes.
 *  • `totalDays`      — a COUNT of days.
 */
export const NON_MONEY_KEYS: ReadonlySet<string> = new Set([
  "energyCost",
  "totalLegs",
  "totalMinutes",
  "totalDays",
]);

/** True when a response key names money and must not reach a non-owner. */
export function isMoneyKey(key: string): boolean {
  if (NON_MONEY_KEYS.has(key)) return false;
  return MONEY_KEY_PATTERN.test(key);
}

/**
 * Return a deep copy of `payload` with every money-named key REMOVED at every depth (objects and
 * arrays alike — a per-activity `cost` and an `amount` nested inside a booking are the same
 * class of leak). The input is never mutated; non-plain values (Date, null, primitives) pass
 * through by reference.
 */
export function redactMoneyForNonOwner<T>(payload: T): T {
  return strip(payload) as T;
}

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value === null || typeof value !== "object") return value;
  // Only PLAIN objects are walked. A Date (or any class instance) is a leaf here — walking it
  // would rebuild it as a bare object and silently change the response shape.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (isMoneyKey(key)) continue;
    out[key] = strip(v);
  }
  return out;
}
