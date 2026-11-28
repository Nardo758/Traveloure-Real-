/**
 * D1 (Leon, Nov 27 2026) - the stock-by-name fallback is GONE.
 *
 * A card shows the image its own record carries: a listing's own `serviceImage`, a curated moment photo, a ready-made
 * hero, or the destination art. With none, the caller's existing no-photo state stands. Nothing is fetched, so there is
 * no request to dedupe and no stock credit to read; the type stays because callers still hold a (now always null) credit.
 */
export interface StockPhotoCredit {
  name: string;
  source: string;
  licenseUrl: string;
  link: string;
}

export function useGemPhoto(
  gemId: string,
  placeName: string,
  city: string,
  existingImageUrl: string | null | undefined,
  opts?: { allowFetch?: boolean },
): { photoUrl: string | null; loading: boolean; credit: StockPhotoCredit | null } {
  void gemId;
  void placeName;
  void city;
  void opts;
  return { photoUrl: existingImageUrl ?? null, loading: false, credit: null };
}
