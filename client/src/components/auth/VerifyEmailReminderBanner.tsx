/**
 * Row 149: the one site-wide verify-email reminder, mounted once in App.tsx beside EmailVerificationHoldRedirect and
 * PaymentMethodSetupGate. Shown only to a signed-in account whose `emailVerified` is null.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { VERIFY_REMINDER_COPY as T, resendVerification, showVerifyReminder, type ResendOutcome } from "@/lib/verify-reminder";

export function VerifyEmailReminderBanner({ initialOutcome = null }: { initialOutcome?: ResendOutcome | null }) {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<ResendOutcome | null>(initialOutcome);
  if (!showVerifyReminder(user)) return null;

  const resend = async () => {
    setSending(true);
    setOutcome(await resendVerification());
    setSending(false);
  };

  return (
    <div role="status" className="w-full border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900" data-testid="banner-verify-email">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <span>{T.text}</span>
        <div className="flex flex-wrap items-center gap-3">
          {outcome?.kind === "sent" ? <span data-testid="banner-verify-email-result">{outcome.message}</span> : null}
          {outcome?.kind === "wait" ? <span data-testid="banner-verify-email-result">{T.wait}</span> : null}
          {outcome?.kind === "error" ? <span className="text-red-700" data-testid="banner-verify-email-result">{T.error}</span> : null}
          <Button size="sm" variant="outline" disabled={sending} onClick={resend} data-testid="button-verify-email-resend">
            {sending ? T.sending : T.resend}
          </Button>
        </div>
      </div>
    </div>
  );
}
