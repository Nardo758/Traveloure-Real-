/**
 * StripeCheckout Component
 * Handles Stripe payment form and processing
 * PHASE 5: Stripe init deferred — loadStripe only fires on first mount.
 */

import React, { useState, useEffect } from 'react';
import { loadStripe, Stripe, StripeElements } from '@stripe/stripe-js';
import {
  PaymentElement,
  Elements,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { CreditCard, Lock, AlertCircle } from 'lucide-react';
import { helpArticlePath } from '@shared/help-article-slugs';

// Phase 5: memoized getter — defers loadStripe until first render of a checkout surface.
// Key selection mirrors the server resolver: in dev, prefer the TEST publishable key so the
// client key always matches the server's effective secret key (STRIPE_SECRET_KEY_TEST).
const _stripePublishableKey = import.meta.env.DEV
  ? (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY_TEST || '')
  : (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');
if (import.meta.env.DEV && _stripePublishableKey && !_stripePublishableKey.startsWith('pk_test_')) {
  throw new Error('Development checkout requires a Stripe test publishable key');
}
let _stripePromise: ReturnType<typeof loadStripe> | undefined;
export const getStripePromise = () => {
  if (!_stripePromise) {
    _stripePromise = loadStripe(_stripePublishableKey);
  }
  return _stripePromise;
};

interface CheckoutFormProps {
  clientSecret: string;
  amount: number;
  bookingIds: string[];
  onSuccess: (paymentIntentId: string) => void;
  onError: (error: string) => void;
  singleAttempt?: boolean;
}

/**
 * R162 (ledger `2026-09-27-failed-is-final`): the message a single-attempt form shows once the card was
 * declined. The platform marks that booking `failed`, and `failed` is final — so this PaymentIntent is
 * never confirmed again from this form. A new attempt is a NEW checkout ("Try again" on the plan),
 * which cancels this intent in Stripe before it opens.
 */
export const SINGLE_ATTEMPT_CLOSED_MESSAGE =
  "Your payment didn’t go through, so this payment attempt is closed and nothing was charged. " +
  "Use “Try again” on your plan to start a new payment.";

function CheckoutForm({ clientSecret, amount, bookingIds, onSuccess, onError, singleAttempt }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isReady, setIsReady] = useState(false);
  // R162: once a real attempt was declined, a single-attempt form never re-confirms this intent.
  const [closed, setClosed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !isReady || closed) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          // #533: the bank-redirect return carries the booking ids so the page can show their references.
          return_url: `${window.location.origin}/booking/confirmation${bookingIds.length > 0 ? `?bookings=${encodeURIComponent(bookingIds.join(","))}` : ""}`,
        },
        redirect: 'if_required',
      });

      if (error) {
        // The Payment Element already draws card and field errors. A second banner plus the
        // parent's toast repeats that sentence (payments QA: the decline shown twice, plus
        // Link's own "Please try again"). Link itself stays on — wallets are LD 43.
        const elementShowsIt = error.type === 'card_error' || error.type === 'validation_error';
        // A `validation_error` never reached Stripe (an incomplete card field) — the form stays usable.
        // Anything else is a real attempt on this PaymentIntent; a single-attempt form closes on it.
        if (singleAttempt && error.type !== 'validation_error') {
          setClosed(true);
          setErrorMessage(SINGLE_ATTEMPT_CLOSED_MESSAGE);
        } else if (!elementShowsIt) {
          setErrorMessage(error.message || 'Payment failed');
        }
        if (!elementShowsIt) onError(error.message || 'Payment failed');
      } else if (paymentIntent) {
        if (paymentIntent.status === 'succeeded') {
          onSuccess(paymentIntent.id);
        } else if (paymentIntent.status === 'processing') {
          // Async payment (e.g. bank transfer) — webhook will fire payment_intent.succeeded
          onSuccess(paymentIntent.id);
        } else if (paymentIntent.status === 'requires_action') {
          // 3DS redirect-back landed here without completing — user should check email/banking app
          setErrorMessage(
            'Your bank requires additional verification. Please check your banking app or the email from your bank, then return here to confirm your booking.'
          );
          onError('requires_action');
        } else {
          setErrorMessage(
            `Payment could not be completed (status: ${paymentIntent.status}). Please try again or use a different card.`
          );
          onError(`Unexpected status: ${paymentIntent.status}`);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred');
      onError(err.message || 'An unexpected error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
        {/* Payment Element */}
        <div className="min-h-[200px] rounded-lg border border-gray-200 bg-white p-4">
          <PaymentElement
            onReady={() => setIsReady(true)}
            onLoadError={(error) => {
              setErrorMessage(error.error.message || 'Failed to load payment form');
            }}
          />
          {!isReady && (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
              <span className="ml-2 text-gray-500">Loading payment form...</span>
            </div>
          )}
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm text-red-800">{errorMessage}</p>
              {/* Lane B: opens in a new tab so the traveler never loses this checkout to read it. */}
              <a
                href={helpArticlePath("payment-didnt-go-through")}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-red-800 underline underline-offset-2"
                data-testid="link-checkout-payment-help"
              >
                Payment didn't go through? What happens next
              </a>
            </div>
          </div>
        )}

        {/* Security Notice */}
        <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
          <Lock className="w-4 h-4" />
          <span>Your payment information is secure and encrypted</span>
        </div>
      </div>

      {/* Pinned payment action row: only the payment details above scroll. */}
      <div className="shrink-0 border-t border-gray-200 bg-white pt-4">
        <button
          type="submit"
          disabled={!stripe || !isReady || isProcessing || closed}
          data-testid="button-stripe-pay"
          className={`
            w-full py-4 rounded-lg font-semibold text-lg transition flex items-center justify-center gap-2
            ${!stripe || !isReady || isProcessing || closed
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg hover:shadow-xl'
            }
          `}
        >
          {isProcessing ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              Pay ${(amount / 100).toFixed(2)}
            </>
          )}
        </button>

        <p className="pt-2 text-center text-xs text-gray-500">
          By confirming your payment, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </form>
  );
}

