/**
 * BookingFlowModal - Complete booking flow
 * Handles: Planning → [Visa Intake] → Cart Review → Payment → Confirmation
 */

import React, { useState } from 'react';
import { X, ShoppingCart, CreditCard, CheckCircle, Globe, FileText } from 'lucide-react';
import StripeCheckout from './StripeCheckout';
import BookingConfirmation from './BookingConfirmation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface CartItem {
  id: string;
  tripId: string;
  providerId?: string;
  title: string;
  itemType: string;
  bookingType: 'instant' | 'request' | 'external';
  date: string;
  time?: string;
  price: number;
  location: string;
  metadata?: any;
  serviceCategory?: string;
}

interface BookingFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  tripData: {
    destinations: any[];
    startDate: string;
    endDate: string;
    travelers: number;
    experienceType: string;
  };
  userId: string;
  userEmail?: string;
}

type FlowStep = 'visa_intake' | 'review' | 'payment' | 'confirmation';

/** One row of `/api/bookings/bulk-status`. `confirmationCode` is the SERVER's persisted code, and
 *  is null until the server has issued one — null renders as "still coming", never filled in. */
interface BulkBookingStatus {
  status: string;
  confirmationCode: string | null;
}

interface VisaIntakeData {
  passportNationality: string;
  destinationCountry: string;
  travelStartDate: string;
  travelEndDate: string;
  visaType: string;
  specialCircumstances: string;
}

const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia",
  "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Belarus", "Belgium", "Belize",
  "Brazil", "Brunei", "Bulgaria", "Cambodia", "Cameroon", "Canada", "Chile", "China", "Colombia",
  "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Ecuador", "Egypt",
  "Estonia", "Ethiopia", "Finland", "France", "Germany", "Ghana", "Greece", "Guatemala",
  "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy",
  "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kuwait", "Latvia", "Lebanon",
  "Lithuania", "Luxembourg", "Malaysia", "Mexico", "Morocco", "Myanmar", "Nepal",
  "Netherlands", "New Zealand", "Nigeria", "Norway", "Oman", "Pakistan", "Panama", "Peru",
  "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda",
  "Saudi Arabia", "Singapore", "South Africa", "South Korea", "Spain", "Sri Lanka",
  "Sweden", "Switzerland", "Taiwan", "Tanzania", "Thailand", "Turkey", "Uganda", "Ukraine",
  "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan",
  "Venezuela", "Vietnam", "Zimbabwe",
];

const VISA_TYPES = [
  { value: "tourist", label: "Tourist / Holiday" },
  { value: "business", label: "Business" },
  { value: "student", label: "Student" },
  { value: "work", label: "Work" },
  { value: "transit", label: "Transit" },
  { value: "other", label: "Other" },
];

function isVisaAssistanceService(item: CartItem): boolean {
  // Primary: use the authoritative categorySlug resolved server-side from service_categories JOIN
  const serverSlug: string = (item as any).service?.categorySlug ?? "";
  if (serverSlug) {
    return serverSlug === "visa-assistance";
  }
  // Fallback for items built outside the cart API (e.g. visa-help page direct booking)
  return (
    item.serviceCategory === "visa-assistance" ||
    item.serviceCategory === "visa_assistance"
  );
}

