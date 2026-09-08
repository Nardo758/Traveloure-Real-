/**
 * BookingConfirmation Component
 * Displays booking confirmation after successful payment
 */

import React from 'react';
import { CheckCircle, Download, Mail, Calendar, MapPin, Users, CreditCard, FileText, ExternalLink } from 'lucide-react';
import { useLocation } from 'wouter';

interface BookingItem {
  id: string;
  title: string;
  date: string;
  time?: string;
  location?: string;
  confirmationCode?: string;
  serviceAmount: number;
  /** The provider's WITHHELD commission. Ledger 2026-09-08-legacy-rail-fee: it is NOT part of what
   *  the traveler paid, so a caller that has no traveler-borne fee to show omits it entirely and
   *  the line below does not render. Never zero-filled (§13). */
  platformFee?: number;
  conciergeFee?: number;
  totalAmount: number;
}

interface BookingConfirmationProps {
  bookings: BookingItem[];
  paymentIntentId: string;
  /** What was actually charged, as the SERVER composed it. Undefined ⇒ the caller could not obtain
   *  it, and the "Total Paid" line is omitted with its reason rather than showing a number this
   *  screen invented (§13). */
  totalAmount?: number;
  travelers: number;
  userEmail?: string;
  itineraryId?: string;
  destination?: string;
  conciergeFee?: number;
  /** Σ traveler service fee inside `totalAmount`, server-resolved. Omitted when none was charged. */
  serviceFeeTotal?: number;
  onClose: () => void;
}

