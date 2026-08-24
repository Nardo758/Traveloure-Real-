import { useState, useEffect } from "react";

/**
 * Resolves a photo URL for a gem card using the following priority:
 *  (a) imageUrl already on the gem record
 *  (b) Google Places photo via /api/media/place-photo?q=&city=&source=google
 *  (c) Unsplash/Pexels fallback via /api/media/place-photo?q=&city=&source=unsplash
 *  (d) null → caller should hide the card
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
        // (b) Try Google Places first
        const qs = new URLSearchParams({ q: placeName, city, source: "google" });
        const res = await fetch(`/api/media/place-photo?${qs}`);
        if (res.ok) {
          const json = await res.json();
          if (json.photoUrl) {
            if (!cancelled) setPhotoUrl(json.photoUrl);
            return;
          }
        }

        // (c) Unsplash/Pexels fallback
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
