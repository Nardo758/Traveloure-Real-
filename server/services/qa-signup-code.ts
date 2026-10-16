// LW-1b (ledger `2026-10-15-lw1b-traveler-signup-switch`; Launch brief ruling 4): the QA sign-up code lets a tester
// create a TRAVELER account by email and password while the platform is in waitlist mode. The code is the
// server-only secret QA_SIGNUP_CODE (set by Leon in Replit Secrets). It is never sent to the client, never logged,
// and compared in constant time over SHA-256 digests so neither content nor length leaks (the internal.routes.ts
// safeEqual pattern). Unset ⇒ no code is ever valid. The code only counts for an address on the QA domain
// (`qaSignupAllowed`). Social sign-ins get no QA bypass — only the email path reads it.
import crypto from "crypto";
import { isQaDomainAccount } from "./qa-trip-pass.service";

export function qaSignupCodeMatches(supplied: unknown, configured: string | undefined = process.env.QA_SIGNUP_CODE): boolean {
  const want = typeof configured === "string" ? configured : "";
  if (!want) return false;
  if (typeof supplied !== "string" || supplied.length === 0 || supplied.length > 256) return false;
  const a = crypto.createHash("sha256").update(supplied, "utf8").digest();
  const b = crypto.createHash("sha256").update(want, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * A QA sign-up in waitlist mode needs BOTH an address on the QA domain (QA_ACCOUNT_EMAIL_DOMAIN, through the ONE
 * QA predicate `isQaDomainAccount`) AND the right code (hand-off Part B). The domain alone is not enough — anyone
 * can type a `.test` address — and the code alone does not make a non-QA account. Either unset ⇒ never allowed.
 */
export function qaSignupAllowed(
  email: unknown,
  supplied: unknown,
  opts: { qaDomain?: string | null; configured?: string } = {},
): boolean {
  const qaDomain = "qaDomain" in opts ? opts.qaDomain : process.env.QA_ACCOUNT_EMAIL_DOMAIN;
  const configured = "configured" in opts ? opts.configured : process.env.QA_SIGNUP_CODE;
  if (typeof email !== "string" || !isQaDomainAccount(email, qaDomain)) return false;
  return qaSignupCodeMatches(supplied, configured);
}
