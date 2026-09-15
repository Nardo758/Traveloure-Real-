/**
 * THE ITEM KIND CONTRACT — what a plan item IS, commercially, derived from the row's own facts.
 *
 * Decision-maker ruling 2026-09-15, punchlist **D-4**, option A ("column stop-and-ask");
 * ledger `2026-09-15-d4-item-kind-contract`. CLAUDE.md §13, §16, §18 rule 1, §19,
 * Locked Decision 39 (every add surface is a view of `itinerary_items`; the cart is its
 * `ready_for_checkout` PROJECTION), Locked Decision 42 D23 (the origin chip's shape, which this
 * follows), Locked Decision 44 (an `affiliate_booking_requests.status` and an
 * `itinerary_items.routingStatus` are never merged — and neither is merged into this).
 *
 * D-4 asked: must a bookable itinerary item reference a real `provider_services` row? The answer
 * is YES, and the consequence is that every plan item carries exactly one of FOUR kinds:
 *
 *   `included`             part of what was already bought — nothing further to pay here.
 *   `bookable_separately`  a real platform listing, bought at its OWN listing price via the cart.
 *   `external`             partner-fulfilled — arranged through the §16 booking-agent rail, and
 *                          never charged on a platform PaymentIntent.
 *   `recommended`          a reference. No booking, and no price the platform can charge.
 *
 * THE KIND IS A DERIVATION AND IS NEVER STORED. No column, no migration, no backfill. That is the
 * whole point: checkout's subtotal loop and its booking-creation loop both `if (!item.service)
 * continue;` (server/routes/payments.routes.ts:425, :1168, :1381, :1420, :1447, :1470, :1539,
 * :2276), so a stored label would be free to disagree with what checkout actually does the moment
 * either moved. Reading the same three columns checkout reads is what makes the label true.
 *
 * ── THE FOUR RULES, AND THE FIELD EACH ONE READS ──────────────────────────────────────────────
 *
 * 1. `bookingId` present ⇒ `included`.
 *    `itinerary_items.booking_id` (migration 159) is stamped by the checkout confirm path
 *    ATOMICALLY with `routing_status → 'purchased'` and cleared by the refund path. PRESENCE of a
 *    real booking is the booked state — ROUTING_STATE_CONTRACT §2, "never inferred from
 *    routing_status alone" — which is why this rule reads the booking key and NOT
 *    `routingStatus === 'purchased'`. A row can hold the status with no booking behind it (the
 *    §15b unauthorized-claim window); it cannot hold a booking that was never paid for.
 *    This rule wins over every rule below: a booked item is bought, whatever else it names.
 *
 * 2. else `providerServiceId` present ⇒ `bookable_separately`.
 *    The FK → `provider_services` is the one link checkout can price and charge. It is checked
 *    BEFORE rule 3 deliberately: a platform listing is the stronger, checkout-capable fact, and a
 *    row that somehow named both would be bookable here rather than handed to a partner.
 *
 * 3. else `affiliateProductId` present ⇒ `external`.
 *    The FK → `affiliate_products` (migration 256) is the item's partner grounding. It is
 *    server-stamped by the build-time resolver and client-settable nowhere
 *    (`insertItineraryItemSchema` omits it, §19), so its presence is the platform's OWN statement
 *    that this item is fulfilled off-platform.
 *
 *    WHAT THIS RULE DELIBERATELY DOES NOT CLAIM (§13): it does not claim the booking agent can
 *    take this one today. The agent CTA is resolved separately at plancard-assembly time and only
 *    for a product whose `bookingType === 'affiliate_bookable'` (server/services/trip-plan.service.ts)
 *    — so `external` here means "fulfilled by a partner, not by us", never "our agent will book
 *    it". The label and blurb below are worded to that limit.
 *
 * 4. else ⇒ `recommended`.
 *    No booking, no listing, no partner product: a reference. `dmoExtractedPlaceId` grounding
 *    lands here ON PURPOSE — that column's own contract is "informational: a real pin + official
 *    link, NOT platform-bookable" (shared/schema.ts), which is precisely `recommended`.
 *
 * ── WAS `recommended` vs `external` DERIVABLE? YES — AND THAT IS WHY THIS FILE FILED NO COLUMN ──
 * The lane brief required a STOP-AND-ASK (punchlist row D-23, an `author_intent` column) if the
 * two could not be told apart from fields that already exist. They can: `affiliateProductId` is a
 * real, server-stamped column and it is the platform's only record that an item is partner-
 * fulfilled. So no column was proposed, no migration was written, and D-23 was not filed.
 * The residual honesty limit is stated in rule 3 and is a limit on the CLAIM, not on the split.
 *
 * ── WHAT THIS IS NOT (Locked Decision 44, stated because the words are close) ──────────────────
 * This is NOT `itinerary_items.routingStatus` (in_planning | with_expert | ready_for_checkout |
 * purchased), which says WHERE THE TRAVELER HAS PUSHED the item. It is NOT
 * `affiliate_booking_requests.status`, which describes a PARTNER purchase's own progress. The
 * three are never merged, never mirrored and never derived from each other. The kind says HOW an
 * item can be obtained; the routing status says what the traveler has done about it.
 *
 * NOTHING HERE READS A MONEY VALUE OR AUTHORIZES ANYTHING. It reads three id columns, returns a
 * word, and makes no charge, refund, rate or ownership decision (§14/§18).
 */

