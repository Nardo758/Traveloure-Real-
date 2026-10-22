import { EMAIL_SIGN_IN_REQUIRED_PARAM } from "@shared/email-sign-in-required";
import { sanitizeReturnTo } from "./safe-return-to";

/** Signed-in /login with no safe return path lands here. A signed-out visit does not. */
export const LOGIN_ROUTE_HOME = "/";

export type LoginRouteDecision =
  | { kind: "redirect"; to: string }
  | { kind: "sign-in"; returnTo?: string; emailSignInRequired: boolean };

function readSearch(search: string): URLSearchParams {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(query);
}

/** A return path whose pathname is this route would replace /login with itself. */
function isLoginRoutePath(path: string): boolean {
  const pathname = path.split("?")[0].split("#")[0];
  return /^\/login\/?$/i.test(pathname);
}

function safeReturnTo(raw: string | null, origin?: string): string | undefined {
  const safe = sanitizeReturnTo(raw, origin);
  if (!safe || isLoginRoutePath(safe)) return undefined;
  return safe;
}

/**
 * What /login should do once auth has resolved.
 * Signed out: show sign-in and keep a safe returnTo (query `returnTo`, else `redirect`).
 * Signed in: go to that path, or home. An off-site or /login target is not a destination.
 */
export function decideLoginRoute(
  input: { isSignedIn: boolean; search: string },
  origin?: string,
): LoginRouteDecision {
  const params = readSearch(input.search);
  const returnTo = safeReturnTo(params.get("returnTo") || params.get("redirect"), origin);
  if (input.isSignedIn) {
    return { kind: "redirect", to: returnTo ?? LOGIN_ROUTE_HOME };
  }
  return {
    kind: "sign-in",
    returnTo,
    emailSignInRequired: params.get("error") === EMAIL_SIGN_IN_REQUIRED_PARAM,
  };
}
