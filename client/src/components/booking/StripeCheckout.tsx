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

// Phase 5: memoized getter — defers loadStripe until first render of a checkout surface.
let _stripePromise: ReturnType<typeof loadStripe> | undefined;
const getStripePromise = () => {
  if (!_stripePromise) {
    _stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');
  }
  return _stripePromise;
};

interface CheckoutFormProps {
  clientSecret: string;
  amount: number;
  bookingIds: string[];
  onSuccess: (paymentIntentId: string) => void;
  onError: (error: string) => void;
}

function CheckoutForm({ clientSecret, amount, bookingIds, onSuccess, onError }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isReady, setIsReady] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !isReady) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/booking/confirmation`,
        },
        redirect: 'if_required',
      });

      if (error) {
        setErrorMessage(error.message || 'Payment failed');
        onError(error.message || 'Payment failed');
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Payment Element */}
      <div className="border border-gray-200 rounded-lg p-4 bg-white min-h-[200px]">
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
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{errorMessage}</p>
        </div>
      )}

      {/* Security Notice */}
      <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
        <Lock className="w-4 h-4" />
        <span>Your payment information is secure and encrypted</span>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!stripe || !isReady || isProcessing}
        className={`
          w-full py-4 rounded-lg font-semibold text-lg transition flex items-center justify-center gap-2
          ${!stripe || !isReady || isProcessing
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

      <p className="text-xs text-center text-gray-500">
        By confirming your payment, you agree to our Terms of Service and Privacy Policy.
      </p>
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
}

export default function StripeCheckout({
  paymentIntent,
  bookingIds,
  onSuccess,
  onError,
  onCancel,
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
    <div className="max-w-md mx-auto">
      {/* Header */}
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Complete Your Booking</h2>
        <p className="text-gray-600">
          Total: <span className="text-2xl font-bold text-purple-600">
            ${(paymentIntent.amount / 100).toFixed(2)}
          </span>
        </p>
      </div>

      {/* Stripe Elements */}
      {stripe && (
        <Elements stripe={stripe} options={options}>
          <CheckoutForm
            clientSecret={paymentIntent.clientSecret}
            amount={paymentIntent.amount}
            bookingIds={bookingIds}
            onSuccess={onSuccess}
            onError={onError}
          />
        </Elements>
      )}

      {/* Cancel Button */}
      <button
        onClick={onCancel}
        className="w-full mt-4 py-3 text-gray-600 hover:text-gray-800 transition font-medium"
      >
        Cancel
      </button>
    </div>
  );
}
