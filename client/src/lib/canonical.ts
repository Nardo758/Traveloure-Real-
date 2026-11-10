/**
 * R2-6 — the path a page's canonical should name.
 *
 * The defect: `SEOHead` built its canonical as `url ? SITE_ORIGIN + url : SITE_ORIGIN`, so any page
 * that did not pass `url` — `/earn` and `/pricing` among them — rewrote the canonical to the site
 * ROOT once JS ran, contradicting the server's own self-canonical for the same route.
 *
 * The rule here is the one search engines document: a page is canonical to ITSELF, without its query
 * string or fragment (those are filter/sort/tracking variants of the same page). An explicit `url`
 * prop still wins, because a page may be a duplicate of another address and say so.
 *
 * Pure and dependency-free on purpose: the component supplies `window.location.pathname`.
 */

/** Trailing slashes are removed; the root stays "/". */
function normalizePath(pathname: string): string {
  if (!pathname.startsWith("/")) return ""; // not a path we can trust
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/**
 * The canonical PATH (no origin) for one page.
 * - an explicit `url` wins, normalized the same way;
 * - otherwise the current pathname, minus query/hash (the caller passes pathname only);
 * - a value that is not a path (empty, protocol-relative, absolute URL) falls back to "/".
 */
export function canonicalPath(url: string | null | undefined, pathname: string | null | undefined): string {
  const explicit = (url ?? "").trim();
  if (explicit) {
    // A caller that passes an absolute URL is not our business to rewrite — but a canonical must be
    // ONE shape, so an absolute URL is reduced to its path.
    try {
      const asUrl = new URL(explicit, "https://placeholder.invalid");
      return normalizePath(asUrl.pathname) || "/";
    } catch {
      return "/";
    }
  }
  const current = (pathname ?? "").trim();
  return current ? normalizePath(current) || "/" : "/";
}
