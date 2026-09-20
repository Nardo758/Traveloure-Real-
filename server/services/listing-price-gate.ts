/**
 * LISTING PRICE GATE — a listing cannot go LIVE without a positive price, EXCEPT the one archetype
 * whose price authority is not the listing at all.
 *
 * Ledger `2026-09-20-quote-listing-goes-live`. Fixes the defect the OC-A4 activation gate did not
 * catch: `resolveOfferingCommerceContract`'s P5 archetype (`priceType === "custom_quote"`) resolves
 * `priceAuthority: "server_quote"` (offering-commerce-contract.ts ~404-413, Locked Decision 49 —
 * "a custom quote is a `service_quotes` row, never a price on the listing"), so a listing's own
 * `price` column is neither required nor meaningful for that shape. The EX-2 gate this replaces ran
 * BEFORE the OC-A4 contract gate and refused `400 PRICE_REQUIRED` unconditionally whenever
 * `Number(price)` was not finite and positive — with no exemption for `custom_quote` — so a
 * quote-approve listing could never reach `active` through the API at all, and every quote request
 * against it answered `listing_not_found` (`service-quotes.service.ts` requires
 * `status='active' AND approval_status='approved'`).
 *
 * IT DOES NOT RE-IMPLEMENT THE RESOLVER'S RULE (§18 rule 1). The resolver places no constraint on
 * the VALUE of `price` for `custom_quote` — only on `bookingMode` (`instant_commitment_with_custom_quote`,
 * caught downstream by `checkOfferingActivationGate`, which already runs after this gate on both
 * rails). So this gate does not manufacture a second rule for a positive price supplied alongside
 * `custom_quote`: it exempts the shape from the price-value check entirely, exactly as the resolver
 * does, and leaves the instant+quote contradiction to the gate that already owns it.
 *
 * Every other price type's behaviour is byte-identical to the gate this replaces: a draft (`status`
 * anything but `"active"`) is never judged, and the package-tiers min-tier recompute the two callers
 * already run before invoking this gate still supplies the derived scalar this reads.
 */

export interface ListingPriceGateResult {
  ok: boolean;
  code?: "PRICE_REQUIRED";
}

/**
 * @param priceType  The effective `priceType` this write will leave the listing with — the write's
 *   own value if present, else the stored one. Resolved by the caller exactly as it already resolves
 *   `effPrice` (create: the write's own value; update: `input.priceType ?? ownedService.priceType`).
 * @param price  The effective `price` this write will leave the listing with, same resolution rule.
 *   Already post-package-tiers-recompute when the caller runs that step first.
 */
export function listingPriceGate(opts: {
  priceType: string | null | undefined;
  price: unknown;
}): ListingPriceGateResult {
  // P5 / custom_quote: priceAuthority is `server_quote` (the seller's issued `service_quotes` row,
  // Locked Decision 49) — a listing price is neither required nor meaningful, and the resolver
  // imposes no value constraint on it, so none is imposed here either.
  if (opts.priceType === "custom_quote") {
    return { ok: true };
  }
  const effPrice = Number(opts.price);
  if (!Number.isFinite(effPrice) || effPrice <= 0) {
    return { ok: false, code: "PRICE_REQUIRED" };
  }
  return { ok: true };
}
