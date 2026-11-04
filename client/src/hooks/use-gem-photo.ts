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
        // (b) Unsplash/Pexels
        const qs2 = new URLSearchParams({ q: placeName, city, source: "unsplash" });
        const res2 = await fetch(`/api/media/place-photo?${qs2}`);
        if (res2.ok) {
          const json2 = await res2.json();
          // CMS-1: a fallback photo is used only with its credit — never a bare URL.
          const c = readCredit(json2.credit);
          if (!cancelled) {
            setPhotoUrl(json2.photoUrl && c ? json2.photoUrl : null);
            setCredit(json2.photoUrl && c ? c : null);
          }
        } else {
          if (!cancelled) setPhotoUrl(null);
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
