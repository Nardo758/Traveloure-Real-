/**
 * StripeCheckout Component
 * Handles Stripe payment form and processing
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

// Initialize Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
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
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        // Payment successful
        onSuccess(paymentIntent.id);
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
      <div className="border border-gray-200 rounded-lg p-4 bg-white">
        <PaymentElement />
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
        disabled={!stripe || isProcessing}
        className={`
          w-full py-4 rounded-lg font-semibold text-lg transition flex items-center justify-center gap-2
          ${!stripe || isProcessing
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
    stripePromise.then(setStripe);
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
