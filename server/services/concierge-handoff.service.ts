/**
 * THE HAND-OFF — checkout of a Booking Concierge line creates the plan's partner requests.
 * Ledger `2026-09-18-concierge-handoff`. CLAUDE.md Locked Decision 51 (the fee this hand-off
 * earns), Locked Decision 39 (`itinerary_items` is the one plan store; the cart is its
 * projection), Locked Decision 44 (the booking-agent status vocabulary and the pool-vs-assigned
 * posture), §13, §14, §15, §15b, §18 rule 1.
 *
 * WHAT THIS ANSWERS. A traveler buys a `booking_concierge` listing off a plan through the ordinary
 * `/api/checkout` cart rail — v1.4 §6's "the hand-off IS the purchase of a Booking Concierge
 * service." Before this lane the two rails never met: the checkout promoted the booking and the
 * plan's partner items (`affiliate_product_id` set, `provider_service_id` NULL — an affiliate
 * product on the slip with no platform listing behind it) sat exactly as they were, with no
 * `affiliate_booking_requests` row for the booking agent to work from. `createHandoffRequestsForBooking`
 * is the ONE place that gap closes; both promotion paths call it (see the annotations at each call
 * site — a second copy of this decision is the derivation-drift class §18 rule 1 names).
 *
 * THE ASSUMPTION THIS LANE STANDS ON (stated for the decision-maker; reversible by ledger,
 * amending `2026-09-08-assignment-is-claimed` for PAID hand-offs only). A request born from a PAID
 * concierge booking is stamped `expertId` = the listing's OWNER — they agreed to the work by
 * listing it and being paid for it (Locked Decision 51 mints them 75% of the facilitation fee for
 * doing exactly this). The pool rule (`expertId: null`, claimed from the pooled queue) is
 * UNCHANGED for every other affiliate-booking-request rail: unpaid, traveler-initiated requests,
 * and — once lane F lands — a platform-owned listing's requests, which this module also handles by
 * simply carrying whatever owner `provider_services.userId` names (a platform account is still a
 * `users` row, so no branch is needed here).
 *
 * WHY IT NEVER THROWS INTO THE MONEY PATH (§15b). The booking is the money truth: Stripe has been
 * charged and the row is confirmed before either caller reaches this function. A hand-off failure —
 * a bad plan link, a partner product that no longer resolves, a DB error — must never undo or
 * retry the payment. Every branch returns a result; nothing here is awaited by anything that could
 * roll the checkout back, and the two call sites wrap the call in their own try/catch besides.
 *
 * §13 — THE ABSENCES ARE ANSWERS, NEVER INVENTED:
 *   · not a `booking_concierge` listing            ⇒ `reason: "not_concierge"`, nothing touched.
 *   · no `bookingDetails.itineraryItemId`, or the
 *     item names no trip                            ⇒ `reason: "no_plan_link"` — the purchase was
 *                                                       never tied to a plan, so there is no plan
 *                                                       to hand items off from.
 *   · a candidate item carries no `affiliateProductId`, or its product no longer resolves to a
 *     live, approved-partner reference                ⇒ counted in `skipped`, reason
 *     `"no_partner_product"` — never invented into a request with a fabricated URL.
 *
 * §15 — THE STATEMENT IS THE GUARD. Idempotency is the migration-312 partial UNIQUE
 * `(service_booking_id, itinerary_item_id) WHERE both NOT NULL`, applied through
 * `storage.createAffiliateBookingRequestIdempotent`'s `ON CONFLICT … DO NOTHING`. A second call for
 * the same booking (the recovery twin re-running the primary path's own effect) inserts nothing a
 * second time; `handedOff` on the retry counts only the NEW rows.
 */
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems, type InsertAffiliateBookingRequest } from "@shared/schema";
import { storage } from "../storage";
import { logger } from "../infrastructure/logger";
import { resolveBookingConciergeItems } from "./booking-concierge.service";
import { resolveAffiliateProductBookingReference } from "./affiliate-product-resolution.service";
import { buildAttributedAffiliateUrl } from "./affiliate-attribution.service";
import crypto from "crypto";

export type ConciergeHandoffReason = "not_concierge" | "no_plan_link" | "no_partner_product";

export interface ConciergeHandoffResult {
  /** Number of NEW `affiliate_booking_requests` rows created by this call. */
  handedOff: number;
  /** Number of candidate plan items considered and NOT handed off. */
  skipped: number;
  /** Set when handedOff is 0 and there is a single reason for the whole call — never guessed when
   *  the outcome is mixed (some handed off, some skipped: the per-item reason is always
   *  "no_partner_product" in that case, so it is still reported, but a caller reading only
   *  `handedOff > 0` never needs it). */
  reason?: ConciergeHandoffReason;
  requestIds: string[];
}

const EMPTY_RESULT = (reason: ConciergeHandoffReason): ConciergeHandoffResult => ({
  handedOff: 0,
  skipped: 0,
  reason,
  requestIds: [],
});

/**
 * Injectable seam, on the `proposal-create.service.ts` `CreateProposalDeps` precedent — a real
 * DB failure on ONE item's insert (a dropped connection, a constraint this module does not
 * anticipate) is exactly what §15b's "never throws into the money path" promise must survive, and
 * the test that proves it (H5) injects the failure here rather than trying to provoke a real one.
 * Every field defaults to the real storage call; nothing about production wiring changes.
 */
