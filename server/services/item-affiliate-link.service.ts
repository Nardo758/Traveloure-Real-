/**
 * ITEM → AFFILIATE PRODUCT LINK — the ONE server-side resolution of
 * `itinerary_items.affiliate_product_id`. Migration 256, ledger
 * `2026-09-18-add-to-plan-lossless`, on the `item-event-link.service.ts` pattern (CLAUDE.md
 * entry 29, §18 rule 1).
 *
 * WHY THIS IS A MODULE AND NOT TWO INLINE CHECKS.
 * Two live write rails can admit the link — `POST /api/trips/:tripId/itinerary-items` (the
 * `server/routes.ts` monolith copy, which registers first and SHADOWS the `trips.routes.ts` twin)
 * and `PATCH /api/trips/:tripId/itinerary-items/:itemId` (`trips.routes.ts`, the serving copy,
 * whose `CONTRACT_FIELDS` list already names `affiliateProductId` as one of the ready-made
 * authoring-contract fields it reads back off the merged row). Two authors resolving the same
 * admission two ways is the derivation-drift class §18 rule 1 names, and it is how the §14/§19
 * family keeps coming back. So both rails call THIS, and a third rail added later has one obvious
 * thing to call.
 *
 * WHAT IT ACTUALLY GUARDS (§14 posture, one derivative sideways).
 * `affiliateProductId` is a client-supplied FOREIGN KEY. Accepting it through the pick-based
 * allowlist (`itineraryItemAffiliateLinkSchema`) proves only that a non-empty string arrived. It
 * does NOT prove the row exists, and it does not prove the partner product is still one the
 * platform will sell — `affiliate_products.isActive` is the table's own status column (there is no
 * separate approval workflow on this table; a product is live exactly when it is active). Without
 * this resolution a client could staple an item to a retired, deactivated or entirely invented
 * product id, and the plancard's booking CTA (`server/services/trip-plan.service.ts`) would light
 * up for a partner item nobody can actually route a booking request to.
 *
 * ABSENT / A VALUE are the two states (§13; unlike the event link there is no third "clear it"
 * state here — see the schema's own comment for why):
 *   · absent  ⇒ `{ action: "ignore" }` — the caller never named a partner product; do not touch it.
 *   · a value ⇒ verified, then `{ action: "set", value: <id> }`, or a refusal.
 *
 * A refusal is a 400 naming the reason, never a silent drop: an item that quietly landed with no
 * partner link would look identical to one Discover never offered a link for in the first place.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { affiliateProducts } from "@shared/schema";

export type ItemAffiliateLinkResolution =
  | { ok: true; action: "ignore" }
  | { ok: true; action: "set"; value: string }
  | { ok: false; reason: "affiliate_product_not_found" };

/** The one refusal message both rails return, so the two cannot drift apart in wording either. */
export const AFFILIATE_PRODUCT_NOT_FOUND_MESSAGE =
  "That partner item could not be found or is no longer available.";

/**
 * Resolve the affiliate-product link a request body asked for, against the DB.
 *
 * @param hasKey  whether the request body named `affiliateProductId` at all.
 * @param value   the parsed `itineraryItemAffiliateLinkSchema` output's `affiliateProductId`.
 */
export async function resolveItemAffiliateLink(
  hasKey: boolean,
  value: string | undefined,
): Promise<ItemAffiliateLinkResolution> {
  if (!hasKey || value === undefined) return { ok: true, action: "ignore" };

  const [product] = await db
    .select({ id: affiliateProducts.id, isActive: affiliateProducts.isActive })
    .from(affiliateProducts)
    .where(eq(affiliateProducts.id, value))
    .limit(1);

  // A nonexistent id and a deactivated one get the SAME reason on purpose: a caller must not be
  // able to probe which product ids exist, or which have been retired, by reading the difference.
  if (!product || product.isActive !== true) {
    return { ok: false, reason: "affiliate_product_not_found" };
  }
  return { ok: true, action: "set", value: product.id };
}
