/**
 * PaymentMethodSetupGate — the signed-in payment-method step
 * (ledger `2026-10-21-signup-payment-step`, amended by
 * `2026-10-22-card-gate-skippable`).
 *
 * Reuses AddCardDialog (the one SetupIntent rail). It is not a third mount of
 * SavePaymentMethodPrompt. Password sign-up and social sign-in both reach it
 * because both end in a session; the password form itself stays free of Stripe.
 *
 * Every account gets the same dismissible prompt. "Not now" hides it until the
 * next sign-in. `available: false` renders nothing, so a failed list read is
 * not a prompt. An account still held for email confirmation does not see this
 * step: verify comes first (S-09), and this overlay would cover that screen.
 *
 * Supply routes and supply accounts skip it (`supplyPaymentGateSkipped`).
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { AddCardDialog } from "@/components/payment/AddCardDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useSavedPayment } from "@/hooks/use-saved-payment";
import { emailVerificationHoldRequired } from "@/lib/email-verification-hold";
import {
  ADD_PAYMENT_METHOD_BUTTON,
  PAYMENT_METHOD_OFFER,
  PAYMENT_METHOD_PROMPT_DISMISS,
  paymentMethodSetupMode,
  readPaymentMethodPromptDismissed,
  supplyPaymentGateSkipped,
  writePaymentMethodPromptDismissed,
} from "@/lib/payment-method-setup";

export function PaymentMethodSetupGate() {
  const [location] = useLocation();
  const { user, isLoading: userLoading, isAuthenticated } = useAuth();
  const termsPending = !!user && (!user.termsAcceptedAt || !user.privacyAcceptedAt);
  const supplySkipped = supplyPaymentGateSkipped({
    pathname: location,
    role: user?.role,
    signupSource: user?.signupSource,
  });
  const ask = isAuthenticated && !userLoading && !termsPending && !emailVerificationHoldRequired(user) && !supplySkipped;
  const { available, methods, isLoading } = useSavedPayment(ask);
  const [dismissed, setDismissed] = useState(() => readPaymentMethodPromptDismissed());

  const mode = paymentMethodSetupMode({
    signedIn: ask,
    termsPending: false,
    available,
    isLoading,
    methodCount: methods.length,
    dismissedThisSession: dismissed,
    pathname: location,
    role: user?.role,
    signupSource: user?.signupSource,
  });

  if (mode !== "prompt") return null;

  const dismiss = () => {
    writePaymentMethodPromptDismissed();
    setDismissed(true);
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background px-4 py-3 shadow-lg"
      data-testid="payment-method-setup-prompt"
      role="region"
      aria-label={PAYMENT_METHOD_OFFER}
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-foreground" data-testid="text-payment-method-setup-prompt">
          {PAYMENT_METHOD_OFFER}
        </p>
        <AddCardDialog triggerLabel={ADD_PAYMENT_METHOD_BUTTON} />
        <Button
          type="button"
          variant="ghost"
          onClick={dismiss}
          data-testid="button-dismiss-payment-method-setup"
        >
          {PAYMENT_METHOD_PROMPT_DISMISS}
        </Button>
      </div>
    </div>
  );
}
