/**
 * Sanitize a post-auth return destination so it can never redirect off-site.
 *
 * Attackers can craft values like "https://evil.com", "//evil.com",
 * "/\evil.com" or encoded separator variants that naive prefix checks miss —
 * browsers normalize backslashes into URL authority delimiters. Parsing with
 * the URL constructor against the app origin and requiring an exact origin
 * match catches all of these; we then return only the canonical
 * pathname + search + hash, never the raw input.
 *
 * Returns undefined when the candidate is missing, unparseable, or not
 * same-origin.
 */
export function sanitizeReturnTo(
  raw: string | null | undefined,
  origin: string = window.location.origin,
): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw, origin);
    if (parsed.origin !== origin) return undefined;
    const path = parsed.pathname + parsed.search + parsed.hash;
    // Guard against pathological canonicalizations that still start with "//"
    if (path.startsWith("//") || path.startsWith("/\\")) return undefined;
    return path;
  } catch {
    return undefined;
  }
}
