import { useEffect, useRef } from "react";
import { getOrCreateGuestSessionId } from "@/lib/guest-session";

/**
 * Module-level dedup set — persists for the browser tab lifetime.
 * Prevents re-firing an impression when a component remounts.
 */
const _seen = new Set<string>();

/**
 * Fires a single impression event when the attached element scrolls
 * into view (≥50% visible). Deduped per (contentType, contentId) per session.
 *
 * Returns a `ref` to attach to the card root element and a `getImpressionId()`
 * accessor so the card can attach the impression ID to subsequent click /
 * add-to-itinerary events.
 */
export function useImpressionTracker(
  contentType: string,
  contentId: string,
  city: string,
  cardPosition?: number,
) {
  const impressionIdRef = useRef<string | null>(null);
  const elemRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contentType || !contentId) return;
    const dedupeKey = `${contentType}:${contentId}`;

    if (_seen.has(dedupeKey)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        if (_seen.has(dedupeKey)) return;
        _seen.add(dedupeKey);

        const sessionId = getOrCreateGuestSessionId();
        fetch("/api/tracking/impression", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType,
            contentId,
            city: city || null,
            cardPosition: cardPosition ?? null,
            sessionId,
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data?.impressionId) {
              impressionIdRef.current = data.impressionId;
            }
          })
          .catch(() => {});
      },
      { threshold: 0.5 },
    );

    const el = elemRef.current;
    if (el) observer.observe(el);

    return () => observer.disconnect();
  }, [contentType, contentId, city, cardPosition]);

  return {
    ref: elemRef,
    getImpressionId: () => impressionIdRef.current,
  };
}
