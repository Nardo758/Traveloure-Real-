/**
 * CMS-1 (ledger `2026-11-04-cms1-launch-screens`): the credit a stock fallback photo carries. Built from the provider's
 * own API answer (Unsplash and Pexels both name the photographer and the photo page); the licence page is the
 * provider's published licence. No photographer or no photo page ⇒ null, and the caller returns no photo.
 */
export interface StockPhotoCredit {
  name: string;
  source: "Unsplash" | "Pexels";
  licenseUrl: string;
  link: string;
}

export const STOCK_LICENSE_URLS = {
  Unsplash: "https://unsplash.com/license",
  Pexels: "https://www.pexels.com/license/",
} as const;

export function stockPhotoCredit(photo: {
  source?: string;
  sourceName?: string;
  photographerName?: string | null;
  sourceUrl?: string | null;
}): StockPhotoCredit | null {
  const source = photo.sourceName === "Unsplash" || photo.source === "unsplash"
    ? "Unsplash"
    : photo.sourceName === "Pexels" || photo.source === "pexels"
      ? "Pexels"
      : null;
  const name = typeof photo.photographerName === "string" ? photo.photographerName.trim() : "";
  const link = typeof photo.sourceUrl === "string" ? photo.sourceUrl.trim() : "";
  if (!source || !name || !/^https:\/\//.test(link)) return null;
  return { name, source, licenseUrl: STOCK_LICENSE_URLS[source], link };
}
