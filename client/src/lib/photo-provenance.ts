/**
 * photo-provenance.ts — the two-photo-tiers predicate (ruling 2026-09-01-photo-tiers, tier-1
 * reference-photo chip).
 *
 * A REFERENCE image is stock / places-sourced (Unsplash, Pexels, Google Places) — it stands in
 * on a TEASER surface (gem cards, city tiles) until an attributed real photo replaces it, and
 * MUST carry a small mono `reference photo` chip while it does. TRUST surfaces (the Moments
 * section, expert bylines, scout reports — anything carrying a `@handle`) never render a
 * reference image at all: they are attributed-real-or-gradient per the ruling and are OUT OF
 * SCOPE here.
 *
 * The predicate is HOST-based, so this lane needs no server/data change — it mirrors the exact
 * non-stock predicate the Moments TRUST gate already uses server-side
 * (`server/services/landing-moments.ts` → `attributedPhotosForCity`: the four excluded stock
 * hosts). An attributed real photo is an expert-curated upload on a NON-stock host (or a
 * field-knowledge evidence photo), so it never matches and no chip renders. No image at all ⇒
 * false, and the caller's existing gradient stands untouched.
 *
 * Where a surface also carries an explicit provenance column (city_media_cache's
 * `source ∈ unsplash|pexels|google_places`), pass it as `source` and it is honoured too — the
 * ruling's "OR the row's source column says so".
 */

// The four stock hosts the Moments gate excludes, as one host predicate. Substring match (not a
// strict URL parse) so query-string / CDN-variant forms are still caught.
const STOCK_HOST_RE = /unsplash\.com|pexels\.com|googleusercontent\.com|googleapis\.com/i;

// Explicit provenance values (city_media_cache.source) that mark a stock/places reference image.
const STOCK_SOURCES = new Set(["unsplash", "pexels", "google_places", "google"]);

/** True when a URL points at one of the stock/places hosts. Null/empty ⇒ false (no image). */
export function isStockPhotoUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.length > 0 && STOCK_HOST_RE.test(url);
}

/**
 * True when the image a teaser surface is about to render is a stock/places REFERENCE image and
 * must therefore carry the `reference photo` chip. Checks the explicit `source` column first
 * (when a surface carries one), then falls back to the host of the URL itself. An attributed
 * real photo (non-stock host, no stock source) returns false. Absent image ⇒ false.
 */
export function isReferencePhoto(args: {
  url?: string | null;
  source?: string | null;
}): boolean {
  const { url, source } = args;
  if (typeof source === "string" && STOCK_SOURCES.has(source.trim().toLowerCase())) return true;
  return isStockPhotoUrl(url);
}
