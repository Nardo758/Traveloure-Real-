/**
 * ── D-14: `cart_items.quantity` MEANS UNITS OF THE LISTING, AND THE ARCHETYPE DECIDES WHICH
 *    QUESTION THE SURFACE ASKS ─────────────────────────────────────────────────────────────────
 *
 * Decision-maker ruling 2026-09-15, punchlist **D-14**, option A (the column stop-and-ask).
 * Ledger `2026-09-15-d14-quantity-is-units`.
 *
 * THE TWO FACTS, AND WHY THEY ARE NOT ONE NUMBER.
 *   • `cart_items.quantity` is **UNITS OF THE LISTING** — the PRICE MULTIPLIER.
 *     `resolveItemBaseAmount` (`server/routes/payments.routes.ts`) prices a non-stay line
 *     `rate × quantity`, so every increment of this number is money.
 *   • `cart_items.party_size` (migration 206, ruling 83) is **THE PARTY FACT** — the traveler's
 *     own head-count, validated by the D7 party-size gate (`resolveBookingEligibility` against
 *     `provider_services.party_size_min/max`). It is **NEVER a multiplier**: no amount, rate or
 *     fee is derived from it anywhere, and this module does not change that.
 *
 * Collapsing them is how a villa for seven gets billed seven times. So the archetype decides
 * which question the add-to-cart / cart surface asks, and what writing that answer implies:
 *
 *   ┌────────────────────────┬────────────┬────────────┬──────────────────┬──────────────────┐
 *   │ archetype (§9 matrix)  │ asksUnits  │ asksParty  │ unitsFollowParty │ quantity          │
 *   ├────────────────────────┼────────────┼────────────┼──────────────────┼──────────────────┤
 *   │ P6 stay                │ false      │ true       │ false            │ pinned to 1      │
 *   │ P7 bundle              │ false      │ true       │ false            │ pinned to 1      │
 *   │ P1 scheduled seats     │ true       │ true       │ true             │ = party_size     │
 *   │ artifact / async       │ false      │ false      │ false            │ pinned to 1      │
 *   │ (unruled — see below)  │ true       │ false      │ false            │ as sent, today's │
 *   └────────────────────────┴────────────┴────────────┴──────────────────┴──────────────────┘
 *
 * THE FIFTH ROW IS NAMED, NOT INVENTED (§13). The ruling spoke about four shapes. A LIVE REMOTE
 * session (`call` / `video`) and a row that carries no classifiable fact at all are neither a
 * stay, a bundle, a seat-shaped place service nor an artifact — so this module returns **today's
 * behaviour** for them (a free unit count, no party question) and says out loud that it is
 * unruled, rather than guessing them into one of the four. A guess here would silently change
 * what a consultation costs.
 *
 * WHICH FACTS DECIDE, AND WHY THESE. Every one is a column the listing row already carries —
 * this module introduces no field and reads no new one:
 *   • `product_shape` — `'property'` / `'property_room'` is a STAY (migration 153, §17) and
 *     `'bundle'` is a BUNDLE (migration 151); the same two values `shared/service-fundamentals.ts`
 *     classifies by, and the same two the §9 archetype fixtures set for P6 and P7.
 *   • `pricing_unit = 'per_night'` is the OTHER way a row says "stay": it is what `getRoomNights`
 *     and the whole S11 nightly-rate rail key on. Either fact alone is enough.
 *   • `delivery_method` — `in_person` / `hybrid` is place-anchored (`PLACE_ANCHORED_METHODS`),
 *     which is the seat-shaped P1 case; `pdf` / `voice_notes` / `async_messaging` is artifact or
 *     async delivery, which is bought once and has no seats and no party.
 * SHAPE BEATS METHOD, deliberately: the P6 fixture is `in_person` AND `property`, and the P7
 * fixture is `in_person` AND `bundle`. Reading the method first would turn both into seats.
 *
 * WHAT THIS MODULE IS NOT. It computes no price, no fee and no total (§14) — it answers which
 * question to ask and which of two columns the answer belongs in. Every amount stays
 * server-derived exactly where it already is, and CHECKOUT IS UNTOUCHED by this lane: a stay is
 * still billed nights × the nightly rate regardless of `quantity`, and slot capacity is still
 * claimed by `storage.bookSlot`, which increments `booked_count` by exactly ONE per slot-bound
 * line and reads neither column (recorded, not changed).
 *
 * NOT TO BE CONFUSED WITH `client/src/lib/cart-quantity.ts`, which normalises what a traveler
 * TYPES into a count box (digits, floor, the empty-draft rule). That module says how a number is
 * read; this one says which number is being asked for at all. Both are imported by `/cart`.
 */

