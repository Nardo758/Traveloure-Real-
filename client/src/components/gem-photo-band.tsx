/**
 * The gem card's photo, or the no-photo state when the URL is missing or the
 * request fails (row 250). A failed load must not leave an empty image box:
 * the place name sits on the kind gradient the card already paints behind it.
 */
export function gemPhotoShowsImage(state: {
  photoUrl: string | null | undefined;
  loading: boolean;
  failed: boolean;
}): boolean {
  return !state.loading && Boolean(state.photoUrl) && !state.failed;
}

export function gemPhotoShowsFallback(state: {
  photoUrl: string | null | undefined;
  loading: boolean;
  failed: boolean;
}): boolean {
  return !state.loading && (!state.photoUrl || state.failed);
}

export function GemPhotoMedia({
  photoUrl,
  loading,
  failed,
  placeName,
  id,
  srcSet,
  sizes,
  loaded,
  onLoad,
  onError,
}: {
  photoUrl: string | null;
  loading: boolean;
  failed: boolean;
  placeName: string;
  id: string;
  srcSet?: string;
  sizes?: string;
  loaded: boolean;
  onLoad: () => void;
  onError: () => void;
}) {
  const showImage = gemPhotoShowsImage({ photoUrl, loading, failed });
  const showFallback = gemPhotoShowsFallback({ photoUrl, loading, failed });
  return (
    <>
      {showImage && photoUrl && (
        <img
          src={photoUrl}
          srcSet={srcSet}
          sizes={sizes}
          alt={placeName}
          loading="lazy"
          onLoad={onLoad}
          onError={onError}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {showFallback && (
        <span
          data-testid={`gem-photo-fallback-${id}`}
          className="relative z-[1] max-w-full px-3 text-center text-[13px] font-semibold leading-snug"
        >
          {placeName}
        </span>
      )}
    </>
  );
}
