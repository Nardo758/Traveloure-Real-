/**
 * D-11 — A TRIP-BEARING BOOKING WITH NO PLAN ITEM IS A MIGRATION EXCEPTION, NOT A PATTERN.
 *
 * Punchlist D-11; ledger `2026-09-15-d11-no-item-booking-exception` (decision-maker ruling,
 * option A). Locked Decision 39 says there is ONE store of a plan's contents — `itinerary_items`
 * — and `itinerary_items.booking_id` (migration 159) is the link from a plan row to the
 * `service_bookings` row that bought it. LD 42 D9 puts the bookings section on the slip, and
 * `resolveTripBookings` (`trip-plan.service.ts`) emits every `service_bookings` row on the trip
 * so that "a booking with no linked item still renders".
 *
 * That reader's tolerance is a §13 honesty, not a licence. A row that NAMES a trip while no item
 * points at it is a plan-level obligation the plan itself does not know about: it cannot be
 * reordered, cannot be refunded through the routing reversal edge (`revertItemsOnRefund` keys on
 * `booking_id`), carries no `origin`, and appears on the slip as a purchase with no place in the
 * itinerary. The ruling is therefore:
 *
 *   • only the NAMED CLASSES below may produce one, and each such row SAYS SO on itself —
 *     `booking_details.noItemReason`, composed SERVER-SIDE at the birth site;
 *   • a new no-item birth OUTSIDE those classes is refused at the birth rail, before any write;
 *   • rows already on disk get DETECTION (`trip_booking_without_item`, warning, cart rail) and
 *     NEVER a backfill or a repair (§17 / §19b — a row that was written that way was written
 *     that way, and inventing a reason for it would manufacture a fact nobody stated).
 *
 * ── WHY THE REASON IS A SERVER-AUTHORED KEY AND NOT A COLUMN ─────────────────────────────────
 * No schema change was authorized for this lane, and none is needed: the fact is a provenance
 * note about how the row was born, which is exactly what `booking_details` already carries for
 * the rest of that family (`stripeAttemptAt`, `railsAttribution`, `directRateResolution`). It is
 * therefore a §19d hazard by construction — `bookingDetails` is a free-form jsonb the
 * `POST /api/bookings` allowlist admits — so `NO_ITEM_REASON_KEY` is a member of
 * `SERVER_AUTHORED_BOOKING_DETAIL_KEYS` and is stripped from every client body at both layers. A
 * client that could plant it would exempt its own row from the very detector this lane adds.
 *
 * ── STATED NEGATIVE SPACE (§18d), and it is the load-bearing half ────────────────────────────
 * This module names the classes; it does not decide which rail belongs to one. A rail that CAN
 * link an item is NOT a class — the checkout spine links at PROMOTE (`markItemPurchased`) for
 * every cart line that was a plan projection, and a line it could not link is precisely the
 * finding, never an exemption. Adding a class here is a decision-maker's call, recorded in the
 * ledger, and the detector's silence afterwards is the cost of it.
 */

/** The `booking_details` key a NAMED-CLASS birth site stamps. Declared here and imported by
 *  `shared/booking-details-admission.ts` so the strip and the composition name ONE string — two
 *  spellings of one key is the drift class §18 rule 1 names, and here it would fail OPEN. */
export const NO_ITEM_REASON_KEY = "noItemReason";

/**
 * The classes ratified on 2026-09-15. Each one is a rail that has NO way to point an
 * `itinerary_items` row at its booking, because what it sells is not a plan item:
 *
 *  • `transport_commerce` — the platform-transport hosted-checkout rail
 *    (`createTransportCheckoutSession`, `stripe.service.ts`). Its row references a
 *    `transport_booking_options` row, not a `provider_services` one, and carries a NULL
 *    `service_id` by the documented exception in CLAUDE.md's "Service Model" section. Nothing in
 *    `itinerary_items` points at a transport option, so there is no item to link.
 *  • `expert_booking_request` — `POST /api/expert-booking-requests` (`server/routes.ts`). The
 *    traveler is REQUESTING an expert's help on a plan; the booking is the request, and the
 *    advisor row (`ensureTripAdvisorRow`) is what attaches it to the trip. It buys no itinerary
 *    row, and the rail has no item reference to carry one.
 */
export const NO_ITEM_BOOKING_CLASSES = ["transport_commerce", "expert_booking_request"] as const;

export type NoItemBookingClass = (typeof NO_ITEM_BOOKING_CLASSES)[number];

/**
 * The ONE composition of the mark. Both named birth sites call this; a hand-written
 * `{ noItemReason: "…" }` beside it is the second author §18 rule 1 refuses.
 *
 * PURE — no clock, no db, no logging. Spread into the `bookingDetails` object the birth site is
 * already building.
 */
export function noItemBookingDetail(
  reason: NoItemBookingClass,
): Record<typeof NO_ITEM_REASON_KEY, NoItemBookingClass> {
  return { [NO_ITEM_REASON_KEY]: reason };
}

/**
 * Read the mark off a row's `booking_details`, for a reader that needs to know WHY a booking has
 * no item. Returns `null` for an absent, malformed or unrecognised value — §13: a reason nobody
 * wrote is not a reason, and an unknown string is not quietly promoted into a class.
 */
export function readNoItemReason(bookingDetails: unknown): NoItemBookingClass | null {
  if (bookingDetails === null || typeof bookingDetails !== "object" || Array.isArray(bookingDetails)) {
    return null;
  }
  const raw = (bookingDetails as Record<string, unknown>)[NO_ITEM_REASON_KEY];
  return (NO_ITEM_BOOKING_CLASSES as readonly string[]).includes(raw as string)
    ? (raw as NoItemBookingClass)
    : null;
}

/**
 * What `POST /api/bookings` answers to a body that names a `tripId`.
 *
 * THAT RAIL HAS NO ITEM REFERENCE AT ALL — its body allowlist is
 * `{serviceId, tripId, contractId, bookingDetails, bookingMetadata}` and nothing downstream
 * writes `itinerary_items.booking_id` — so EVERY trip-bearing booking it births is a stray by
 * construction, and it is not one of the named classes. The honest disposition is therefore to
 * refuse the `tripId`, not to mark the row: the plan-linked path is the cart (LD 39 — the cart is
 * the `ready_for_checkout` projection of `itinerary_items`, and the checkout spine is what links
 * the booking it buys). The rail keeps working for plain commerce with no trip named.
 *
 * Shaped like `PRICELESS_LISTING_REFUSAL` (the V-11 precedent on the same handler): a `reason`
 * a surface can branch on beside a sentence a human can read.
 */
export const PLAN_BOOKING_NEEDS_CART_REFUSAL = {
  reason: "plan_booking_needs_cart" as const,
  message:
    "A booking cannot be attached to a plan on this rail: it has no way to link the plan item the " +
    "booking pays for, so the plan would carry an obligation it does not know about. Add the " +
    "service to the plan and check out, which links the item to its booking.",
} as const;

export type PlanBookingRefusalReason = typeof PLAN_BOOKING_NEEDS_CART_REFUSAL.reason;