/** The four kinds, in the precedence order the derivation applies them. */
export const ITEM_KINDS = ["included", "bookable_separately", "external", "recommended"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/**
 * The three row facts the derivation reads — and nothing else.
 *
 * Every field is optional and nullable because callers hand this shape different projections of
 * the same row: the server passes the raw `itinerary_items` row, the slip passes the plancard
 * activity DTO (where the booked state arrives as the PRESENCE of a resolved `booking` object,
 * per ROUTING_STATE_CONTRACT §2), and the cart passes what its projected row carries. An ABSENT
 * field and a NULL one mean the same thing here — "this row does not name one" — which is the
 * honest reading for a caller whose projection simply does not carry the column (§13).
 */
export interface ItemKindInput {
  /** `itinerary_items.booking_id` — a real `service_bookings` row. Rule 1. */
  bookingId?: string | null;
  /** `itinerary_items.provider_service_id` — the bookable platform listing. Rule 2. */
  providerServiceId?: string | null;
  /** `itinerary_items.affiliate_product_id` — the partner grounding. Rule 3. */
  affiliateProductId?: string | null;
}

/** A non-empty id, and nothing else, counts as "this row names one". */
function names(id: string | null | undefined): boolean {
  return typeof id === "string" && id.trim().length > 0;
}

/**
 * THE ONE DERIVATION (§18 rule 1). Every surface that labels a plan item calls this; a second
 * "what kind of item is this?" expression written beside a component is the derivation-drift class,
 * and it is how the slip and the cart would start disagreeing about the same row.
 *
 * Total by construction — there is no "unknown" kind, because rule 4 is the honest answer for a
 * row that names nothing: a reference. It never guesses a stronger claim.
 */
export function itemKind(row: ItemKindInput): ItemKind {
  if (names(row.bookingId)) return "included";            // rule 1
  if (names(row.providerServiceId)) return "bookable_separately"; // rule 2
  if (names(row.affiliateProductId)) return "external";   // rule 3
  return "recommended";                                    // rule 4
}

/** How a kind chip is tinted. A NAME, never a colour — the hex lives in the surface's token layer. */
export type ItemKindTone = "booked" | "bookable" | "partner" | "neutral";

export interface ItemKindChip {
  kind: ItemKind;
  /** The word the traveler reads. Written HERE and nowhere else. */
  label: string;
  /** One sentence saying what the word means, for a tooltip / caption. */
  blurb: string;
  tone: ItemKindTone;
  /**
   * May a price be shown against this item as a price the PLATFORM can actually take?
   *
   * `included` — yes: the amount is the real booking's own. `bookable_separately` — yes: the
   * listing's own price, charged through the cart. `recommended` and `external` — NO, and this is
   * the §13 half of D-4: checkout skips an item with no service (`if (!item.service) continue;`),
   * so a number rendered beside one is a price nobody can charge, i.e. a claim. A surface reads
   * this flag instead of re-deciding it.
   */
  platformPriced: boolean;
}

/**
 * THE ONE LABEL MAP (§18 rule 1), on the `client/src/lib/item-origin.ts` model.
 *
 * A `Map`, deliberately, and not an object literal: the lookup key can arrive as a raw string from
 * a caller that did not narrow it, and an object literal would walk its PROTOTYPE for
 * `"constructor"` and hand back a function where a chip was expected.
 */
const ITEM_KIND_CHIPS = new Map<ItemKind, ItemKindChip>([
  [
    "included",
    {
      kind: "included",
      label: "included",
      blurb: "Already bought — this booking is paid for, nothing more to pay here.",
      tone: "booked",
      platformPriced: true,
    },
  ],
  [
    "bookable_separately",
    {
      kind: "bookable_separately",
      label: "book separately",
      blurb: "A listing on Traveloure — book it at its own price, separately from the plan.",
      tone: "bookable",
      platformPriced: true,
    },
  ],
  [
    "external",
    {
      kind: "external",
      label: "partner booking",
      blurb: "Arranged with a partner, not charged here.",
      tone: "partner",
      platformPriced: false,
    },
  ],
  [
    "recommended",
    {
      kind: "recommended",
      label: "recommended",
      blurb: "A recommendation — there is nothing to book or pay for here.",
      tone: "neutral",
      platformPriced: false,
    },
  ],
]);

/** The chip for one kind. Total over `ItemKind`; `null` only for a string outside the four. */
export function itemKindChip(kind: ItemKind | string | null | undefined): ItemKindChip | null {
  if (!kind) return null;
  return ITEM_KIND_CHIPS.get(kind as ItemKind) ?? null;
}

/** Convenience for the common call — derive and label in one step. Never returns `null`. */
export function itemKindChipFor(row: ItemKindInput): ItemKindChip {
  return ITEM_KIND_CHIPS.get(itemKind(row))!;
}

// ── THE AUTHORING CONTRACT ──────────────────────────────────────────────────────────────────────

/**
 * The sentence a ready-made author reads when they try to publish a priced free-text item.
 * Written once so the two build rails cannot word the same refusal two ways (§18 rule 1).
 */
export const AUTHORED_PRICED_UNLINKED_REFUSAL =
  "A priced plan item must name the listing it is booked through. Link a Traveloure service, " +
  "or remove the price and leave it as a recommendation — a buyer can never be charged for an " +
  "item that names no service.";

/**
 * A stated price, and the definition is deliberately narrow. `estimated_cost` is a nullable
 * `decimal(10,2)`, so it arrives as a string from the database and as a string OR number from a
 * request body.
 *
 * NULL / absent / unparseable ⇒ NOT STATED (§13 — "we never asked" is not "free"), and a value
 * that parses to ZERO is likewise not a priced CLAIM: `0` is how an author says an item costs
 * nothing, which is a true thing to say about a recommendation. Only a value strictly greater
 * than zero is a price the buyer could be asked for.
 */
function statesAPrice(estimatedCost: string | number | null | undefined): boolean {
  if (estimatedCost === null || estimatedCost === undefined || estimatedCost === "") return false;
  const n = typeof estimatedCost === "number" ? estimatedCost : Number(estimatedCost);
  return Number.isFinite(n) && n > 0;
}

/**
 * THE AUTHORING CONTRACT, as ONE predicate (D-4): **a ready-made author may not publish a priced
 * item that names no bookable thing.** Returns the refusal sentence, or `null` when the write is
 * allowed.
 *
 * REFUSAL, NOT DOWNGRADE, AND THE REASON IS AUTHORSHIP. The ruling permitted either. A silent
 * downgrade would drop a number the author deliberately typed and publish a listing subtly unlike
 * the one they built — the author would never learn which of their items lost its price, and the
 * first person to notice would be a buyer. A 400 naming the rule is the same fact said to the
 * person who can act on it. (§13: a refused answer and an absent one are different facts.)
 *
 * IT GOVERNS NEW WRITES ONLY AND REWRITES NOTHING. No backfill exists and none is owed (§19b's
 * posture): rows already on disk keep their columns exactly as their author left them, and the
 * DERIVATION above is what makes them render honestly — a legacy priced free-text item reads as
 * `recommended`, and `platformPriced: false` is what keeps its price off the screen. The price is
 * hidden by the reader, never deleted from the row.
 *
 * IT IS THE AUTHOR'S CONTRACT, NOT THE TRAVELER'S. A traveler jotting "dinner, about $60" on
 * their own plan is writing a note to themselves, not publishing a product; the callers apply this
 * on the ready-made AUTHOR branch only (`isTripAuthor`), never on the owner or advisor branch.
 */
export function authoredItemPriceRefusal(
  row: ItemKindInput & { estimatedCost?: string | number | null },
): string | null {
  if (!statesAPrice(row.estimatedCost)) return null;
  const chip = itemKindChipFor(row);
  return chip.platformPriced ? null : AUTHORED_PRICED_UNLINKED_REFUSAL;
}
