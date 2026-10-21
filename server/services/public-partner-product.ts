import { sanitizePartnerCardCopy } from "@shared/banned-copy";

/**
 * PX-2 (ledger `2026-10-18-public-partner-price-strip`; decision-maker, Oct 18, 2026): what a PUBLIC read of
 * a stored partner product may carry. Pure.
 * G-02: the same public read drops "hidden gem(s)", "secret(s)" and "geisha" from its text, and omits
 * a product whose name is only those phrases. Admin reads do not call this.
 *
 * PX-1 stripped the partner URLs (§16). A stored partner price has no source and no as-of time either —
 * Browse already shows "See current price" instead (PX-1 ruling 3) — so it leaves the public response the
 * same way: the price, its currency, the "was" price and discount, and the scrape time that dates them.
 * Admin reads keep every field (the partner console needs them).
 */
export const PUBLIC_PARTNER_PRODUCT_STRIPPED_FIELDS = [
  "affiliateUrl",
  "productUrl",
  "price",
  "currency",
  "originalPrice",
  "discountPercent",
  "lastScrapedAt",
] as const;

type Stripped = (typeof PUBLIC_PARTNER_PRODUCT_STRIPPED_FIELDS)[number];

/** A key that names a money figure or its currency, at any depth of the free-form `metadata` jsonb. */
export const PRICE_SHAPED_KEY = /price|currency|discount|cost|fare|amount/i;

function withoutPriceKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPriceKeys);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (!PRICE_SHAPED_KEY.test(k)) out[k] = withoutPriceKeys(v);
    return out;
  }
  return value;
}

export function toPublicPartnerProduct<T extends Record<string, unknown>>(product: T): Omit<T, Stripped> | null {
  const out: Record<string, unknown> = { ...product };
  for (const k of PUBLIC_PARTNER_PRODUCT_STRIPPED_FIELDS) delete out[k];
  if ("metadata" in out && out.metadata != null) out.metadata = withoutPriceKeys(out.metadata);
  return sanitizePartnerCardCopy(out) as Omit<T, Stripped> | null;
}

export function toPublicPartnerProducts<T extends Record<string, unknown>>(products: T[]): Array<Omit<T, Stripped>> {
  return products.flatMap((product) => {
    const pub = toPublicPartnerProduct(product);
    return pub ? [pub] : [];
  });
}
