/**
 * Unsplash image URL optimization helpers.
 *
 * Unsplash's CDN (imgix) supports on-the-fly transforms via query params:
 * - `auto=format` serves AVIF/WebP to capable browsers (~40-60% smaller than JPG)
 * - `w=` resizes to the requested width
 *
 * Image URLs are stored in the DB with `fm=jpg&w=1080` baked in, so we rewrite
 * client-side at render time rather than migrating stored data.
 */

const UNSPLASH_HOST = "images.unsplash.com";

export function isUnsplashUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    return new URL(url).hostname === UNSPLASH_HOST;
  } catch {
    return false;
  }
}

/** Append/override params on an Unsplash URL; returns non-Unsplash URLs untouched. */
export function optimizeUnsplashUrl(
  url: string | null | undefined,
  opts: { w?: number } = {},
): string | undefined {
  if (!url) return undefined;
  if (!isUnsplashUrl(url)) return url;
  const parsed = new URL(url);
  parsed.searchParams.set("auto", "format");
  parsed.searchParams.delete("fm"); // fm=jpg would override auto=format content negotiation
  // Stored URLs bake in q=80; q=60 is visually indistinguishable in AVIF/WebP
  // at card sizes and cuts transfer ~30-40%.
  parsed.searchParams.set("q", "60");
  if (opts.w) parsed.searchParams.set("w", String(opts.w));
  return parsed.toString();
}

/**
 * Build responsive srcSet/sizes props for an Unsplash image.
 * Returns {} for non-Unsplash URLs so it can be spread unconditionally.
 */
export function unsplashResponsiveProps(
  url: string | null | undefined,
  {
    widths = [400, 640, 1080],
    sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  }: { widths?: number[]; sizes?: string } = {},
): { srcSet?: string; sizes?: string } {
  if (!isUnsplashUrl(url)) return {};
  return {
    srcSet: widths.map((w) => `${optimizeUnsplashUrl(url, { w })} ${w}w`).join(", "),
    sizes,
  };
}
