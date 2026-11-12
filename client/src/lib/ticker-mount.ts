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

export interface TickerViewer {
  /** True once `/api/auth/user` says there is a member in this session. */
  signedIn?: boolean;
  /**
   * False while the auth read is still in flight. THE RULING (QA round 3, ruling 7): the ribbon is
   * off the TRAVELER path and a member must never see it — so an UNKNOWN viewer is treated as a
   * member and the ribbon is held until auth settles. That costs a guest one round-trip of delay on
   * the marketing pages, which is the trade selected: never flash the ribbon at a member.
   */
  authSettled?: boolean;
}

/**
 * Is the launch-market ribbon mounted here?
 *
 * ONE rule, three questions in order: has auth settled (no ⇒ no ribbon), is the viewer a member
 * (yes ⇒ no ribbon, on every path including `/`), then today's marketing-path test.
 * Called with no viewer it answers the path question alone, which is what the route pins use.
 */
export function showsTicker(location: string, viewer: TickerViewer = {}): boolean {
  if (viewer.authSettled === false) return false;
  if (viewer.signedIn === true) return false;
  const path = (location.split(/[?#]/, 1)[0] || "/").replace(/(.)\/+$/, "$1");
  if (TICKER_MARKETING_PATHS.includes(path)) return true;
  return TICKER_MARKETING_PREFIXES.some((p) => path.startsWith(p) && path.length > p.length && !path.slice(p.length).includes("/"));
}
