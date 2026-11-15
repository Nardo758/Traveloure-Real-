import { useState, useEffect } from "react";

/**
 * Resolves a photo URL for a gem card using the following priority:
 *  (a) imageUrl already on the gem record
 *  (b) Unsplash/Pexels via /api/media/place-photo?q=&city=&source=unsplash
 *  (c) null → caller should hide the card
 *  R299: there is no Google step — Google place photos come only from the R-aq resolver.
 */
/**
 * CMS-1 (ledger `2026-11-04-cms1-launch-screens`): the credit a stock fallback photo comes with (photographer, source,
 * licence page, photo page). Only a fallback photo carries one; a stored photo's credit is the record's own.
 */
export interface StockPhotoCredit {
  name: string;
  source: string;
  licenseUrl: string;
  link: string;
}

function readCredit(v: unknown): StockPhotoCredit | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  const ok = (k: string) => typeof c[k] === "string" && (c[k] as string).trim().length > 0;
  return ok("name") && ok("source") && ok("licenseUrl") && ok("link")
    ? { name: c.name as string, source: c.source as string, licenseUrl: c.licenseUrl as string, link: c.link as string }
    : null;
}

type StockPhotoAnswer = { photoUrl: string | null; credit: StockPhotoCredit | null };

/**
 * QA round 4 R4-10: ONE request per (place, city) for the page's life. Every card showing the same place shares the
 * answer (and the request while it is in flight), so a feed re-render or a remount never asks the server again. A
 * network failure is not kept: the next mount may ask once more.
 */
const stockPhotoAnswers = new Map<string, Promise<StockPhotoAnswer>>();

export function fetchStockPhoto(
  placeName: string,
  city: string,
  fetcher: typeof fetch = (...a) => fetch(...a),
): Promise<StockPhotoAnswer> {
  const key = `${placeName}\u0000${city}`;
  const known = stockPhotoAnswers.get(key);
  if (known) return known;
  const ask = (async (): Promise<StockPhotoAnswer> => {
    const qs = new URLSearchParams({ q: placeName, city, source: "unsplash" });
    const res = await fetcher(`/api/media/place-photo?${qs}`);
    if (!res.ok) return { photoUrl: null, credit: null };
    const json = await res.json();
    // CMS-1: a fallback photo is used only with its credit — never a bare URL.
    const c = readCredit(json.credit);
    return json.photoUrl && c ? { photoUrl: json.photoUrl, credit: c } : { photoUrl: null, credit: null };
  })();
  stockPhotoAnswers.set(key, ask);
  ask.catch(() => stockPhotoAnswers.delete(key));
  return ask;
}

/** Tests only. */
export function _resetStockPhotoAnswers() {
  stockPhotoAnswers.clear();
}

export function useGemPhoto(
  gemId: string,
  placeName: string,
  city: string,
  existingImageUrl: string | null | undefined,
  opts?: { allowFetch?: boolean },
): { photoUrl: string | null; loading: boolean; credit: StockPhotoCredit | null } {
  const allowFetch = opts?.allowFetch !== false;
  const [photoUrl, setPhotoUrl] = useState<string | null>(existingImageUrl ?? null);
  const [credit, setCredit] = useState<StockPhotoCredit | null>(null);
  const [loading, setLoading] = useState(!existingImageUrl && allowFetch);

  useEffect(() => {
    if (existingImageUrl) {
      setPhotoUrl(existingImageUrl);
      setCredit(null);
      setLoading(false);
      return;
    }
    // A card that stores no image and asks not to be filled stays on its gradient.
    if (!allowFetch) {
      setPhotoUrl(null);
      setCredit(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // (b) Unsplash/Pexels — one shared answer per place and city (R4-10).
        const answer = await fetchStockPhoto(placeName, city);
        if (!cancelled) {
          setPhotoUrl(answer.photoUrl);
          setCredit(answer.credit);
        }
      } catch {
        if (!cancelled) setPhotoUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [gemId, placeName, city, existingImageUrl, allowFetch]);

  return { photoUrl, loading, credit };
}
