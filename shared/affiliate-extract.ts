/**
 * affiliate-extract.ts — provenance of an `affiliate_products` row and the per-partner terms gate on
 * page extraction (ledger `2026-09-30-affiliate-extract-compliant`, migration 334).
 *
 * The decision-maker's ruling (Sep 30, 2026): keep the page-extraction capability, make it
 * compliant. Extraction runs ONLY for a partner whose program allows it, as recorded by an admin
 * after reading the terms; every product row records which writer produced it.
 *
 * Both answers live here ONCE (§18 rule 1): the server's refusal and the admin page's button read
 * the same predicate, so the button can never offer what the server will refuse.
 */

/** Which writer produced an `affiliate_products` row. NULL on a row = written before migration 334. */
export const AFFILIATE_PRODUCT_SOURCES = [
  "travelpayouts_import", // server/services/catalog-ingest.service.ts
  "partner_page_extract", // server/services/affiliate-scraper.service.ts
  "manual", // an admin-entered row — declared for the value set; no writer exists today
] as const;

export type AffiliateProductSource = (typeof AFFILIATE_PRODUCT_SOURCES)[number];

export function isAffiliateProductSource(v: unknown): v is AffiliateProductSource {
  return typeof v === "string" && (AFFILIATE_PRODUCT_SOURCES as readonly string[]).includes(v);
}

/**
 * May this partner's pages be extracted? Only on an explicit TRUE answered with a terms-check date.
 * NULL (never answered), FALSE (answered no) and a TRUE with no date all refuse — "default off", and
 * a permission nobody dated is not a permission anyone can point to.
 */
export function pageExtractAllowed(partner: {
  pageExtractPermitted?: boolean | null;
  termsCheckedAt?: Date | string | null;
}): boolean {
  return partner.pageExtractPermitted === true && partner.termsCheckedAt != null;
}
