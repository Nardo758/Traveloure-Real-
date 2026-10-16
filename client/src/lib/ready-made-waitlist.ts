// LW-1d (ledger `2026-10-16-lw1d-source-and-referral`; hand-off Part B "Ready-Made Trip pages while the waitlist is
// on"): what a public Ready-Made Trip page offers in place of buying while traveler sign-up is waitlist-only.
//
// The page already shows only the pre-purchase outline (title, outline, what's included, price — no stops, times or
// exact spots), so waitlist mode changes ONE thing: the buy button becomes a link to the launch market's waitlist.
// The link carries the raw short-link code the visitor arrived with, and nothing else: the SERVER resolves it against
// `short_links` and credits the link's owner only when they authored the trip. A handle or user id is never put in
// the URL. When the mode is open, or the mode cannot be read, the page buys as it always has (the server's purchase
// gate refuses a waitlist-mode purchase on its own).

/** What GET /api/public/signup-mode answers: exactly `{ mode, launchMarketSlug }` (decision-maker, Oct 16, 2026). */
export interface SignupModeRead {
  mode: "waitlist" | "open";
  launchMarketSlug: string | null;
}

/** F4's waitlist-mode button label, word for word. */
export const READY_MADE_WAITLIST_LABEL = "Join the Kyoto waitlist";

const REF_SHAPE = /^[a-z0-9]{1,12}$/;
const SLUG_SHAPE = /^[a-z0-9-]{1,64}$/;

/** The code the visitor arrived with: this page's own `?ref=` first, else the one captured for the session. */
export function arrivalRef(search: string, sessionRef: string | null): string | null {
  const own = new URLSearchParams(search).get("ref");
  for (const candidate of [own, sessionRef]) {
    const v = typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
    if (REF_SHAPE.test(v)) return v;
  }
  return null;
}

/**
 * The waitlist link that replaces the buy button, or null when the page should buy as usual: open mode, an unread
 * mode, or no launch market stated (never a guessed city).
 */
export function readyMadeWaitlistHref(signup: SignupModeRead | null | undefined, ref: string | null): string | null {
  if (!signup || signup.mode !== "waitlist") return null;
  const slug = typeof signup.launchMarketSlug === "string" ? signup.launchMarketSlug.trim().toLowerCase() : "";
  if (!SLUG_SHAPE.test(slug)) return null;
  const query = ref && REF_SHAPE.test(ref) ? `?${new URLSearchParams({ ref }).toString()}` : "";
  return `/${slug}${query}#join`;
}