/** Which of the ruled shapes a listing is. `unruled` is a real answer, not a fallback (§13). */
export type CartQuantityRule = "stay" | "bundle" | "seats" | "artifact" | "unruled";

/**
 * The listing facts this decision reads. Every key is an existing `provider_services` column and
 * every one is optional: a cart line that names no listing (a Discover content row, a custom
 * venue) passes `null` and gets the `unruled` answer, which is byte-for-byte today's behaviour.
 */
export interface CartQuantityListingFacts {
  productShape?: string | null;
  pricingUnit?: string | null;
  deliveryMethod?: string | null;
}

export interface CartQuantityAsks {
  rule: CartQuantityRule;
  /** Draw a UNIT count control, and let the traveler set `cart_items.quantity`. */
  asksUnits: boolean;
  /** Draw a PARTY control, and write `cart_items.party_size`. */
  asksParty: boolean;
  /** The two questions are the SAME question: `quantity` is derived from `party_size`. */
  unitsFollowParty: boolean;
  /** One sentence naming the rule — the refusal message and the surface's own note. */
  reason: string;
}

/** `product_shape` values that mean "a stay" (§17 property rung, migration 153). */
const STAY_SHAPES: ReadonlySet<string> = new Set(["property", "property_room"]);

/** `product_shape` for a bundle row whose components live in `bundle_components` (migration 151). */
const BUNDLE_SHAPE = "bundle";

/** Place-anchored delivery — the seat-shaped, scheduled P1 case. */
const SEAT_METHODS: ReadonlySet<string> = new Set(["in_person", "hybrid"]);

/** Artifact / async delivery — bought once, with no seats and no party. */
const ARTIFACT_METHODS: ReadonlySet<string> = new Set(["pdf", "voice_notes", "async_messaging"]);

const REASONS: Readonly<Record<CartQuantityRule, string>> = {
  stay: "A stay is ONE booking for the whole date range — it is priced by nights, not by units, and the number that varies is how many guests.",
  bundle: "A bundle is booked ONCE — its components carry their own counts, and the number that varies is the party size.",
  seats: "A scheduled place service is sold by the SEAT, so the seat count and the party count are the same answer.",
  artifact: "This is delivered once — it has no unit count and no party.",
  unruled: "This listing is neither a stay, a bundle, a seat-shaped place service nor an artifact, so D-14 states no rule for it and its unit count is unchanged.",
};

