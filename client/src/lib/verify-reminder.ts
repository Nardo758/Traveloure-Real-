/**
 * Row 149: the site-wide reminder for a signed-in account whose email is not verified. It reads `user.emailVerified`
 * ONLY (ISO string or null from GET /api/auth/user) — never the hold flags. Grandfathered and Facebook accounts have
 * no `emailVerified` and see it too; nothing is special-cased. FOUNDER WORDING REVIEW on the PR.
 */
export const VERIFY_REMINDER_COPY = {
  text: "Please verify your email address.",
  resend: "Resend verification email",
  sending: "Sending…",
  wait: "Please wait before trying again.",
  error: "We couldn't send the email. Try again in a moment.",
} as const;

export function showVerifyReminder(user: { emailVerified?: unknown } | null | undefined): boolean {
  if (!user) return false;
  return user.emailVerified == null;
}

export type ResendOutcome = { kind: "sent"; message: string } | { kind: "wait" } | { kind: "error" };

/**
 * POST /api/auth/send-verification for the session user (no body). The handling copies the verify page's:
 * 429 ⇒ wait; anything else not OK, or no message ⇒ error; 200 ⇒ the server's message, verbatim.
 */
export async function resendVerification(fetchImpl: typeof fetch = fetch): Promise<ResendOutcome> {
  try {
    const res = await fetchImpl("/api/auth/send-verification", { method: "POST", credentials: "include" });
    if (res.status === 429) return { kind: "wait" };
    if (!res.ok) return { kind: "error" };
    const body = await res.json().catch(() => null);
    const message = body && typeof body.message === "string" ? body.message : null;
    return message ? { kind: "sent", message } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
