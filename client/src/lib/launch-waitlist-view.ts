// LW-1c (ledger `2026-10-16-lw1c-kyoto-waitlist`): the pure rules the waitlist page and the blog CTA read.
// No copy lives here: the page's wording is Marketing's F1 copy (hand-off Part F), held in the page itself.
import { blogCtaSource, normalizeWaitlistSource, waitlistPageSource } from "@shared/launch-waitlist";

/** What GET /api/public/signup-mode answers (LW-1b). Absent or unreadable ⇒ null, and nothing is shown. */
export interface SignupModeView {
  mode: "waitlist" | "open";
  launchMarketSlug: string | null;
}

/**
 * The blog post's waitlist CTA: only in waitlist mode, only on a post about the launch market, and it names the
 * post as the source (`<market>_blog_cta:<slug>`). It lands on the page's main form (`#join`). Anything unknown ⇒
 * no CTA (§13 — never a CTA for a market the waitlist is not for).
 */
export function blogWaitlistHref(
  post: { slug: string; marketSlug: string | null },
  signup: SignupModeView | null | undefined,
): string | null {
  if (!signup || signup.mode !== "waitlist" || !signup.launchMarketSlug) return null;
  if (!post.marketSlug || post.marketSlug !== signup.launchMarketSlug) return null;
  const source = blogCtaSource(signup.launchMarketSlug, post.slug);
  const query = source ? `?${new URLSearchParams({ source }).toString()}` : "";
  return `/${signup.launchMarketSlug}${query}#join`;
}

/**
 * The page's source from its own URL, checked against the allowlist pattern (anything else is the page's own
 * value), and whether the sign-up switch sent the person here (`?blocked=1`). Unknown market ⇒ no source sent;
 * the server stores the page's value.
 */
export function waitlistSourceFromSearch(search: string, marketSlug: string | null): { source: string | null; blocked: boolean } {
  const params = new URLSearchParams(search);
  const blocked = params.get("blocked") === "1";
  if (!marketSlug) return { source: null, blocked };
  const raw = params.get("source");
  return { source: raw ? normalizeWaitlistSource(raw, marketSlug) : waitlistPageSource(marketSlug), blocked };
}
