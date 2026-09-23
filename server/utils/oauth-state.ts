/**
 * OAuth `state` for a connect-an-account flow (board task #1545, ledger `2026-09-23-phase1-security`).
 *
 * Without `state`, an attacker can start an OAuth flow for THEIR Instagram account, stop before the
 * callback, and get a signed-in victim to open the callback URL — linking the attacker's account to
 * the victim's profile (login CSRF). The server now issues a one-time random `state`, keeps it in the
 * victim's own session, and the callback refuses any `state` that does not match it.
 *
 * Pure helpers only; the route owns the session.
 */
import crypto from "crypto";

/** How long an issued `state` stays valid. A liveness window, not a fee or rate (§8). */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface IssuedOAuthState {
  state: string;
  returnTo: string;
  issuedAt: number;
}

export function newOAuthState(): string {
  return crypto.randomBytes(24).toString("hex");
}

/**
 * True only when a state was issued to this session, the callback carries the same value, and it is
 * within the TTL. Constant-time comparison; any missing piece is a refusal, never a pass.
 */
export function isValidOAuthState(
  issued: IssuedOAuthState | null | undefined,
  received: unknown,
  now: number = Date.now(),
): boolean {
  if (!issued || typeof issued.state !== "string" || typeof received !== "string") return false;
  if (!received || received.length !== issued.state.length) return false;
  if (!(now - issued.issuedAt >= 0 && now - issued.issuedAt <= OAUTH_STATE_TTL_MS)) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(issued.state));
}

/**
 * A same-site path to return to after the flow, or `fallback`. Only a plain absolute path is
 * accepted — never a scheme, a host, a protocol-relative `//` or a backslash — so the callback can
 * never be turned into an open redirect.
 */
export function safeReturnPath(candidate: unknown, fallback: string): string {
  if (typeof candidate !== "string") return fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(candidate) || candidate.length > 512) return fallback;
  return candidate;
}
