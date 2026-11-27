import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";

/** True for the per-action gate's 403, which carries this code in its body. */
export function isEmailVerificationRefusal(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("email_verification_required");
}

/**
 * DX-4 refusal note. Shows the stamped sentence and one resend button; the
 * success and 429 sentences are the only other copy it can render.
 */
export function EmailVerificationRefusal({ className }: { className?: string }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

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
    } catch {
      // The original refusal sentence stays; no new copy.
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
      <button
        type="button"
        onClick={resend}
        disabled={busy}
        data-testid="button-resend-verification"
        className="mt-2 font-semibold underline underline-offset-2 disabled:opacity-60"
      >
        Resend verification email
      </button>
      {status && (
        <p className="mt-2" role="status" data-testid="text-resend-verification-status">
          {status}
        </p>
      )}
    </div>
  );
}
