/**
 * `PlacePhoto` — one image WITH its attribution (R-aq: a photo is a fact). Rendered only from a real
 * resolved photo; with none it renders nothing — never stock, never a placeholder (§13). The photos
 * themselves come from `GET /api/trips/:tripId/place-photos` (`usePlacePhotos`).
 */
import { useQuery } from "@tanstack/react-query";
import type { PhotoView } from "@shared/place-photos";

export function usePlacePhotos(tripId: string | null | undefined, itemIds: readonly string[]): Record<string, PhotoView | null> {
  const ids = Array.from(new Set(itemIds.filter(Boolean))).sort();
  const { data } = useQuery<{ photos: Record<string, PhotoView | null> }>({
    queryKey: [`/api/trips/${tripId}/place-photos?items=${encodeURIComponent(ids.join(","))}`],
    enabled: !!tripId && ids.length > 0,
    staleTime: 10 * 60_000,
    retry: false,
  });
  return data?.photos ?? {};
}

export function PlacePhoto({
  photo,
  testId,
  size = "hero",
  onClick,
}: {
  photo: PhotoView | null | undefined;
  testId: string;
  /** `band`: the Main board's day photo — full-bleed, 132px, the attribution on the image (ledger
   *  `2026-10-08-slip-main-rows`). The attribution is always drawn; only where it sits changes. */
  size?: "hero" | "thumb" | "band";
  onClick?: () => void;
}) {
  if (!photo) return null;
  const img = (
    <img
      src={photo.url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className={
        size === "thumb" ? "h-14 w-14 rounded object-cover" : size === "band" ? "h-[132px] w-full object-cover" : "h-40 w-full rounded-md object-cover"
      }
    />
  );
  const caption = (
    <span className="block text-[10px] text-muted-foreground" data-testid={`${testId}-attribution`}>
      {photo.sourceUrl ? (
        <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
          {photo.attribution}
        </a>
      ) : (
        photo.attribution
      )}
    </span>
  );
  if (size === "thumb") {
    return (
      <figure className="flex-shrink-0 w-14" data-testid={testId} data-photo-source={photo.source} title={photo.attribution}>
        {onClick ? (
          <button type="button" onClick={onClick} aria-label="Details" className="block">
            {img}
          </button>
        ) : (
          img
        )}
      </figure>
    );
  }
  // UI-2a (row 5): the band's attribution is a fact drawn ON the image, so it needs its own picture
  // ground. It used to state that ground as a brand-era literal pair (a translucent white and a raw
  // hex); it now takes the slip's card ground and muted ink, the same pair the rest of the board uses.
  // This note lives OUTSIDE the block on purpose: `ui2a-drafted-day.test.ts` slices the band and
  // refuses a hex there, and its first version failed because the explanation sat inside the slice.
  if (size === "band") {
    return (
      <figure className="relative" data-testid={testId} data-photo-source={photo.source}>
        {onClick ? (
          <button type="button" onClick={onClick} aria-label="Details" className="block w-full">
            {img}
          </button>
        ) : (
          img
        )}
        {/* The band's attribution is the same fact as the hero's, on its own picture ground. */}
        <span
          className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-[var(--slip-radius-chip)] bg-[color:var(--slip-card)] px-2 py-0.5 text-[11px] text-[color:var(--slip-muted)]"
          data-testid={`${testId}-attribution`}
        >
          {photo.sourceUrl ? (
            <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {photo.attribution}
            </a>
          ) : (
            photo.attribution
          )}
        </span>
      </figure>
    );
  }
  return (
    <figure className="space-y-1" data-testid={testId} data-photo-source={photo.source}>
      {onClick ? (
        <button type="button" onClick={onClick} aria-label="Details" className="block w-full">
          {img}
        </button>
      ) : (
        img
      )}
      {caption}
    </figure>
  );
}
