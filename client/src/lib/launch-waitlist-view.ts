// LW-1c (ledger `2026-10-16-lw1c-kyoto-waitlist`): the pure rules the waitlist page and the blog CTA read.
// No copy lives here: the page's wording is Marketing's (hand-off Part F) and is a placeholder until it arrives.
import { normalizeSourceRef, normalizeWaitlistSource, type WaitlistSource } from "@shared/launch-waitlist";

/** What GET /api/public/signup-mode answers (LW-1b). Absent or unreadable ⇒ null, and nothing is shown. */
export interface SignupModeView {
  mode: "waitlist" | "open";
  launchMarketSlug: string | null;
}

/**
 * The blog post's waitlist CTA: only in waitlist mode, only on a post about the launch market, and it names the
 * post as the source. Anything unknown ⇒ no CTA (§13 — never a CTA for a market the waitlist is not for).
 */
export function blogWaitlistHref(
  post: { slug: string; marketSlug: string | null },
  signup: SignupModeView | null | undefined,
): string | null {
  if (!signup || signup.mode !== "waitlist" || !signup.launchMarketSlug) return null;
  if (!post.marketSlug || post.marketSlug !== signup.launchMarketSlug) return null;
  const ref = normalizeSourceRef(post.slug);
  const params = new URLSearchParams({ source: "blog" });
  if (ref) params.set("ref", ref);
  return `/${signup.launchMarketSlug}?${params.toString()}`;
}

/** The page's source from its own URL: `?blocked=1` (sent by the sign-up switch) wins, then `?source=`. */
export function waitlistSourceFromSearch(search: string): { source: WaitlistSource; sourceRef: string | null; blocked: boolean } {
  const params = new URLSearchParams(search);
  const blocked = params.get("blocked") === "1";
  return {
    source: blocked ? "signin" : normalizeWaitlistSource(params.get("source") ?? ""),
    sourceRef: normalizeSourceRef(params.get("ref")),
    blocked,
  };
}
