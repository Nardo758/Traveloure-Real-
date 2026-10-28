/**
 * Row 258. Architect, Oct 27, 2026, 8:35 PM ET: the canonical origin is www.
 * robots.txt and client/index.html cannot import this and carry the literal,
 * pinned by a test.
 */
export const SITE_ORIGIN = "https://www.traveloure.com" as const;

/** `path` must start with `/`. No normalisation. */
export function siteUrl(path: string): string {
  return SITE_ORIGIN + path;
}
