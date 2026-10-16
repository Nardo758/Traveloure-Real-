// LW-1b (ledger `2026-10-15-lw1b-traveler-signup-switch`): how a door starts a social sign-in. A supply door
// (offering services) names `intent=supply` and the page to come back to; the server keeps both in a short-lived
// session stash for the round trip (server/replit_integrations/auth/signup-intent-stash.ts). A traveler door
// passes nothing. Never an email, never an account id.
import type { SignupIntent } from "@shared/launch-signup";

export function socialSignInHref(base: "/api/login" | "/api/auth/facebook", opts: { intent?: SignupIntent; returnTo?: string } = {}): string {
  const params = new URLSearchParams();
  if (opts.intent === "supply") params.set("intent", "supply");
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
