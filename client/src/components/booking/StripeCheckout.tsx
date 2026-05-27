/**
 * StripeCheckout Component
 * Handles Stripe payment form and processing
 */

import React, { useState, useEffect, useRef } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import {
  PaymentElement,
  Elements,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Lock, AlertCircle } from 'lucide-react';

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

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (error) {
      setErrorMessage(error.message || 'Payment failed');
      onError(error.message || 'Payment failed');
      setIsProcessing(false);
    } else if (paymentIntent?.status === 'succeeded') {
      onSuccess(paymentIntent.id);
    } else {
      setErrorMessage('Payment could not be completed. Please try again.');
      onError('Payment could not be completed');
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <PaymentElement
          onReady={() => setIsReady(true)}
          options={{ layout: 'tabs' }}
        />
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !isReady || isProcessing}
        data-testid="button-pay-now"
        className="w-full py-4 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
      >
        <Lock className="w-4 h-4" />
        {isProcessing ? 'Processing...' : `Pay $${(amount / 100).toFixed(2)}`}
      </button>

      <p className="text-center text-xs text-gray-500 flex items-center justify-center gap-1">
        <Lock className="w-3 h-3" />
        Secured by Stripe
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

// Fetch the publishable key from the server (ensures it matches the secret key)
async function getStripePublishableKey(): Promise<string> {
  try {
    const res = await fetch('/api/stripe/config');
    const data = await res.json();
    if (data.publishableKey) return data.publishableKey;
  } catch {}
  return import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
}

export default function StripeCheckout({
  paymentIntent,
  bookingIds,
  onSuccess,
  onError,
  onCancel,
}: StripeCheckoutProps) {
  // Store a stable Stripe promise — only create once per key
  const stripePromiseRef = useRef<ReturnType<typeof loadStripe> | null>(null);
  const [stripeReady, setStripeReady] = useState(false);
  const [keyError, setKeyError] = useState(false);

  useEffect(() => {
    if (stripePromiseRef.current) { setStripeReady(true); return; }
    getStripePublishableKey().then(key => {
      if (!key) { setKeyError(true); return; }
      stripePromiseRef.current = loadStripe(key);
      setStripeReady(true);
    });
  }, []);

  if (!paymentIntent?.clientSecret) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Invalid payment configuration</p>
      </div>
    );
  }

  if (keyError) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Payment system not configured. Please contact support.</p>
      </div>
    );
  }

  if (!stripeReady || !stripePromiseRef.current) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Loading payment form...</p>
      </div>
    );
  }

  const options = {
    clientSecret: paymentIntent.clientSecret,
    appearance: {
      theme: 'stripe' as const,
      variables: {
        colorPrimary: '#9333ea',
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
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Complete Your Booking</h2>
        <p className="text-gray-600">
          Total: <span className="text-2xl font-bold text-purple-600">
            ${(paymentIntent.amount / 100).toFixed(2)}
          </span>
        </p>
      </div>

      <Elements stripe={stripePromiseRef.current} options={options}>
        <CheckoutForm
          clientSecret={paymentIntent.clientSecret}
          amount={paymentIntent.amount}
          bookingIds={bookingIds}
          onSuccess={onSuccess}
          onError={onError}
        />
      </Elements>

      <button
        onClick={onCancel}
        data-testid="button-cancel-payment"
        className="w-full mt-4 py-3 text-gray-600 hover:text-gray-800 transition font-medium"
      >
        Cancel
      </button>
    </div>
  );
}
