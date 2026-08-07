/**
 * BookingConfirmationPage
 *
 * Standalone page that handles the Stripe 3DS redirect-back flow.
 * When a card requires 3D Secure authentication Stripe does a full-page
 * redirect to the bank, then redirects back to:
 *   /booking/confirmation?payment_intent=pi_xxx&payment_intent_client_secret=xxx&redirect_status=succeeded|failed|canceled
 *
 * This page reads those URL params, optionally re-fetches the PaymentIntent
 * via the client secret to get the final status, and renders the appropriate
 * success / pending / failure state.
 *
 * It is also used as a generic landing page when there are no URL params
 * (e.g. user navigates here directly) — in that case it redirects to /dashboard.
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { loadStripe } from '@stripe/stripe-js';
import { CheckCircle, AlertCircle, Clock, ArrowRight, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

let _stripePromise: ReturnType<typeof loadStripe> | undefined;
const getStripe = () => {
  if (!_stripePromise) {
    _stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');
  }
  return _stripePromise;
};

type PageState = 'loading' | 'success' | 'processing' | 'failed' | 'canceled' | 'no_params';

interface ConfirmedBookingSummary {
  id: string;
  trackingNumber: string | null;
  totalAmount: string | null;
  serviceId: string | null;
}

export default function BookingConfirmationPage() {
  const [, navigate] = useLocation();
  const [state, setState] = useState<PageState>('loading');
  const [paymentIntentId, setPaymentIntentId] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [confirmedBookings, setConfirmedBookings] = useState<ConfirmedBookingSummary[]>([]);

  // #1053: surface the traveler's confirmation number(s). The TRV-… tracking number was
  // stored on every booking but never shown anywhere post-payment. Best-effort: if this
  // fetch fails the success state still renders (payment truth comes from Stripe above).
  useEffect(() => {
    if (state !== 'success' || !paymentIntentId) return;
    let cancelled = false;
    fetch('/api/my-bookings', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: any[]) => {
        if (cancelled || !Array.isArray(rows)) return;
        setConfirmedBookings(
          rows
            .filter((b) => b?.stripePaymentIntentId === paymentIntentId)
            .map((b) => ({
              id: b.id,
              trackingNumber: b.trackingNumber ?? null,
              totalAmount: b.totalAmount ?? null,
              serviceId: b.serviceId ?? null,
            })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [state, paymentIntentId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirectStatus = params.get('redirect_status');
    const piId = params.get('payment_intent');
    const clientSecret = params.get('payment_intent_client_secret');

    if (!redirectStatus && !piId) {
      // No Stripe params — user navigated here directly
      setState('no_params');
      return;
    }

    if (piId) setPaymentIntentId(piId);

    // Scrub the client secret (and status) from the address bar / history — it has served its
    // purpose once read. Standard Stripe redirect hygiene.
    if (clientSecret) {
      const clean = new URL(window.location.href);
      clean.searchParams.delete('payment_intent_client_secret');
      clean.searchParams.delete('redirect_status');
      window.history.replaceState({}, '', clean.toString());
    }

    // NEVER trust redirect_status alone for success — it is a client-forgeable URL param. When we
    // have the client secret, Stripe's own retrievePaymentIntent below is the source of truth for
    // ALL statuses. redirect_status is only used as a fallback for non-success outcomes when no
    // client secret is available.
    if (!clientSecret) {
      if (redirectStatus === 'failed') {
        setState('failed');
        setErrorMessage('Your payment could not be completed. Please try again with a different card.');
        return;
      }
      if (redirectStatus === 'canceled') {
        setState('canceled');
        return;
      }
      // succeeded (or anything else) without a client secret is unverifiable — don't render a
      // confirmed screen off an unverified param.
      setState('failed');
      setErrorMessage('Unable to verify payment status. Please check your bookings page or your email for confirmation.');
      return;
    }

    // Retrieve the PI from Stripe to get the authoritative status
    {
      getStripe().then(async (stripe) => {
        if (!stripe) { setState('failed'); return; }
        const { paymentIntent, error } = await stripe.retrievePaymentIntent(clientSecret);
        if (error) {
          setState('failed');
          setErrorMessage(error.message || 'Unable to retrieve payment status.');
          return;
        }
        switch (paymentIntent?.status) {
          case 'succeeded':
            setState('success');
            break;
          case 'processing':
            setState('processing');
            break;
          case 'requires_action':
          case 'requires_payment_method':
            setState('failed');
            setErrorMessage('Payment authentication was not completed. Please return to the booking and try again.');
            break;
          case 'canceled':
            setState('canceled');
            break;
          default:
            setState('failed');
            setErrorMessage(`Unexpected payment status: ${paymentIntent?.status}. Please contact support.`);
        }
      }).catch(() => setState('failed'));
      return;
    }
  }, []);

  // Redirect to dashboard immediately if no params
  useEffect(() => {
    if (state === 'no_params') {
      const t = setTimeout(() => navigate('/dashboard'), 2000);
      return () => clearTimeout(t);
    }
  }, [state, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">

        {state === 'loading' && (
          <>
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Confirming your payment…</h1>
            <p className="text-gray-500 text-sm">Please wait while we check the status with your bank.</p>
          </>
        )}

        {state === 'success' && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h1>
            <p className="text-gray-600 mb-2">
              Your payment was successful and your booking is confirmed.
            </p>
            {confirmedBookings.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 text-left" data-testid="confirmation-numbers">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                  {confirmedBookings.length > 1 ? 'Confirmation numbers' : 'Confirmation number'}
                </p>
                {confirmedBookings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between py-1" data-testid={`confirmation-number-${b.id}`}>
                    <span className="font-mono font-semibold text-gray-900 tracking-wider">
                      {b.trackingNumber || b.id}
                    </span>
                    {b.totalAmount && <span className="text-sm text-gray-500">${b.totalAmount}</span>}
                  </div>
                ))}
                <p className="text-xs text-gray-400 mt-2">
                  Keep this number handy — quote it to your provider or support.
                </p>
              </div>
            )}
            {paymentIntentId && (
              <p className="text-xs text-gray-400 font-mono mb-6">
                Ref: {paymentIntentId.substring(0, 24)}…
              </p>
            )}
            <p className="text-sm text-gray-500 mb-8">
              A confirmation email has been sent to you. Check your inbox for vouchers and next steps.
            </p>
            <div className="flex flex-col gap-3">
              <Button
                onClick={() => navigate('/dashboard')}
                className="w-full"
                data-testid="button-go-to-dashboard"
              >
                <Home className="w-4 h-4 mr-2" />
                Go to My Plans
              </Button>
            </div>
          </>
        )}

        {state === 'processing' && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-100 rounded-full mb-6">
              <Clock className="w-10 h-10 text-yellow-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Processing</h1>
            <p className="text-gray-600 mb-6">
              Your payment is being processed. This can take a few minutes for certain payment methods.
              We'll send a confirmation email once it's complete.
            </p>
            {paymentIntentId && (
              <p className="text-xs text-gray-400 font-mono mb-6">
                Ref: {paymentIntentId.substring(0, 24)}…
              </p>
            )}
            <Button
              onClick={() => navigate('/dashboard')}
              className="w-full"
              data-testid="button-go-to-dashboard-processing"
            >
              <Home className="w-4 h-4 mr-2" />
              Go to My Plans
            </Button>
          </>
        )}

        {(state === 'failed' || state === 'canceled') && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-6">
              <AlertCircle className="w-10 h-10 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {state === 'canceled' ? 'Payment Canceled' : 'Payment Failed'}
            </h1>
            <p className="text-gray-600 mb-6">
              {errorMessage ||
                (state === 'canceled'
                  ? 'Your payment was canceled. No charge was made.'
                  : 'Your payment could not be completed. No charge was made.')}
            </p>
            <div className="flex flex-col gap-3">
              <Button
                onClick={() => navigate(-1 as any)}
                data-testid="button-retry-payment"
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Try Again
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/dashboard')}
                data-testid="button-go-to-dashboard-failed"
              >
                Go to My Plans
              </Button>
            </div>
          </>
        )}

        {state === 'no_params' && (
          <>
            <p className="text-gray-500">Redirecting to your dashboard…</p>
          </>
        )}
      </div>
    </div>
  );
}
