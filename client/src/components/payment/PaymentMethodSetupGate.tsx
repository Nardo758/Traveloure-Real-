/**
 * PaymentMethodSetupGate — the signed-in payment-method step
 * (ledger `2026-10-21-signup-payment-step`).
 *
 * Reuses AddCardDialog (the one SetupIntent rail). It is not a third mount of
 * SavePaymentMethodPrompt. Password sign-up and social sign-in both reach it
 * because both end in a session; the password form itself stays free of Stripe.
 *
 * An account created before the ruling gets a dismissible prompt. A newer
 * account is asked to save a method before continuing, and can sign out.
 * `available: false` renders nothing, so a failed list read is not a lock-out.
 * An account still held for email confirmation does not see this step: verify
 * comes first (S-09), and this overlay would cover that screen.
 */
import { useState } from "react";
import { AddCardDialog } from "@/components/payment/AddCardDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useSavedPayment } from "@/hooks/use-saved-payment";
import { emailVerificationHoldRequired } from "@/lib/email-verification-hold";
import {
  EXISTING_ACCOUNT_PAYMENT_PROMPT,
  PAYMENT_METHOD_CHECKING,
  PAYMENT_METHOD_PROMPT_DISMISS,
  PAYMENT_METHOD_STEP_SIGN_OUT,
  REQUIRED_PAYMENT_STEP_BODY,
  REQUIRED_PAYMENT_STEP_SIGNIN_NOTE,
  REQUIRED_PAYMENT_STEP_TITLE,
  accountRequiresSavedMethod,
  paymentMethodSetupMode,
  readPaymentMethodPromptDismissed,
  writePaymentMethodPromptDismissed,
} from "@/lib/payment-method-setup";

export function PaymentMethodSetupGate() {
  const { user, isLoading: userLoading, isAuthenticated, logout, isLoggingOut } = useAuth();
  const termsPending = !!user && (!user.termsAcceptedAt || !user.privacyAcceptedAt);
  const ask = isAuthenticated && !userLoading && !termsPending && !emailVerificationHoldRequired(user);
  const { available, methods, isLoading, isFetching } = useSavedPayment(ask);
  const [dismissed, setDismissed] = useState(() => readPaymentMethodPromptDismissed());

  const requires = accountRequiresSavedMethod(user?.createdAt);
  const listPending = isLoading || (requires && isFetching && methods.length === 0);
  const mode = paymentMethodSetupMode({
    signedIn: ask,
    termsPending: false,
    createdAt: user?.createdAt,
    available,
    isLoading: listPending,
    methodCount: methods.length,
    dismissedThisSession: dismissed,
  });

  if (mode === "hidden") return null;

  if (mode === "checking") {
    return (
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-background px-4"
        data-testid="payment-method-setup-checking"
      >
        <p className="text-sm text-muted-foreground">{PAYMENT_METHOD_CHECKING}</p>
      </div>
    );
  }

  if (mode === "required") {
    return (
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-background/95 px-4"
        data-testid="payment-method-setup-required"
      >
        <div className="w-full max-w-md rounded-2xl border bg-background p-8">
          <h1 className="text-xl font-semibold text-foreground">{REQUIRED_PAYMENT_STEP_TITLE}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{REQUIRED_PAYMENT_STEP_BODY}</p>
          <p className="mt-3 text-sm text-muted-foreground">{REQUIRED_PAYMENT_STEP_SIGNIN_NOTE}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <AddCardDialog />
            <Button
              type="button"
              variant="ghost"
              onClick={() => logout()}
              disabled={isLoggingOut}
              data-testid="button-payment-method-setup-sign-out"
            >
              {PAYMENT_METHOD_STEP_SIGN_OUT}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const dismiss = () => {
    writePaymentMethodPromptDismissed();
    setDismissed(true);
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background px-4 py-3 shadow-lg"
      data-testid="payment-method-setup-prompt"
      role="region"
      aria-label={EXISTING_ACCOUNT_PAYMENT_PROMPT}
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-foreground" data-testid="text-payment-method-setup-prompt">
          {EXISTING_ACCOUNT_PAYMENT_PROMPT}
        </p>
        <AddCardDialog />
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
