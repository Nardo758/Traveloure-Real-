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
import { apiRequest } from '@/lib/queryClient';
import { bookingStatusSentence, parseBookingIdsParam } from '@/lib/booking-confirmation';

// Key selection mirrors the server resolver: in dev, prefer the TEST publishable key.
const _confirmPagePublishableKey = import.meta.env.DEV
  ? (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY_TEST || '')
  : (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');
if (import.meta.env.DEV && _confirmPagePublishableKey && !_confirmPagePublishableKey.startsWith('pk_test_')) {
  throw new Error('Development confirmation requires a Stripe test publishable key');
}
let _stripePromise: ReturnType<typeof loadStripe> | undefined;
const getStripe = () => {
  if (!_stripePromise) {
    _stripePromise = loadStripe(_confirmPagePublishableKey);
  }
  return _stripePromise;
};

type PageState = 'loading' | 'success' | 'processing' | 'failed' | 'canceled' | 'no_params';

export default function BookingConfirmationPage() {
  const [, navigate] = useLocation();
  const [state, setState] = useState<PageState>('loading');
  const [paymentIntentId, setPaymentIntentId] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  // #533: the bookings this payment covered, with the reference and status the SERVER holds —
  // read from bulk-status (owner-scoped), never assumed from the payment having succeeded.
  const [bookingRefs, setBookingRefs] = useState<{ id: string; code: string | null; status: string }[] | null>(null);
  useEffect(() => {
    const ids = parseBookingIdsParam(new URLSearchParams(window.location.search).get('bookings'));
    if (ids.length === 0) return;
    apiRequest('POST', '/api/bookings/bulk-status', { bookingIds: ids })
      .then((r) => r.json())
      .then((body: { statuses?: Record<string, { status: string; confirmationCode: string | null }> }) => {
        setBookingRefs(ids.filter((id) => body.statuses?.[id]).map((id) => ({
          id, code: body.statuses![id].confirmationCode ?? null, status: body.statuses![id].status,
        })));
      })
      .catch(() => setBookingRefs(null));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirectStatus = params.get('redirect_status');
    const piId = params.get('payment_intent');
    const clientSecret = params.get('payment_intent_client_secret');

    if (!redirectStatus && !piId) {
      // No Stripe params — user navigated here directly. A `bookings` list alone (the one-click
      // saved-card path, whose charge already succeeded server-side) still shows its references.
      if (params.get('bookings')) { setState('success'); return; }
      setState('no_params');
      return;
    }

    if (piId) setPaymentIntentId(piId);

    if (redirectStatus === 'succeeded') {
      setState('success');
      return;
    }

    if (redirectStatus === 'failed') {
      setState('failed');
      setErrorMessage('Your payment could not be completed. Please try again with a different card.');
      return;
    }

    if (redirectStatus === 'canceled') {
      setState('canceled');
      return;
    }

    // For any other redirect_status (or missing) try to retrieve the PI to get authoritative status
    if (clientSecret) {
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

    setState('failed');
    setErrorMessage('Unable to determine payment status. Please check your email for confirmation or contact support.');
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
            {/* #533 / #1293: "confirmed" only when the server says so — a request-to-book listing is
                paid but still waiting on the provider. */}
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {bookingRefs && bookingRefs.length > 0 && bookingRefs.every((b) => b.status === 'confirmed') ? 'Booking Confirmed!' : 'Payment received'}
            </h1>
            <p className="text-gray-600 mb-2">
              Your payment was successful.
            </p>
            {bookingRefs && bookingRefs.length > 0 ? (
              <ul className="text-left space-y-2 my-4" data-testid="list-booking-references">
                {bookingRefs.map((b) => (
                  <li key={b.id} className="rounded-lg border border-gray-200 px-3 py-2" data-testid={`booking-ref-${b.id}`}>
                    <p className="text-sm text-gray-700">{bookingStatusSentence(b.status)}</p>
                    {b.code ? (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Reference <span className="font-mono font-semibold text-gray-900" data-testid={`booking-code-${b.id}`}>{b.code}</span>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : paymentIntentId ? (
              <p className="text-xs text-gray-400 font-mono mb-6">
                Payment ref: {paymentIntentId.substring(0, 24)}…
              </p>
            ) : null}
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
