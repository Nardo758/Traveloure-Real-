/**
 * QUOTE → PLAN LINK — the ONE server-side resolution of `service_quotes.trip_id` /
 * `itinerary_item_id`. Migration 314, ledger `2026-09-19-quote-plan-link`, CLAUDE.md Locked
 * Decision 49 (as amended).
 *
 * WHY THIS IS A MODULE AND NOT AN INLINE CHECK (§18 rule 1, the `resolveItemEventLink` precedent).
 * `POST /api/services/:id/quote-requests` admits `tripId` and `itineraryItemId` through the
 * pick-based `quoteRequestBodySchema` (§19) — but admission proves only that a non-empty string
 * arrived. It does NOT prove the trip is this traveler's, and it does NOT prove the item is on
 * that trip and for THIS listing. Without this resolution a traveler could staple a quote request
 * to someone else's plan, or to their own plan's item for a DIFFERENT service, and the waiver /
 * checkout-projection machinery downstream would then act on a pairing nobody verified.
 *
 * THE PAIRING IS SERVER-VERIFIED, NEVER CLIENT-TRUSTED (§14 posture, the ruling-29 item-event-link
 * shape applied to a quote).
 *   · `tripId` absent  ⇒ `{ ok: true }` — the caller never named a plan; nothing to resolve.
 *   · `tripId` present ⇒ `verifyTripOwnership`. A trip that is not the traveler's, or does not
 *     exist, gets the SAME 404 (LD 40 / custom-venues posture: "no such thing" and "not yours" are
 *     one sentence, so this rail cannot be used to probe which trips exist).
 *   · `itineraryItemId` present (schema already requires `tripId` alongside it) ⇒ the item must
 *     belong to `tripId` AND reference `serviceId` via `providerServiceId`. A mismatch is REFUSED
 *     (400), never silently dropped — a quote that quietly lost its item link would look identical
 *     to one the traveler never asked for one on.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems } from "@shared/schema";
import { verifyTripOwnership } from "../utils/trip-ownership";

export type QuotePlanLinkResolution =
  | { ok: true; tripId?: string; itineraryItemId?: string }
  | { ok: false; status: number; code: string; message: string };

/** The one refusal message for a trip that is absent or not this traveler's (LD 40 posture). */
export const QUOTE_PLAN_TRIP_NOT_FOUND_MESSAGE = "Plan not found.";

/** The one refusal message for an item that does not belong to the named trip and listing. */
export const QUOTE_PLAN_ITEM_MISMATCH_MESSAGE =
  "That item is not on this plan for this listing. An item can only be named on a quote request when it belongs to the same plan and the same listing.";

export async function resolveQuotePlanLink(input: {
  travelerId: string;
  serviceId: string;
  tripId?: string | null;
  itineraryItemId?: string | null;
}): Promise<QuotePlanLinkResolution> {
  const tripId = input.tripId ?? undefined;
  const itemId = input.itineraryItemId ?? undefined;

  if (!tripId) return { ok: true };

  const owns = await verifyTripOwnership(tripId, input.travelerId);
  if (!owns) {
    return { ok: false, status: 404, code: "trip_not_found", message: QUOTE_PLAN_TRIP_NOT_FOUND_MESSAGE };
  }

  if (!itemId) return { ok: true, tripId };

  const [item] = await db
    .select({
      id: itineraryItems.id,
      tripId: itineraryItems.tripId,
      providerServiceId: itineraryItems.providerServiceId,
    })
    .from(itineraryItems)
    .where(eq(itineraryItems.id, itemId))
    .limit(1);

  // A nonexistent id, an id on someone else's/another trip, and an id for a different listing all
  // get the SAME message on purpose (the resolveItemEventLink posture): a caller must not be able
  // to probe which item ids exist by reading the difference.
  if (!item || item.tripId !== tripId || item.providerServiceId !== input.serviceId) {
    return { ok: false, status: 400, code: "item_not_on_plan", message: QUOTE_PLAN_ITEM_MISMATCH_MESSAGE };
  }

  return { ok: true, tripId, itineraryItemId: item.id };
}
