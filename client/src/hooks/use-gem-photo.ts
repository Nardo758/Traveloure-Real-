import { useState, useEffect } from "react";

/**
 * Resolves a photo URL for a gem card using the following priority:
 *  (a) imageUrl already on the gem record
 *  (b) Unsplash/Pexels via /api/media/place-photo?q=&city=&source=unsplash
 *  (c) null → caller should hide the card
 *  R299: there is no Google step — Google place photos come only from the R-aq resolver.
 */
export function useGemPhoto(
  gemId: string,
  placeName: string,
  city: string,
  existingImageUrl: string | null | undefined,
): { photoUrl: string | null; loading: boolean } {
  const [photoUrl, setPhotoUrl] = useState<string | null>(existingImageUrl ?? null);
  const [loading, setLoading] = useState(!existingImageUrl);

  useEffect(() => {
    if (existingImageUrl) {
      setPhotoUrl(existingImageUrl);
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
          if (!cancelled) setPhotoUrl(json2.photoUrl ?? null);
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
  }, [gemId, placeName, city, existingImageUrl]);

  return { photoUrl, loading };
}
