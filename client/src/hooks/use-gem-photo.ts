import { useState, useEffect } from "react";

/**
 * Resolves a photo URL for a gem card using the following priority:
 *  (a) imageUrl already on the gem record
 *  (b) Google Places photo via /api/media/place-photo?q=&city=
 *  (c) null → caller should hide the card
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
        const qs = new URLSearchParams({ q: placeName, city });
        const res = await fetch(`/api/media/place-photo?${qs}`);
        if (!res.ok) throw new Error("place-photo fetch failed");
        const json = await res.json();
        if (!cancelled) {
          setPhotoUrl(json.photoUrl ?? null);
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
