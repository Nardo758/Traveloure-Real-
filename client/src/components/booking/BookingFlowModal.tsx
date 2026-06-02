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

  // Pricing
  const subtotal = cartItems.reduce((sum, item) => sum + item.price, 0);
  const platformFee = subtotal * 0.12;
  const total = subtotal + platformFee;

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
      setCurrentStep('payment');
    } catch (err: any) {
      console.error('Process cart error:', err);
      setError(err.message || 'Failed to process booking');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentSuccess = async (paymentIntentIdFromStripe: string) => {
    setIsLoading(true);
    setPaymentIntentId(paymentIntentIdFromStripe);
    try {
      const confirmPromises = bookingIds.map(bookingId =>
        fetch('/api/bookings/confirm-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId, paymentIntentId: paymentIntentIdFromStripe }),
        })
      );
      await Promise.all(confirmPromises);

      setConfirmedBookings(
        cartItems.map((item) => ({
          ...item,
          confirmationCode: `TRV${Math.random().toString(36).substring(2, 12).toUpperCase()}`,
          serviceAmount: item.price,
          platformFee: item.price * 0.12,
          totalAmount: item.price * 1.12,
        }))
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center rounded-t-2xl">
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
        <div className="px-6 py-6">

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
                className="w-full bg-[#FF385C] hover:bg-[#FF385C]/90 text-white"
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
                  <div className="flex justify-between text-gray-600">
                    <span>Platform fee (12%)</span>
                    <span>${platformFee.toFixed(2)}</span>
                  </div>
                </div>
                <div className="pt-4 border-t border-gray-300 flex justify-between items-center">
                  <span className="text-lg font-semibold text-gray-900">Total</span>
                  <span className="text-2xl font-bold text-purple-600">${total.toFixed(2)}</span>
                </div>
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
              totalAmount={total}
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
