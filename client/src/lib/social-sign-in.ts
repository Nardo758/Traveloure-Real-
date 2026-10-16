// LW-1b (ledger `2026-10-15-lw1b-traveler-signup-switch`): how a door starts a social sign-in. A supply door
// (offering services) names `intent=supply` and the page to come back to; the server keeps both in a short-lived
// session stash for the round trip (server/replit_integrations/auth/signup-intent-stash.ts). A traveler door
// passes nothing. Never an email, never an account id.
import type { SignupIntent } from "@shared/launch-signup";

export function socialSignInHref(base: "/api/login" | "/api/auth/facebook", opts: { intent?: SignupIntent; returnTo?: string; source?: string | null } = {}): string {
  const params = new URLSearchParams();
  if (opts.intent === "supply") params.set("intent", "supply");
  // LW-1d: a supply door's `?source=` tag rides the round trip; the server normalizes it (raw here, never trusted).
  if (opts.intent === "supply" && opts.source) params.set("source", opts.source);
  if (opts.returnTo && opts.returnTo.startsWith("/") && !opts.returnTo.startsWith("//")) params.set("returnTo", opts.returnTo);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

/** The become-expert page's own address with the influencer/Facebook markers it reads on return. */
export function facebookReturnPath(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.set("influencer", "true");
  params.set("auth", "facebook");
  return `${pathname}?${params.toString()}`;
}

/**
 * LW-1d: the raw `?source=` tag on the page a supply sign-up starts from (`ig_dm`, `kyoto_waitlist_page`, …), or
 * null. Sent as-is; the server's `normalizeSignupSource` decides what is stored.
 */
export function supplySourceTag(search: string): string | null {
  const v = new URLSearchParams(search).get("source");
  return v && v.trim() ? v.trim().slice(0, 200) : null;
}
