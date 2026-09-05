/**
 * SavePaymentMethodPrompt — the ONE soft prompt of Locked Decision 43(d)
 * (ledger `2026-09-05-payment-method-posture` / `2026-09-05-wallets-on-platform-intents`).
 *
 * LD 43(a) is that signup collects no payment method, ever. This component is the other half of
 * that ruling: the two moments where offering to save one is useful rather than a toll gate —
 * after a Trip Pass purchase, and at Finalize when the plan actually holds bookable rows. It is
 * mounted at those two places and nowhere else, and it must never appear on an auth surface.
 *
 * ONE ADD-CARD RAIL. It opens the EXISTING `AddCardDialog` (H7 SetupIntent) rather than growing a
 * second vaulting path — a second add-card flow would be the derivation-drift class §18 rule 1
 * names, and would be the thing that eventually disagrees with the profile card about what is
 * saved. This component contributes NO Stripe call of its own.
 *
 * §13 — it renders only on a KNOWN-EMPTY vault. `shouldOfferSavePayment` (one predicate, shared,
 * unit-tested) refuses to render while the read is in flight or when the read degraded
 * (`available: false`): not knowing whether a card exists is not the same as knowing none does,
 * and a prompt built on the wrong one of those nags people who already have a card on file.
 *
 * §14: nothing here states, derives or displays an amount. It charges nothing.
 */
import { useState } from "react";
import { CreditCard, X } from "lucide-react";
import { useSavedPayment } from "@/hooks/use-saved-payment";
import { AddCardDialog } from "@/components/payment/AddCardDialog";
import {
  shouldOfferSavePayment,
  readSavePromptDismissed,
  writeSavePromptDismissed,
} from "@/lib/save-payment-prompt";

export interface SavePaymentMethodPromptProps {
  /** Dismissal scope — remembered per trip / per purchase, never globally. */
  scope: string;
  /** The one line of copy for this moment. Ratified wording lives at the call site. */
  message: string;
  /** Caller-side gate (signed in, right moment). False = the component renders nothing at all. */
  enabled?: boolean;
}

export function SavePaymentMethodPrompt({ scope, message, enabled = true }: SavePaymentMethodPromptProps) {
  const { available, methods, isLoading } = useSavedPayment(enabled);
  // Read once per mount: a dismissal taken in this session flips local state below, so the store
  // is never re-read on every render (and a blocked store still resolves to "not dismissed").
  const [dismissed, setDismissed] = useState(() => readSavePromptDismissed(scope));

  if (!enabled) return null;
  if (!shouldOfferSavePayment({ available, isLoading, methodCount: methods.length, dismissed })) {
    return null;
  }

  const dismiss = () => {
    writeSavePromptDismissed(scope);
    setDismissed(true);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3"
      data-testid="save-payment-method-prompt"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
        <CreditCard className="h-4 w-4" />
      </span>
      <p className="min-w-0 flex-1 text-sm text-foreground" data-testid="text-save-payment-prompt">
        {message}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        {/* The one add-card rail (H7 SetupIntent) — this component adds none of its own. */}
        <AddCardDialog />
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          title="Not now"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          data-testid="button-dismiss-save-payment-prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default SavePaymentMethodPrompt;
