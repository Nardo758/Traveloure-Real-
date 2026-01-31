/**
 * BookingConfirmation Component
 * Displays booking confirmation after successful payment
 */

import React from 'react';
import { CheckCircle, Download, Mail, Calendar, MapPin, Users, CreditCard } from 'lucide-react';

interface BookingItem {
  id: string;
  title: string;
  date: string;
  time?: string;
  location?: string;
  confirmationCode?: string;
  serviceAmount: number;
  platformFee: number;
  totalAmount: number;
}

interface BookingConfirmationProps {
  bookings: BookingItem[];
  paymentIntentId: string;
  totalAmount: number;
  travelers: number;
  userEmail?: string;
  onClose: () => void;
}

export default function BookingConfirmation({
  bookings,
  paymentIntentId,
  totalAmount,
  travelers,
  userEmail,
  onClose,
}: BookingConfirmationProps) {
  const handleDownloadReceipt = () => {
    // TODO: Implement receipt download
    console.log('Download receipt:', paymentIntentId);
  };

  const handleEmailReceipt = () => {
    // TODO: Implement email receipt
    console.log('Email receipt to:', userEmail);
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
              {booking.confirmationCode && (
                <div className="mt-2 inline-flex items-center gap-2 bg-purple-50 text-purple-800 px-3 py-1 rounded-full text-sm font-mono">
                  <span className="font-semibold">Confirmation:</span>
                  {booking.confirmationCode}
                </div>
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
          
          {bookings.length > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Platform fee</span>
              <span className="text-gray-900 font-medium">
                ${bookings.reduce((sum, b) => sum + b.platformFee, 0).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-gray-300">
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold text-gray-900">Total Paid</span>
            <span className="text-2xl font-bold text-purple-600">
              ${totalAmount.toFixed(2)}
            </span>
          </div>
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

      {/* Close Button */}
      <button
        onClick={onClose}
        className="w-full py-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-semibold text-lg shadow-lg hover:shadow-xl"
      >
        View My Trips
      </button>
    </div>
  );
}