interface StripeCheckoutProps {
  paymentIntent: {
    clientSecret: string;
    paymentIntentId: string;
    amount: number;
  };
  bookingIds: string[];
  onSuccess: (paymentIntentId: string) => void;
  onError: (error: string) => void;
  onCancel: () => void;
  /**
   * R162: close the form after a declined attempt instead of letting the traveler re-confirm the SAME
   * PaymentIntent. The cart checkout leaves this unset so a still-pending booking can retry the same
   * intent (ledger `2026-10-02-checkout-display-equals-charge`). A `failed` attempt stays closed.
   */
  singleAttempt?: boolean;
  /**
   * What this sheet is paying for, from the CALLER (ledger `2026-10-08-optimize-pay-flow`) — every
   * heading is spelled in `@/lib/checkout-headings`; "Complete Your Booking" is a booking's only.
   */
  heading: string;
}

export default function StripeCheckout({
  paymentIntent,
  bookingIds,
  onSuccess,
  onError,
  onCancel,
  singleAttempt,
  heading,
}: StripeCheckoutProps) {
  const [stripe, setStripe] = useState<Stripe | null>(null);

  useEffect(() => {
    getStripePromise().then(setStripe);
  }, []);

  if (!paymentIntent?.clientSecret) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Invalid payment configuration</p>
      </div>
    );
  }

  const options = {
    clientSecret: paymentIntent.clientSecret,
    appearance: {
      theme: 'stripe' as const,
      variables: {
        colorPrimary: '#9333ea', // purple-600
        colorBackground: '#ffffff',
        colorText: '#1f2937',
        colorDanger: '#dc2626',
        fontFamily: 'system-ui, sans-serif',
        spacingUnit: '4px',
        borderRadius: '8px',
      },
    },
  };

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-md flex-col">
      {/* Header */}
      <div className="mb-6 shrink-0 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2" data-testid="stripe-checkout-heading">{heading}</h2>
        <p className="text-gray-600">
          Total: <span className="text-2xl font-bold text-purple-600">
            ${(paymentIntent.amount / 100).toFixed(2)}
          </span>
        </p>
      </div>

      {/* Stripe Elements */}
      {stripe && (
        <div className="min-h-0 flex-1">
          <Elements stripe={stripe} options={options}>
            <CheckoutForm
              clientSecret={paymentIntent.clientSecret}
              amount={paymentIntent.amount}
              bookingIds={bookingIds}
              onSuccess={onSuccess}
              onError={onError}
              singleAttempt={singleAttempt}
            />
          </Elements>
        </div>
      )}

      {/* Cancel Button */}
      <button
        onClick={onCancel}
        className="mt-4 w-full shrink-0 py-3 font-medium text-gray-600 transition hover:text-gray-800"
      >
        Cancel
      </button>
    </div>
  );
}
