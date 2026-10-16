// LW-1f (ledger `2026-10-16-lw1f-kyoto-ticker`; hand-off Part A item 7): where the launch-market ribbon is mounted.
// The shared public `Layout` also wraps planning, invite, shared-list and checkout-adjacent pages, so the ribbon is
// limited to the public MARKETING pages named here — never checkout, admin or the signed-in workspace (those use
// other layouts, and the pages below are the only ones that get it). The waitlist page itself is left out: the
// ribbon's own button points there.
export const TICKER_MARKETING_PATHS: readonly string[] = [
  "/",
  "/about",
  "/blog",
  "/careers",
  "/contact",
  "/experiences",
  "/features",
  "/help",
  "/how-it-works",
  "/local-experts",
  "/press",
  "/pricing",
  "/providers",
  "/support",
];
/** Single pages under these get it too (a blog post, a help article). */
export const TICKER_MARKETING_PREFIXES: readonly string[] = ["/blog/", "/help/"];

export function showsTicker(location: string): boolean {
  const path = (location.split(/[?#]/, 1)[0] || "/").replace(/(.)\/+$/, "$1");
  if (TICKER_MARKETING_PATHS.includes(path)) return true;
  return TICKER_MARKETING_PREFIXES.some((p) => path.startsWith(p) && path.length > p.length && !path.slice(p.length).includes("/"));
}
