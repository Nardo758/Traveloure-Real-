/**
 * Express Checkout Element — Apple Pay, Google Pay, and Link on an existing
 * SetupIntent or PaymentIntent sheet (ledger `2026-10-21-saved-method-list-and-express`).
 *
 * `onClick` calls `event.resolve()` immediately. Stripe drops the wallet if that
 * call waits. The button labels are Stripe's.
 *
 * One confirm at a time: if another confirm is already in flight, this returns
 * without `paymentFailed` so the wallet is not told the payment failed when we
 * simply ignored the second press.
 */
import type { MutableRefObject } from "react";
import { ExpressCheckoutElement } from "@stripe/react-stripe-js";
import { expressCheckoutPaymentMethods } from "@shared/saved-payment-method";

export function WalletExpressCheckout({
  link,
  confirmingRef,
  onConfirm,
  onWalletsKnown,
}: {
  link: "auto" | "never";
  confirmingRef: MutableRefObject<boolean>;
  onConfirm: () => Promise<boolean>;
  onWalletsKnown: (available: { applePay: boolean; googlePay: boolean } | null) => void;
}) {
  return (
    <div data-testid="wallet-express-checkout">
      <ExpressCheckoutElement
        options={{
          buttonHeight: 40,
          paymentMethods: expressCheckoutPaymentMethods(link),
        }}
        onClick={(event) => {
          event.resolve();
        }}
        onConfirm={async (event) => {
          if (confirmingRef.current) return;
          confirmingRef.current = true;
          try {
            const ok = await onConfirm();
            if (!ok) event.paymentFailed({ reason: "fail" });
          } catch {
            event.paymentFailed({ reason: "fail" });
          } finally {
            confirmingRef.current = false;
          }
        }}
        onReady={(event) => {
          onWalletsKnown(event.availablePaymentMethods ?? { applePay: false, googlePay: false });
        }}
        onLoadError={() => {
          onWalletsKnown(null);
        }}
      />
    </div>
  );
}
