// LW-1b (ledger `2026-10-15-lw1b-traveler-signup-switch`; Launch brief ruling 4): the QA sign-up code lets a tester
// create a TRAVELER account by email and password while the platform is in waitlist mode. The code is the
// server-only secret QA_SIGNUP_CODE (set by Leon in Replit Secrets). It is never sent to the client, never logged,
// and compared in constant time over SHA-256 digests so neither content nor length leaks (the internal.routes.ts
// safeEqual pattern). Unset ⇒ no code is ever valid. Social sign-ins get no QA bypass — only the email path reads it.
import crypto from "crypto";

export function qaSignupCodeMatches(supplied: unknown, configured: string | undefined = process.env.QA_SIGNUP_CODE): boolean {
  const want = typeof configured === "string" ? configured : "";
  if (!want) return false;
  if (typeof supplied !== "string" || supplied.length === 0 || supplied.length > 256) return false;
  const a = crypto.createHash("sha256").update(supplied, "utf8").digest();
  const b = crypto.createHash("sha256").update(want, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}