export default function BookingFlowModal({
  isOpen,
  onClose,
  cartItems,
  tripData,
  userId,
  userEmail,
}: BookingFlowModalProps) {
  const hasVisaService = cartItems.some(isVisaAssistanceService);
  const [currentStep, setCurrentStep] = useState<FlowStep>(hasVisaService ? 'visa_intake' : 'review');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Visa intake state
  const [visaIntake, setVisaIntake] = useState<VisaIntakeData>({
    passportNationality: "",
    destinationCountry: "",
    travelStartDate: tripData.startDate || "",
    travelEndDate: tripData.endDate || "",
    visaType: "tourist",
    specialCircumstances: "",
  });

  // Payment state
  const [paymentIntent, setPaymentIntent] = useState<any>(null);
  const [bookingIds, setBookingIds] = useState<string[]>([]);

  // Confirmation state
  const [confirmedBookings, setConfirmedBookings] = useState<any[]>([]);
  const [paymentIntentId, setPaymentIntentId] = useState('');

  // What the SERVER said this checkout costs. `/api/bookings/process-cart` composes it with the
  // ONE `composeTravelerCharge` (ledger 2026-09-08-legacy-rail-fee) and returns it as
  // `paymentRequired`, with the traveler service fee inside it reported separately. Nothing on
  // this screen recomputes either number.
  const [chargedTotal, setChargedTotal] = useState<number | null>(null);
  const [serviceFeeTotal, setServiceFeeTotal] = useState(0);
  const [serverBookings, setServerBookings] = useState<any[]>([]);

  // Pricing. The subtotal is the sum of the LINE PRICES and is the whole of the service charge:
  // ledger 2026-09-08-legacy-rail-fee removed the "Platform fee (12%)" line this screen used to
  // quote, because that fee is the provider's commission — withheld from their payout, never a
  // line added to the buyer — and the 12% here was a hardcoded rate besides (§8). The traveler
  // service fee IS charged on top, but it is band-driven, capped and Trip-Pass-suppressible per
  // booking, so this screen cannot know it before the server prices it: it is NOT guessed here
  // (§13), it is stated as pending and shown for real on the payment step.
  const subtotal = cartItems.reduce((sum, item) => sum + item.price, 0);

  const handleProceedToPayment = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/bookings/process-cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          cartItems,
          paymentMethod: 'full',
          bookingMetadata: hasVisaService ? visaIntake : undefined,
        }),
      });

      if (response.status === 409) {
        const errorData = await response.json();
        // Slot was taken by a concurrent booking — surface a clear message and
        // prompt the user to pick a different time rather than a generic error.
        throw new Error(
          errorData.message ||
          'This time slot was just booked by someone else. Please choose another time.'
        );
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process cart');
      }

      const data = await response.json();
      if (data.errors && data.errors.length > 0) {
        throw new Error(data.errors.join(', '));
      }

      setPaymentIntent(data.paymentIntent);
      setBookingIds(data.instantBookings.map((b: any) => b.id));
      // Server-derived, never recomputed here (§14 posture carried to the display).
      setServerBookings(data.instantBookings);
      setChargedTotal(typeof data.paymentRequired === 'number' ? data.paymentRequired : null);
      setServiceFeeTotal(typeof data.travelerFeeTotal === 'number' ? data.travelerFeeTotal : 0);
      setCurrentStep('payment');
    } catch (err: any) {
      console.error('Process cart error:', err);
      setError(err.message || 'Failed to process booking');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * One read of the server's own booking rows. `/api/bookings/bulk-status` answers, per id, the
   * status AND the confirmation code the SERVER generated and persisted
   * (`bookings.confirmation_code` on the legacy rail, `service_bookings.tracking_number` on the
   * cart rail) — the same code the confirmation email carries. This screen reads that code and
   * never mints one of its own (ledger 2026-09-08-confirmation-code-is-the-server-s).
   * A failed or non-ok read yields NO statuses rather than invented ones (§13).
   */
  const fetchBookingStatuses = async (ids: string[]): Promise<Record<string, BulkBookingStatus>> => {
    try {
      const res = await fetch('/api/bookings/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingIds: ids }),
      });
      if (!res.ok) return {};
      const data = await res.json();
      return (data?.statuses ?? {}) as Record<string, BulkBookingStatus>;
    } catch {
      // Ignore network errors — the caller degrades to "no code yet", never to a fabricated one.
      return {};
    }
  };

  /**
   * Poll /api/bookings/bulk-status up to maxAttempts times, waiting delayMs between
   * each attempt, until all bookingIds are confirmed by the webhook.
   * Returns whether all are confirmed, plus the last statuses seen — which carry the server's
   * confirmation codes, so the poll no longer discards the rows it already fetched.
   */
  const pollForWebhookConfirmation = async (
    ids: string[],
    maxAttempts: number = 4,
    delayMs: number = 1200,
  ): Promise<{ confirmed: boolean; statuses: Record<string, BulkBookingStatus> }> => {
    let statuses: Record<string, BulkBookingStatus> = {};
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      const seen = await fetchBookingStatuses(ids);
      if (Object.keys(seen).length > 0) statuses = seen;
      if (ids.length > 0 && ids.every((id) => seen[id]?.status === 'confirmed')) {
        return { confirmed: true, statuses: seen };
      }
    }
    return { confirmed: false, statuses };
  };

  const handlePaymentSuccess = async (paymentIntentIdFromStripe: string) => {
    setIsLoading(true);
    setPaymentIntentId(paymentIntentIdFromStripe);
    try {
      // Primary path: poll for webhook confirmation (up to ~5 seconds total)
      // The Stripe webhook fires server-side and confirms the booking independently.
      const poll = bookingIds.length > 0
        ? await pollForWebhookConfirmation(bookingIds)
        : { confirmed: false, statuses: {} as Record<string, BulkBookingStatus> };
      let statuses = poll.statuses;

      if (!poll.confirmed) {
        // Fallback: webhook hasn't landed yet (local dev, slow delivery, or browser raced ahead).
        // confirm-payment is idempotent — safe to call even if the webhook arrives later.
        console.log('[BookingFlow] Webhook confirmation timed out — using fallback confirm-payment');
        const confirmPromises = bookingIds.map(bookingId =>
          fetch('/api/bookings/confirm-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingId, paymentIntentId: paymentIntentIdFromStripe }),
          })
        );
        await Promise.all(confirmPromises);
        // Re-read after the fallback: confirm-payment is what persists the confirmation code on
        // this rail, so the code exists only now. Merged, never replaced — an id the re-read did
        // not answer keeps whatever the poll already saw.
        if (bookingIds.length > 0) {
          statuses = { ...statuses, ...(await fetchBookingStatuses(bookingIds)) };
        }
      }

      // Ledger 2026-09-08-legacy-rail-fee: the confirmation renders the SERVER's own rows —
      // `serviceAmount` and `totalAmount` as `process-cart` wrote them — instead of re-deriving a
      // per-item 12% platform fee and a per-item share of a concierge fee this rail never charges.
      // Falls back to the cart items only when the server rows are unavailable, and then carries no
      // fee figures at all rather than invented ones (§13).
      // Ledger 2026-09-08-confirmation-code-is-the-server-s: this screen used to hand every row a
      // `TRV`-prefixed code invented in the browser with Math.random(). It looked exactly like the
      // real thing — the server mints its own `TRV` + 10 characters and emails it — so a traveler
      // could quote the browser's code to support and have it mean nothing. The code shown is now
      // the SERVER's, read off the bulk-status rows above; a booking whose code the server has not
      // issued yet carries NONE, and the confirmation screen says it is still coming rather than
      // filling the space (§13).
      setConfirmedBookings(
        (serverBookings.length > 0 ? serverBookings : cartItems.map((i) => ({ ...i, serviceAmount: i.price, totalAmount: i.price }))).map((b: any) => {
          const serverCode = statuses[b.id]?.confirmationCode ?? null;
          return { ...b, confirmationCode: serverCode ?? undefined };
        })
      );
      setCurrentStep('confirmation');
    } catch (err: any) {
      console.error('Confirmation error:', err);
      setError('Payment succeeded but confirmation failed. Please contact support.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleComplete = () => {
    onClose();
    window.location.href = '/my-trips';
  };

  if (!isOpen) return null;

  const stepLabel = (step: FlowStep) => {
    switch (step) {
      case 'visa_intake': return 'Visa Details';
      case 'review': return 'Review Booking';
      case 'payment': return 'Payment';
      case 'confirmation': return 'Confirmed';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex min-h-0 max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between rounded-t-2xl border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              {currentStep === 'visa_intake' && <><Globe className="w-6 h-6 text-blue-600" />Visa Details</>}
              {currentStep === 'review' && <><ShoppingCart className="w-6 h-6 text-purple-600" />Review Your Booking</>}
              {currentStep === 'payment' && <><CreditCard className="w-6 h-6 text-purple-600" />Payment</>}
              {currentStep === 'confirmation' && <><CheckCircle className="w-6 h-6 text-green-600" />Confirmed</>}
            </h2>
            {currentStep === 'review' && (
              <p className="text-sm text-gray-600 mt-1">
                {cartItems.length} {cartItems.length === 1 ? 'item' : 'items'} in cart
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className={`min-h-0 flex-1 px-6 py-6 ${
          currentStep === 'payment' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'
        }`}>

          {/* ── Visa Intake Step ── */}
          {currentStep === 'visa_intake' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                <FileText className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800">
                  Your expert needs these details to prepare your visa assistance. All information is kept confidential.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="passportNationality">Passport Nationality</Label>
                  <Select
                    value={visaIntake.passportNationality}
                    onValueChange={(v) => setVisaIntake(prev => ({ ...prev, passportNationality: v }))}
                  >
                    <SelectTrigger id="passportNationality" data-testid="select-visa-passport">
                      <SelectValue placeholder="Select passport country…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="destinationCountry">Destination Country</Label>
                  <Select
                    value={visaIntake.destinationCountry}
                    onValueChange={(v) => setVisaIntake(prev => ({ ...prev, destinationCountry: v }))}
                  >
                    <SelectTrigger id="destinationCountry" data-testid="select-visa-destination">
                      <SelectValue placeholder="Select destination…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="travelStartDate">Intended Travel Start Date</Label>
                  <Input
                    id="travelStartDate"
                    type="date"
                    value={visaIntake.travelStartDate}
                    onChange={(e) => setVisaIntake(prev => ({ ...prev, travelStartDate: e.target.value }))}
                    data-testid="input-visa-start-date"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="travelEndDate">Intended Travel End Date</Label>
                  <Input
                    id="travelEndDate"
                    type="date"
                    value={visaIntake.travelEndDate}
                    onChange={(e) => setVisaIntake(prev => ({ ...prev, travelEndDate: e.target.value }))}
                    data-testid="input-visa-end-date"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="visaType">Visa Type</Label>
                <Select
                  value={visaIntake.visaType}
                  onValueChange={(v) => setVisaIntake(prev => ({ ...prev, visaType: v }))}
                >
                  <SelectTrigger id="visaType" data-testid="select-visa-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VISA_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="specialCircumstances">Special Circumstances (optional)</Label>
                <Textarea
                  id="specialCircumstances"
                  value={visaIntake.specialCircumstances}
                  onChange={(e) => setVisaIntake(prev => ({ ...prev, specialCircumstances: e.target.value }))}
                  placeholder="Any previous visa rejections, dual nationality, criminal record questions, urgent timelines, or other relevant details…"
                  rows={3}
                  data-testid="textarea-visa-circumstances"
                />
              </div>

              <Button
                onClick={() => setCurrentStep('review')}
                disabled={!visaIntake.passportNationality || !visaIntake.destinationCountry}
                className="w-full bg-primary hover:bg-primary/90 text-white"
                data-testid="button-visa-continue"
              >
                Continue to Review
              </Button>
            </div>
          )}

          {/* ── Review Step ── */}
          {currentStep === 'review' && (
            <div className="space-y-6">
              {/* Visa summary pill if applicable */}
              {hasVisaService && visaIntake.passportNationality && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
                  <Globe className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <div className="text-sm text-blue-800">
                    <span className="font-medium">Visa details:</span> {visaIntake.passportNationality} → {visaIntake.destinationCountry} · {VISA_TYPES.find(t => t.value === visaIntake.visaType)?.label}
                  </div>
                  <button
                    className="ml-auto text-xs text-blue-600 underline hover:text-blue-800"
                    onClick={() => setCurrentStep('visa_intake')}
                  >
                    Edit
                  </button>
                </div>
              )}

              {/* Cart Items */}
              <div className="space-y-4">
                {cartItems.map((item) => (
                  <div
                    key={item.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 transition"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">{item.title}</h3>
                        <p className="text-sm text-gray-600">{item.location}</p>
                      </div>
                      <span className="text-lg font-bold text-gray-900">
                        ${item.price.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span>{new Date(item.date).toLocaleDateString()}</span>
                      {item.time && <span>{item.time}</span>}
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
                        {item.bookingType}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Price Summary */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Price Summary</h3>
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                </div>
                <div className="pt-4 border-t border-gray-300 flex justify-between items-center">
                  <span className="text-lg font-semibold text-gray-900">Services total</span>
                  <span className="text-2xl font-bold text-purple-600" data-testid="text-review-services-total">${subtotal.toFixed(2)}</span>
                </div>
                <p className="mt-2 text-xs text-gray-500" data-testid="text-review-service-fee-note">
                  A service fee is calculated on the next step and shown before you pay.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <button
                onClick={handleProceedToPayment}
                disabled={isLoading || cartItems.length === 0}
                className={`w-full py-4 rounded-lg font-semibold text-lg transition flex items-center justify-center gap-2 ${
                  isLoading || cartItems.length === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg hover:shadow-xl'
                }`}
                data-testid="button-proceed-to-payment"
              >
                {isLoading ? (
                  <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Processing...</>
                ) : (
                  'Proceed to Payment'
                )}
              </button>
            </div>
          )}

          {/* Payment Step */}
          {currentStep === 'payment' && paymentIntent && (
            <StripeCheckout
              paymentIntent={paymentIntent}
              bookingIds={bookingIds}
              onSuccess={handlePaymentSuccess}
              onError={handlePaymentError}
              onCancel={() => setCurrentStep('review')}
            />
          )}

          {/* Confirmation Step */}
          {currentStep === 'confirmation' && (
            <BookingConfirmation
              bookings={confirmedBookings}
              paymentIntentId={paymentIntentId}
              totalAmount={chargedTotal ?? undefined}
              serviceFeeTotal={serviceFeeTotal > 0 ? serviceFeeTotal : undefined}
              travelers={tripData.travelers}
              userEmail={userEmail}
              destination={(() => {
                const dest = tripData.destinations?.[0];
                return dest?.country || dest?.name || dest?.city || "";
              })()}
              onClose={handleComplete}
            />
          )}
        </div>
      </div>
    </div>
  );
}
