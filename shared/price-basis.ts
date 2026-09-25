/**
 * ── PRICE BASIS: IS A LISTING'S PRICE FOR THE WHOLE BOOKING, OR FOR EACH PERSON? ──────────────
 *
 * Locked Decision 56 (decision-maker, Sep 25, 2026: "go with all your recommendations"); ledger
 * `2026-09-25-price-basis`; migration 325 (`provider_services.price_basis`).
 *
 * THE DEFECT THIS CLOSES. D-14 (`shared/cart-quantity.ts`) gave EVERY `in_person` / `hybrid`
 * listing the "seats" rule — the cart line's unit count IS the party size — and checkout charges
 * `rate × units`. So a fixed-price photographer, florist, venue or private chef booked for a party
 * of four was charged four times. Nothing on the listing said whether its price was per person or
 * per booking; the archetype guessed "per person" for all of them.
 *
 * THE VALUE SET, STATED ONCE (§18 rule 1). `provider_services.price_basis` is additive nullable
 * varchar with NO DEFAULT, NO DB CHECK (the publish-trap posture) and NO BACKFILL; the set is
 * app-enforced HERE and nowhere else:
 *   • `per_person`  — the price is per head. The seat rule applies: the cart line's unit count
 *                     follows the party answer and the charge multiplies by it (D-14's P1 row).
 *   • `per_booking` — the price is for the whole booking. One unit, whatever the party.
 *   • NULL          — never stated. If the listing's pricing model is already `price_type =
 *                     'per_person'`, it has said per person that way and reads so. Otherwise it
 *                     reads as PER BOOKING, the ruled default: a listing's stated
 *                     price is what the provider asked for the booking, and multiplying it by a
 *                     head-count nobody said it scaled with is the invented number (§13). The
 *                     party size is STILL asked and recorded (capacity, eligibility — ruling 83);
 *                     it just never multiplies the price.
 *
 * WHERE IT MATTERS. Only a place-anchored listing (`in_person` / `hybrid`) is ever sold by the
 * seat, so only those listings are asked the question (`PRICE_BASIS_METHODS`). The column may be
 * stored on any listing and is inert elsewhere: a stay stays nights × rate, a per-day listing stays
 * per day (LD 54 c), a bundle stays one bundle, an artifact stays one delivery — the archetype
 * checks those shapes FIRST, exactly as before.
 *
 * OUT OF SCOPE, named: `price_type = 'hourly'` has no hours input on the cart line; under this rule
 * an hourly in-person listing bills ONE unit of its rate per booking (per_booking / NULL) or one per
 * seat (per_person) — exactly the numbers the seat or booking rule produces, never hours × rate.
 * That is a separate decision.
 */

export const PRICE_BASIS_VALUES = ["per_person", "per_booking"] as const;
export type PriceBasis = (typeof PRICE_BASIS_VALUES)[number];

/** The default a NULL (never-stated) basis is READ as. Never written to a row (no backfill). */
export const DEFAULT_PRICE_BASIS: PriceBasis = "per_booking";

/** Delivery methods whose listings are asked the per-person / per-booking question. */
export const PRICE_BASIS_METHODS: ReadonlySet<string> = new Set(["in_person", "hybrid"]);

export function isPriceBasis(value: unknown): value is PriceBasis {
  return typeof value === "string" && (PRICE_BASIS_VALUES as readonly string[]).includes(value);
}

/** Does a listing with this delivery method ask the price-basis question at all? */
export function asksPriceBasis(deliveryMethod: string | null | undefined): boolean {
  return typeof deliveryMethod === "string" && PRICE_BASIS_METHODS.has(deliveryMethod.trim().toLowerCase());
}

/**
 * THE ONE READING of a listing's basis. In order:
 *   1. an explicit `price_basis` answers — `per_person` multiplies, `per_booking` does not;
 *   2. otherwise a listing whose PRICING MODEL is already `price_type = 'per_person'` ("per person"
 *      in the listing form's price-type select) has ALREADY SAID its price is per head, and every
 *      traveler surface already prints "/person" for it (`client/src/lib/price-unit.ts`) — so it
 *      reads per person, never as a booking price the provider did not state (§13);
 *   3. otherwise (NULL, absent, or a value outside the set) the ruled default, PER BOOKING.
 * There is no third answer.
 */
export function effectivePriceBasis(
  priceBasis: string | null | undefined,
  priceType?: string | null,
): PriceBasis {
  const basis = typeof priceBasis === "string" ? priceBasis.trim().toLowerCase() : "";
  if (basis === "per_person") return "per_person";
  if (basis === "per_booking") return "per_booking";
  if (typeof priceType === "string" && priceType.trim().toLowerCase() === "per_person") return "per_person";
  return DEFAULT_PRICE_BASIS;
}

/**
 * The suffix a traveler surface prints after a price, or `null` for none. Only a per-person price
 * on a listing that asks the question says anything: a per-booking price is the ordinary reading
 * of a price and carries no extra words (the decision-maker's "nothing extra otherwise").
 */
export function priceBasisSuffix(
  facts: { priceBasis?: string | null; priceType?: string | null; deliveryMethod?: string | null } | null | undefined,
): string | null {
  if (!facts || !asksPriceBasis(facts.deliveryMethod)) return null;
  return effectivePriceBasis(facts.priceBasis, facts.priceType) === "per_person" ? "per person" : null;
}