export interface ConciergeHandoffDeps {
  createAffiliateBookingRequestIdempotent: typeof storage.createAffiliateBookingRequestIdempotent;
}

const defaultDeps: ConciergeHandoffDeps = {
  createAffiliateBookingRequestIdempotent: (data) => storage.createAffiliateBookingRequestIdempotent(data),
};

/**
 * @param bookingId the CONFIRMED `service_bookings.id` for the concierge purchase. Callers pass
 *                   this AFTER their own money leg has landed (post `markItemPurchased`, per the
 *                   annotations at each call site).
 */
export async function createHandoffRequestsForBooking(
  bookingId: string,
  deps: ConciergeHandoffDeps = defaultDeps,
): Promise<ConciergeHandoffResult> {
  try {
    const booking = await storage.getServiceBooking(bookingId);
    if (!booking || !booking.serviceId) return EMPTY_RESULT("not_concierge");

    const service = await storage.getProviderServiceById(booking.serviceId);
    if (!service) return EMPTY_RESULT("not_concierge");

    const concierge = await resolveBookingConciergeItems([
      { expertOfferingTypeKey: service.expertOfferingTypeKey },
    ]);
    if (!concierge.isBookingConcierge({ expertOfferingTypeKey: service.expertOfferingTypeKey })) {
      return EMPTY_RESULT("not_concierge");
    }

    const bookingDetails = (booking.bookingDetails ?? {}) as Record<string, unknown>;
    const conciergeItemId =
      typeof bookingDetails.itineraryItemId === "string" ? bookingDetails.itineraryItemId : null;
    if (!conciergeItemId) return EMPTY_RESULT("no_plan_link");

    const conciergeItem = await db.query.itineraryItems.findFirst({
      where: eq(itineraryItems.id, conciergeItemId),
    });
    const tripId = conciergeItem?.tripId ?? null;
    if (!tripId) return EMPTY_RESULT("no_plan_link");

    // Candidate items: everything on the plan that is not itself a platform-bookable service and
    // not already purchased. `provider_service_id IS NULL` excludes the concierge line itself (it
    // IS a provider_services row) with no special-case needed. `affiliate_product_id` presence and
    // whether that product still resolves are decided per item below (§13 — one skip reason
    // covers both "never a partner item" and "was one, no longer resolves").
    const candidates = await db
      .select({
        id: itineraryItems.id,
        affiliateProductId: itineraryItems.affiliateProductId,
      })
      .from(itineraryItems)
      .where(
        and(
          eq(itineraryItems.tripId, tripId),
          isNull(itineraryItems.providerServiceId),
          ne(itineraryItems.routingStatus, "purchased"),
        ),
      );

    let handedOff = 0;
    let skipped = 0;
    const requestIds: string[] = [];

    for (const item of candidates) {
      if (!item.affiliateProductId) {
        skipped++;
        continue;
      }

      const ref = await resolveAffiliateProductBookingReference(item.affiliateProductId).catch(
        (err) => {
          logger.error(
            { err, bookingId, itemId: item.id, affiliateProductId: item.affiliateProductId },
            "[concierge-handoff] partner product resolution failed — item skipped, booking stands",
          );
          return null;
        },
      );
      if (!ref) {
        skipped++;
        continue;
      }

      const requestId = crypto.randomUUID();
      const attribution = buildAttributedAffiliateUrl({ affiliateUrl: ref.url, requestId });

      const insertData: InsertAffiliateBookingRequest & {
        itineraryItemId: string;
        serviceBookingId: string;
      } = {
        id: requestId,
        userId: booking.travelerId!,
        // THE ASSUMPTION (see module doc): a PAID hand-off is stamped to the listing's own owner —
        // they are being paid a share of the facilitation fee (Locked Decision 51) to do this
        // work. NOT the pool default every traveler-initiated request still gets.
        expertId: service.userId,
        tripId,
        itineraryItemId: item.id,
        serviceBookingId: bookingId,
        itemName: (ref.name || "Partner booking").slice(0, 255),
        itemDescription: null,
        partnerName: (ref.partnerName || "Partner").slice(0, 100),
        partnerCategory: ref.category ? ref.category.slice(0, 50) : null,
        affiliateUrl: attribution.url,
        travelDate: null,
        travelers: 1,
        userNotes: null,
        expertNotes: null,
        confirmationRef: null,
        price: null,
        status: "pending", // legacy DB value; the ONE reader maps it to the ruled `received` (LD 44 (e))
      } as InsertAffiliateBookingRequest & { itineraryItemId: string; serviceBookingId: string };

      const created = await deps.createAffiliateBookingRequestIdempotent(insertData);
      if (created) {
        handedOff++;
        requestIds.push(created.id);
      }
      // A conflict (created === undefined) means a prior call already handed this item off —
      // exactly the retry case §15's statement-is-the-guard exists for. Not counted as skipped:
      // it was not passed over, it was already done.
    }

    return {
      handedOff,
      skipped,
      reason: skipped > 0 ? "no_partner_product" : undefined,
      requestIds,
    };
  } catch (err) {
    // §15b: an ancillary effect may not break the operation that authorizes it. The booking is
    // the money truth; a hand-off failure is logged and swallowed, never re-thrown into a
    // promotion path.
    logger.error({ err, bookingId }, "[concierge-handoff] hand-off failed — booking stands");
    return { handedOff: 0, skipped: 0, requestIds: [] };
  }
}