export default function BookingConfirmation({
  bookings,
  paymentIntentId,
  totalAmount,
  travelers,
  userEmail,
  itineraryId,
  destination,
  conciergeFee,
  serviceFeeTotal,
  onClose,
}: BookingConfirmationProps) {
  const [, navigate] = useLocation();

  const trackIVisaClick = async () => {
    try {
      await fetch("/api/affiliates/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partner: "ivisa", destination: destination || undefined }),
      });
    } catch {
      // tracking is non-blocking
    }
  };

  const iVisaUrl = destination
    ? `https://www.ivisa.com/apply?country=${encodeURIComponent(destination)}&ref=traveloure`
    : "https://www.ivisa.com/?ref=traveloure";

  const handleDownloadReceipt = () => {
    // TODO: Implement receipt download
    console.log('Download receipt:', paymentIntentId);
  };

  const handleEmailReceipt = () => {
    // TODO: Implement email receipt
    console.log('Email receipt to:', userEmail);
  };

  const handleViewItinerary = () => {
    if (itineraryId) {
      navigate(`/my-itinerary/${itineraryId}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Success Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Booking Confirmed!</h1>
        <p className="text-gray-600">
          Your trip is booked and ready to go. Check your email for details.
        </p>
      </div>

      {/* Confirmation Codes */}
      {bookings.map((booking) => (
        <div key={booking.id} className="bg-white border border-gray-200 rounded-lg p-6 mb-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{booking.title}</h3>
              {/* Ledger 2026-09-08-confirmation-code-is-the-server-s: the code rendered here is
                  the one the SERVER generated and persisted (and emails to the traveler). When it
                  is absent the server has not issued one yet, and this screen SAYS SO rather than
                  filling the space with a plausible-looking string (§13). */}
              {booking.confirmationCode ? (
                <div className="mt-2 inline-flex items-center gap-2 bg-purple-50 text-purple-800 px-3 py-1 rounded-full text-sm font-mono">
                  <span className="font-semibold">Confirmation:</span>
                  {booking.confirmationCode}
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">
                  Your confirmation code is still being issued — it will arrive by email.
                </p>
              )}
            </div>
            <span className="text-lg font-bold text-gray-900">
              ${booking.totalAmount.toFixed(2)}
            </span>
          </div>

          <div className="space-y-2 text-sm text-gray-600">
            {booking.date && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>{new Date(booking.date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}</span>
                {booking.time && <span>at {booking.time}</span>}
              </div>
            )}
            {booking.location && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span>{booking.location}</span>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Payment Summary */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Summary</h3>
        
        <div className="space-y-2 mb-4">
          {bookings.map((booking) => (
            <div key={booking.id} className="flex justify-between text-sm">
              <span className="text-gray-600">{booking.title}</span>
              <span className="text-gray-900 font-medium">
                ${booking.serviceAmount.toFixed(2)}
              </span>
            </div>
          ))}
          
          {bookings.reduce((sum, b) => sum + (b.platformFee ?? 0), 0) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Platform fee</span>
              <span className="text-gray-900 font-medium">
                ${bookings.reduce((sum, b) => sum + (b.platformFee ?? 0), 0).toFixed(2)}
              </span>
            </div>
          )}
          {(serviceFeeTotal ?? 0) > 0 && (
            <div className="flex justify-between text-sm" data-testid="text-service-fee-confirmation">
              <span className="text-gray-600">Service fee</span>
              <span className="text-gray-900 font-medium">${(serviceFeeTotal as number).toFixed(2)}</span>
            </div>
          )}
          {(conciergeFee ?? bookings.reduce((sum, b) => sum + (b.conciergeFee ?? 0), 0)) > 0 && (
            <div className="flex justify-between text-sm" data-testid="text-concierge-fee-confirmation">
              <span className="text-gray-600">
                Destination Concierge booking fee
                <span className="block text-[11px] text-gray-500">powered by local experts</span>
              </span>
              <span className="text-gray-900 font-medium">
                ${(conciergeFee ?? bookings.reduce((sum, b) => sum + (b.conciergeFee ?? 0), 0)).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-gray-300">
          {typeof totalAmount === 'number' ? (
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold text-gray-900">Total Paid</span>
              <span className="text-2xl font-bold text-purple-600" data-testid="text-total-paid">
                ${totalAmount.toFixed(2)}
              </span>
            </div>
          ) : (
            // §13: no server figure reached this screen, so no total is shown — the receipt is the
            // record of what was charged. A computed stand-in here would be a claim about money.
            <p className="text-sm text-gray-600" data-testid="text-total-paid-unavailable">
              Your receipt shows the exact amount charged.
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
          <CreditCard className="w-4 h-4" />
          <span>Payment ID: {paymentIntentId.substring(0, 20)}...</span>
        </div>

        {travelers && (
          <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
            <Users className="w-4 h-4" />
            <span>{travelers} {travelers === 1 ? 'traveler' : 'travelers'}</span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <button
          onClick={handleDownloadReceipt}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 transition font-semibold"
        >
          <Download className="w-5 h-5" />
          Download Receipt
        </button>
        {userEmail && (
          <button
            onClick={handleEmailReceipt}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-semibold"
          >
            <Mail className="w-5 h-5" />
            Email Receipt
          </button>
        )}
      </div>

      {/* iVisa CTA */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg p-5 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-base">Don't forget your visa!</p>
          <p className="text-blue-100 text-sm mt-0.5">
            {destination
              ? `Apply for your ${destination} visa quickly and securely through iVisa.`
              : "Apply for your visa quickly and securely through iVisa."}
          </p>
        </div>
        <a
          href={iVisaUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={trackIVisaClick}
          data-testid="button-ivisa-apply-confirmation"
          className="flex-shrink-0"
        >
          <button className="flex items-center gap-2 bg-white text-blue-700 hover:bg-blue-50 transition font-semibold px-4 py-2 rounded-lg text-sm whitespace-nowrap">
            Apply on iVisa
            <ExternalLink className="w-4 h-4" />
          </button>
        </a>
      </div>

      {/* Next Steps */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">What's Next?</h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start gap-2">
            <span className="text-blue-600">•</span>
            <span>Check your email for detailed booking confirmations and vouchers</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600">•</span>
            <span>Save your confirmation codes - you'll need them for check-in</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600">•</span>
            <span>View your complete itinerary in your dashboard</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600">•</span>
            <span>Contact support if you have any questions or need to make changes</span>
          </li>
        </ul>
      </div>

      {/* View Itinerary Button */}
      {itineraryId && (
        <button
          onClick={handleViewItinerary}
          data-testid="button-view-itinerary"
          className="w-full py-4 bg-primary text-white rounded-lg hover:bg-primary/90 transition font-semibold text-lg shadow-lg hover:shadow-xl mb-3 flex items-center justify-center gap-2"
        >
          <FileText className="w-5 h-5" />
          View Your Traveloure Itinerary
        </button>
      )}

      {/* Close Button */}
      <button
        onClick={onClose}
        data-testid="button-close-confirmation"
        className="w-full py-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-semibold text-lg shadow-lg hover:shadow-xl"
      >
        View My Plans
      </button>
    </div>
  );
}
