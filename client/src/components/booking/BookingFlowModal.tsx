/**
 * BookingFlowModal - Complete booking flow
 * Handles: Planning → Cart Review → Payment → Confirmation
 */

import React, { useState } from 'react';
import { X, ShoppingCart, CreditCard, CheckCircle } from 'lucide-react';
import StripeCheckout from './StripeCheckout';
import BookingConfirmation from './BookingConfirmation';

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

type FlowStep = 'review' | 'payment' | 'confirmation';

export default function BookingFlowModal({
  isOpen,
  onClose,
  cartItems,
  tripData,
  userId,
  userEmail,
}: BookingFlowModalProps) {
  const [currentStep, setCurrentStep] = useState<FlowStep>('review');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Payment state
  const [paymentIntent, setPaymentIntent] = useState<any>(null);
  const [bookingIds, setBookingIds] = useState<string[]>([]);
  
  // Confirmation state
  const [confirmedBookings, setConfirmedBookings] = useState<any[]>([]);
  const [paymentIntentId, setPaymentIntentId] = useState('');
  
  // Pricing state
  const [priceEstimate, setPriceEstimate] = useState<any>(null);

  // Calculate totals
  const subtotal = cartItems.reduce((sum, item) => sum + item.price, 0);
  const platformFee = subtotal * 0.12; // 12% platform fee
  const total = subtotal + platformFee;

  // Fetch price estimate
  const fetchPriceEstimate = async () => {
    try {
      const response = await fetch('/api/bookings/estimate-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripItems: cartItems.map(item => ({
            providerId: item.providerId,
            date: item.date,
            travelers: tripData.travelers,
            category: item.itemType,
          })),
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch estimate');
      
      const data = await response.json();
      setPriceEstimate(data);
    } catch (err) {
      console.error('Price estimate error:', err);
    }
  };

  // Process cart and create payment intent
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

      // Store payment intent and booking IDs
      setPaymentIntent(data.paymentIntent);
      setBookingIds(data.instantBookings.map((b: any) => b.id));

      // Move to payment step
      setCurrentStep('payment');
    } catch (err: any) {
      console.error('Process cart error:', err);
      setError(err.message || 'Failed to process booking');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle payment success
  const handlePaymentSuccess = async (paymentIntentIdFromStripe: string) => {
    setIsLoading(true);
    setPaymentIntentId(paymentIntentIdFromStripe);

    try {
      // Confirm bookings
      const confirmPromises = bookingIds.map(bookingId =>
        fetch('/api/bookings/confirm-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingId,
            paymentIntentId: paymentIntentIdFromStripe,
          }),
        })
      );

      await Promise.all(confirmPromises);

      // Mock confirmed bookings (replace with actual data from API)
      setConfirmedBookings(
        cartItems.map((item, index) => ({
          ...item,
          confirmationCode: `TRV${Math.random().toString(36).substring(2, 12).toUpperCase()}`,
          serviceAmount: item.price,
          platformFee: item.price * 0.12,
          totalAmount: item.price * 1.12,
        }))
      );

      // Move to confirmation
      setCurrentStep('confirmation');
    } catch (err: any) {
      console.error('Confirmation error:', err);
      setError('Payment succeeded but confirmation failed. Please contact support.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle payment error
  const handlePaymentError = (errorMessage: string) => {
    setError(errorMessage);
  };

  // Handle completion
  const handleComplete = () => {
    onClose();
    // Navigate to trips page
    window.location.href = '/trips';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center rounded-t-2xl">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              {currentStep === 'review' && (
                <>
                  <ShoppingCart className="w-6 h-6 text-purple-600" />
                  Review Your Booking
                </>
              )}
              {currentStep === 'payment' && (
                <>
                  <CreditCard className="w-6 h-6 text-purple-600" />
                  Payment
                </>
              )}
              {currentStep === 'confirmation' && (
                <>
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  Confirmed
                </>
              )}
            </h2>
            {currentStep === 'review' && (
              <p className="text-sm text-gray-600 mt-1">
                {cartItems.length} {cartItems.length === 1 ? 'item' : 'items'} in cart
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {/* Review Step */}
          {currentStep === 'review' && (
            <div className="space-y-6">
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
                  <span className="text-2xl font-bold text-purple-600">
                    ${total.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              {/* Continue Button */}
              <button
                onClick={handleProceedToPayment}
                disabled={isLoading || cartItems.length === 0}
                className={`
                  w-full py-4 rounded-lg font-semibold text-lg transition flex items-center justify-center gap-2
                  ${isLoading || cartItems.length === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg hover:shadow-xl'
                  }
                `}
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Proceed to Payment
                  </>
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
              onClose={handleComplete}
            />
          )}
        </div>
      </div>
    </div>
  );
}