function norm(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

/**
 * THE ONE DERIVATION. Which question the archetype asks, and what writing the answer implies.
 *
 * Order is load-bearing: shape before method (see the header's "SHAPE BEATS METHOD").
 */
export function archetypeAsks(
  facts: CartQuantityListingFacts | null | undefined,
): CartQuantityAsks {
  const shape = norm(facts?.productShape);
  const pricingUnit = norm(facts?.pricingUnit);
  const method = norm(facts?.deliveryMethod);

  if (STAY_SHAPES.has(shape) || pricingUnit === "per_night") {
    return { rule: "stay", asksUnits: false, asksParty: true, unitsFollowParty: false, reason: REASONS.stay };
  }
  if (shape === BUNDLE_SHAPE) {
    return { rule: "bundle", asksUnits: false, asksParty: true, unitsFollowParty: false, reason: REASONS.bundle };
  }
  if (ARTIFACT_METHODS.has(method)) {
    return { rule: "artifact", asksUnits: false, asksParty: false, unitsFollowParty: false, reason: REASONS.artifact };
  }
  if (SEAT_METHODS.has(method)) {
    return { rule: "seats", asksUnits: true, asksParty: true, unitsFollowParty: true, reason: REASONS.seats };
  }
  return { rule: "unruled", asksUnits: true, asksParty: false, unitsFollowParty: false, reason: REASONS.unruled };
}

/**
 * The honest unit noun a surface prints where it draws no unit control. It sits here, beside the
 * rule that produces it, on the `impactClassLabel` precedent — a second copy in a page would drift
 * the day a rule moves (§18 rule 1). `null` = the surface draws a control instead and needs none.
 */
export function cartUnitLabel(rule: CartQuantityRule): string | null {
  switch (rule) {
    case "stay":
      return "1 room";
    case "bundle":
      return "1 bundle";
    case "artifact":
      return "1";
    default:
      return null;
  }
}

/** The count a units-pinned archetype always has. Never 0 — removing a line is `Remove`. */
export const PINNED_UNIT_QUANTITY = 1;

export type CartLineCountsInput = {
  /** What the caller asked for, if anything. `undefined` = the key was absent. */
  quantity?: number | null;
  /** `undefined` = absent (do not touch); `null` = an explicit clear (§13, ruling 83). */
  partySize?: number | null;
};

export type CartLineCountsResult =
  | {
      ok: true;
      rule: CartQuantityRule;
      /** `undefined` = leave the stored quantity exactly as it is. */
      quantity: number | undefined;
      /** Echoed unchanged — this module never invents or clears a party answer. */
      partySize: number | null | undefined;
      /** True when `quantity` above was DERIVED from the party answer, not taken from the body. */
      unitsDerivedFromParty: boolean;
    }
  | {
      ok: false;
      rule: CartQuantityRule;
      reason: "units_not_asked";
      message: string;
    };

/**
 * THE ADMISSION. One decision, called by every cart write rail (`POST /api/cart`,
 * `POST /api/cart/items`, `PATCH /api/cart/:id`) so the three cannot disagree (§18 rule 1).
 *
 * **A UNIT COUNT ABOVE ONE ON AN ARCHETYPE THAT ASKS NO UNITS IS REFUSED, NOT CLAMPED (§13).**
 * Silently reducing 3 → 1 changes what the traveler is charged without telling them, which is the
 * exact failure D-16(a) refused to commit on the plan side. The refusal names the rule.
 *
 * **WHERE UNITS FOLLOW THE PARTY, `quantity` IS SERVER-DERIVED** (the §14 posture applied to the
 * multiplier): a stated `party_size` produces `quantity = party_size` and a body-supplied
 * `quantity` is not consulted. Nothing is hidden by that — the surface draws ONE control (seats),
 * and the row comes back carrying the derived count.
 *
 * **CLEARING THE SEAT COUNT RETURNS THE LINE TO ONE UNIT.** `party_size = null` is "the traveler
 * never told us" (ruling 83), and a line whose seat count is withdrawn may not keep billing for
 * seats nobody claimed.
 *
 * **THE PARTY ANSWER ITSELF IS NEVER REFUSED HERE**, on any archetype. It is not a multiplier, and
 * ruling 83 landed it as an eligibility input on every line through `PATCH /api/cart/:id`; taking
 * that away would remove a working D7 gate input to make a symmetry this ruling did not ask for.
 * Stated so the asymmetry is a decision and not an oversight (§18d).
 */
export function resolveCartLineCounts(
  facts: CartQuantityListingFacts | null | undefined,
  input: CartLineCountsInput,
): CartLineCountsResult {
  const asks = archetypeAsks(facts);
  const requested = typeof input.quantity === "number" && Number.isFinite(input.quantity)
    ? Math.floor(input.quantity)
    : undefined;

  if (!asks.asksUnits && requested !== undefined && requested > PINNED_UNIT_QUANTITY) {
    return {
      ok: false,
      rule: asks.rule,
      reason: "units_not_asked",
      message: `${asks.reason} Adding more than one unit of it is refused rather than silently reduced.`,
    };
  }

  if (asks.unitsFollowParty && input.partySize !== undefined) {
    if (input.partySize === null) {
      return {
        ok: true,
        rule: asks.rule,
        quantity: PINNED_UNIT_QUANTITY,
        partySize: null,
        unitsDerivedFromParty: true,
      };
    }
    if (Number.isInteger(input.partySize) && input.partySize >= 1) {
      return {
        ok: true,
        rule: asks.rule,
        quantity: input.partySize,
        partySize: input.partySize,
        unitsDerivedFromParty: true,
      };
    }
  }

  return {
    ok: true,
    rule: asks.rule,
    quantity: requested,
    partySize: input.partySize,
    unitsDerivedFromParty: false,
  };
}
