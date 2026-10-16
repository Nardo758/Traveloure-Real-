// LW-1b (ledger `2026-10-15-lw1b-traveler-signup-switch`; Phase 0 sanction 1): a social sign-in's INTENT and
// RETURN PATH survive the OAuth round trip in a short-lived session stash, set when the flow starts
// (GET /api/login, GET /api/auth/facebook) and read by the verify callback and the callback route.
//
//   - `intent=supply` is the only non-traveler value (shared/launch-signup.ts); anything else is a traveler.
//   - `returnTo` is a plain same-site path or nothing (`safeReturnPath` — never an open redirect).
//   - The stash expires with OAUTH_STATE_TTL_MS. A stale or absent stash reads as a traveler with no return path.
//   - It is read BEFORE `req.logIn`, which regenerates the session; the callback route clears it.
//   - It carries no email and no account id. It grants nothing: a stashed `supply` only lets a FIRST-TIME account
//     past the traveler waitlist, exactly as the email path's `intent` does.
import { OAUTH_STATE_TTL_MS, safeReturnPath } from "../../utils/oauth-state";
import { normalizeSignupIntent, type SignupIntent } from "@shared/launch-signup";

const SESSION_KEY = "lw1SignupIntent";

interface StashedIntent {
  intent: SignupIntent;
  returnTo: string | null;
  issuedAt: number;
}

export function stashSignupIntent(req: any, now: number = Date.now()): void {
  if (!req?.session) return;
  const query = req.query ?? {};
  const returnTo = safeReturnPath(query.returnTo, "");
  const stash: StashedIntent = {
    intent: normalizeSignupIntent(query.intent),
    returnTo: returnTo || null,
    issuedAt: now,
  };
  req.session[SESSION_KEY] = stash;
}

function readStash(req: any, now: number): StashedIntent | null {
  const s = req?.session?.[SESSION_KEY] as StashedIntent | undefined;
  if (!s || typeof s.issuedAt !== "number") return null;
  if (!(now - s.issuedAt >= 0 && now - s.issuedAt <= OAUTH_STATE_TTL_MS)) return null;
  return s;
}

export function readSignupIntent(req: any, now: number = Date.now()): SignupIntent {
  return readStash(req, now)?.intent ?? "traveler";
}

/** The stashed return path (or null), clearing the stash. Call before `req.logIn`. */
export function takeStashedReturnTo(req: any, now: number = Date.now()): string | null {
  const s = readStash(req, now);
  if (req?.session) delete req.session[SESSION_KEY];
  return s?.returnTo ?? null;
}
