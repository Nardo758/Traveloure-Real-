import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { EMAIL_VERIFICATION_REQUIRED_CODE } from "@shared/email-verification-gate";

/** The event the verify page fires after a successful verification. */
export const EMAIL_VERIFIED_EVENT = "traveloure:email-verified";
export const RESEND_FAILED = "Couldn't send the email. Try again.";

/** The server's stable code, read from the JSON body inside apiRequest's message. */
export function emailVerificationCode(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const start = message.indexOf(": ");
  const body = start >= 0 ? message.slice(start + 2) : message;
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    return typeof parsed?.code === "string" ? parsed.code : null;
  } catch {
    return null;
  }
}

/** True only for the stable code, never the sentence. */
export function isEmailVerificationRefusal(error: unknown): boolean {
  return emailVerificationCode(error) === EMAIL_VERIFICATION_REQUIRED_CODE;
}

/**
 * DX-4 refusal note. Shows the stamped sentence and one resend button when the
 * site-wide reminder banner is not already offering resend. The success, 429 and
 * failure sentences are the only other copy it can render.
 */
export function EmailVerificationRefusal({ className }: { className?: string }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const [bannerPresent, setBannerPresent] = useState(false);

  useEffect(() => {
    const check = () => setBannerPresent(!!document.querySelector('[data-testid="banner-verify-email"]'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    const clear = () => setVisible(false);
    window.addEventListener(EMAIL_VERIFIED_EVENT, clear);
    return () => {
      observer.disconnect();
      window.removeEventListener(EMAIL_VERIFIED_EVENT, clear);
    };
  }, []);

  if (!visible) return null;

  const resend = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: user?.email ?? "" }),
      });
      if (res.status === 429) setStatus("Please wait a minute before asking for another email.");
      else if (res.ok) setStatus("Verification email sent. Check your inbox.");
      else setStatus(RESEND_FAILED);
    } catch {
      setStatus(RESEND_FAILED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="alert"
      data-testid="email-verification-refusal"
      className={`rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 ${className ?? ""}`}
    >
      <p>Verify your email to continue.</p>
      {!bannerPresent && (
        <button
          type="button"
          onClick={resend}
          disabled={busy}
          data-testid="button-resend-verification"
          className="mt-2 font-semibold underline underline-offset-2 disabled:opacity-60"
        >
          Resend verification email
        </button>
      )}
      {status && (
        <p className="mt-2" role="status" data-testid="text-resend-verification-status">
          {status}
        </p>
      )}
    </div>
  );
}
