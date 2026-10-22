/**
 * Client half of the S-09 hold. The server is the authority (`emailVerificationRequired`
 * on GET /api/auth/user and on login). This only decides whether the signed-in UI
 * stays on the verify screen.
 */
import { EMAIL_VERIFICATION_HOLD_PATH } from "@shared/email-verification-gate";
import { readAuthResponse } from "@/lib/auth-response";

export function emailVerificationHoldRequired(user: object | null | undefined): boolean {
  if (!user || typeof user !== "object") return false;
  return (user as { emailVerificationRequired?: boolean }).emailVerificationRequired === true;
}

export function isEmailVerificationHoldPath(path: string | null | undefined): boolean {
  const bare = (path ?? "").split("?")[0].replace(/\/+$/, "") || "/";
  return bare === EMAIL_VERIFICATION_HOLD_PATH;
}

export type VerificationResendOutcome = "sent" | "rate_limited" | "error";

/** Public resend. The server's 200 body does not say whether the address exists. */
export async function resendVerificationEmail(email: string): Promise<VerificationResendOutcome> {
  try {
    const res = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email }),
    });
    if (res.status === 429) return "rate_limited";
    const read = await readAuthResponse(res);
    if (!res.ok || read.kind === "non-json") return "error";
    return "sent";
  } catch {
    return "error";
  }
}
