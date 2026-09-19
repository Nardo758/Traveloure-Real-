/**
 * RESOLVE AN `affiliate_products` ROW TO A BOOKABLE PARTNER REFERENCE — ONE implementation
 * (§18 rule 1).
 *
 * Extracted from the inline `affiliateProductId` branch of
 * `POST /api/affiliate-booking-requests` (`content.routes.ts`), which resolved the row and its
 * outbound URL directly. That branch and the concierge hand-off
 * (`server/services/concierge-handoff.service.ts`) both need the same answer to the same
 * question — does this `affiliate_products` id resolve to a live, approved-partner, bookable
 * reference — and a second copy of that resolution is the derivation-drift class §18 rule 1
 * names.
 *
 * §14/§16: the outbound URL is read from the DB row (approved-partner-gated, same posture as
 * `/api/content/affiliate-redirect`), never accepted from a caller. §13: an absent product, an
 * unapproved partner, or a product with neither `affiliateUrl` nor `productUrl` all resolve to
 * `null` — never a fabricated reference.
 */
import { affiliateScraperService } from "./affiliate-scraper.service";

export interface AffiliateProductBookingReference {
  url: string;
  name: string | null;
  category: string | null;
  /** The partner's display name, resolved via the product's `partnerId`. Null when the partner
   *  row cannot be read — a resolution failure on this ONE field must never fail the whole
   *  reference (§13: an absent partner name is reported as absent, not invented). */
  partnerName: string | null;
}

export async function resolveAffiliateProductBookingReference(
  affiliateProductId: string,
): Promise<AffiliateProductBookingReference | null> {
  const product = await affiliateScraperService.getProductById(affiliateProductId, { approvedOnly: true });
  if (!product) return null;
  const url = product.affiliateUrl || product.productUrl || null;
  if (!url) return null;

  let partnerName: string | null = null;
  try {
    const partner = await affiliateScraperService.getPartnerById(product.partnerId);
    partnerName = partner?.name ?? null;
  } catch {
    partnerName = null;
  }

  return {
    url,
    name: product.name ?? null,
    category: product.category ?? null,
    partnerName,
  };
}
