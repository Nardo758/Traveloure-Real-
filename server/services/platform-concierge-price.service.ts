/**
 * The ONE writer of the platform-owned Booking Concierge listing's price
 * (ledger `2026-09-21-platform-concierge-price-editable`).
 *
 * ═══ WHY THIS EXISTS: THE ADMIN CONTROL WAS A LIE ═══
 *
 * Migration 313 seeded TWO things: a `fee_bands` row
 * (`platform_concierge_booking_listing_price`) and, from it, a static
 * `provider_services.price` on the platform listing. It said so plainly — "no resolver reads this
 * band at request time (it seeds a static `provider_services.price` column ONCE, here …); nothing
 * re-resolves it live" — and that was a defensible posture for a seeded-but-unread band.
 *
 * What it did NOT account for is that `fee_bands` has a WORKING ADMIN EDITOR
 * (`client/src/pages/admin/fee-bands.tsx`, `PATCH /api/admin/fee-bands/:bandKey`). So an admin
 * could open the panel, change that band from 25 to any number, get a success response and an
 * audit row — and the listing's price would not move. A control that appears to set a price and
 * does not is exactly the §13 class this codebase refuses everywhere else, and it is worse on a
 * money surface than an absent control would be.
 *
 * The decision-maker ruled the price editable from the admin panel. This module is the half that
 * makes that true.
 *
 * ═══ WHY THE COLUMN STAYS THE AUTHORITY, AND THE BAND DOES NOT BECOME ONE ═══
 *
 * The obvious alternative — have readers resolve the price from the band at request time — is
 * REFUSED, and the reason is a money hazard rather than a preference. Locked Decision 51's
 * facilitation fee is computed at checkout from THE CART LINE'S OWN `provider_services.price`
 * (`server/routes/payments.routes.ts`, `conciergeFeeAmt`). If a resolver served one number on the
 * catalog while the charge path read another off the column, a traveler would be shown one price
 * and charged a different one — two authorities meeting at the till, which is precisely the drift
 * class §18 rule 1 names and the worst possible place to have it.
 *
 * So: ONE authority at charge time (the column, unchanged), ONE control surface (the existing band
 * editor), and ONE writer bridging them (this module). The band is the admin-facing number and the
 * §8 home for the amount; the column is what every reader and the charge path already use.
 *
 * ═══ STATED NEGATIVE SPACE (§18d) ═══
 *
 *   · This writer does NOT make the band authoritative retroactively. A price edited directly on
 *     the listing row (by a future admin listing editor, or by hand) will diverge from the band
 *     until the band is next edited. There is no reconciler and none is invented here — inventing
 *     one would mean deciding which of the two wins, which is a ruling nobody has made.
 *   · It touches ONLY the platform-owned listing, resolved through the SAME
 *     `getPlatformConciergeUserId()` every other platform-concierge predicate uses (§18 rule 1).
 *     A real expert's Booking Concierge listing is never repriced by an admin band edit — their
 *     price is their own, and LD 51's split is what the platform takes from it.
 *   · It is not a fee. This is a LISTING'S SALE PRICE. The facilitation rate and cap that multiply
 *     it live in their own bands and are untouched by this module.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import { getPlatformConciergeUserId } from "./platform-concierge.service";

/** The band whose admin edit repoints the platform listing's price. */
export const PLATFORM_CONCIERGE_PRICE_BAND_KEY = "platform_concierge_booking_listing_price";

export interface PlatformConciergePriceSyncResult {
  /** True when a listing row was actually repriced. */
  updated: boolean;
  /** How many rows moved (0 or 1 — the platform owns exactly one such listing). */
  rowsUpdated: number;
  /** Why nothing happened, when nothing did. Never silently absent (§13). */
  reason?: "no_platform_account" | "no_listing" | "invalid_price";
  priceUsd?: number;
}

/**
 * Repoint the platform Booking Concierge listing's price.
 *
 * NEVER THROWS INTO THE ADMIN EDIT. The band write is the operation the admin asked for and has
 * already been audited; this propagation is an ancillary effect of it, and §15b's rule — "an
 * ancillary effect may not break the operation that authorizes it" — applies. A failure is
 * REPORTED (returned, and logged by the caller) so the admin is told the listing did not move,
 * rather than being shown a success that only half happened.
 */
export async function syncPlatformConciergeListingPrice(
  priceUsd: number,
): Promise<PlatformConciergePriceSyncResult> {
  if (!Number.isFinite(priceUsd) || priceUsd < 0) {
    return { updated: false, rowsUpdated: 0, reason: "invalid_price" };
  }

  const platformUserId = await getPlatformConciergeUserId();
  if (!platformUserId) {
    // The platform concierge account is absent (migration 313 not applied, or the setting row
    // removed). Nothing to reprice, and inventing a listing here would be a second author of a
    // row migration 313 owns.
    return { updated: false, rowsUpdated: 0, reason: "no_platform_account" };
  }

  // Addressed by OWNER + offering key, never by the hardcoded uuid migration 313 used: the id is
  // that migration's own seed detail, while the owner is the setting every other
  // platform-concierge predicate resolves through.
  const result = await db.execute(sql`
    UPDATE provider_services
       SET price = ${priceUsd.toFixed(2)}, updated_at = NOW()
     WHERE user_id = ${platformUserId}
       AND expert_offering_type_key = 'booking_concierge'
  `);

  const rowsUpdated = result.rowCount ?? 0;
  if (rowsUpdated === 0) {
    return { updated: false, rowsUpdated: 0, reason: "no_listing", priceUsd };
  }
  return { updated: true, rowsUpdated, priceUsd };
}
