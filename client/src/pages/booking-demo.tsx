/**
 * Booking Demo Page
 * Test the complete planning → booking → payment flow
 */

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import PlanningWithBooking from '../components/PlanningWithBooking';

export default function BookingDemo() {
  const [isPlanningOpen, setIsPlanningOpen] = useState(false);

  // Mock user data - replace with real auth
  const userId = 'demo-user-123';
  const userEmail = 'demo@traveloure.com';

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Traveloure Booking Demo</h1>
            <span className="px-4 py-2 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
              Test Mode
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-purple-600 rounded-full mb-6">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-5xl font-bold text-gray-900 mb-4">
            Complete Booking System
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Test the full flow: Plan → AI Generate → Review → Pay → Confirm
          </p>
          <button
            onClick={() => setIsPlanningOpen(true)}
            className="inline-flex items-center gap-3 px-8 py-4 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition shadow-xl hover:shadow-2xl text-lg font-semibold"
          >
            <Sparkles className="w-6 h-6" />
            Start Planning Your Trip
          </button>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white rounded-xl p-6 shadow-lg">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">🗺️</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">AI Trip Planning</h3>
            <p className="text-gray-600 text-sm">
              Enter your destination, dates, and preferences. Our AI generates a custom itinerary.
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">💳</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Stripe Payments</h3>
            <p className="text-gray-600 text-sm">
              Secure payment processing with Stripe. Test with card: 4242 4242 4242 4242
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">✅</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Instant Confirmation</h3>
            <p className="text-gray-600 text-sm">
              Get confirmation codes instantly. Download receipts and email confirmations.
            </p>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-white rounded-xl p-8 shadow-lg">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">How to Test</h3>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold">
                1
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Plan Your Trip</h4>
                <p className="text-gray-600 text-sm">
                  Click "Start Planning" and enter a destination (e.g., Paris, France), dates, and number of travelers.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold">
                2
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Generate Itinerary</h4>
                <p className="text-gray-600 text-sm">
                  AI will generate a custom itinerary. This may take a few seconds.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold">
                3
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Review & Book</h4>
                <p className="text-gray-600 text-sm">
                  Review the items in your cart and click "Proceed to Payment"
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold">
                4
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Pay with Stripe Test Card</h4>
                <p className="text-gray-600 text-sm mb-2">
                  Use these test card details:
                </p>
                <div className="bg-gray-50 rounded p-3 font-mono text-sm">
                  <div><strong>Card:</strong> 4242 4242 4242 4242</div>
                  <div><strong>Expiry:</strong> Any future date (e.g., 12/34)</div>
                  <div><strong>CVC:</strong> Any 3 digits (e.g., 123)</div>
                  <div><strong>ZIP:</strong> Any 5 digits (e.g., 12345)</div>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold">
                5
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Get Confirmation</h4>
                <p className="text-gray-600 text-sm">
                  See your booking confirmation codes and receipt. You're all set!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tech Stack */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500 mb-3">Powered by:</p>
          <div className="flex justify-center gap-4 flex-wrap">
            <span className="px-4 py-2 bg-white rounded-full text-sm font-medium shadow">
              React + TypeScript
            </span>
            <span className="px-4 py-2 bg-white rounded-full text-sm font-medium shadow">
              Stripe Payments
            </span>
            <span className="px-4 py-2 bg-white rounded-full text-sm font-medium shadow">
              Express API
            </span>
            <span className="px-4 py-2 bg-white rounded-full text-sm font-medium shadow">
              Replit Database
            </span>
          </div>
        </div>
      </div>

      {/* Planning Modal */}
      <PlanningWithBooking
        isOpen={isPlanningOpen}
        onClose={() => setIsPlanningOpen(false)}
        mode="single"
        userId={userId}
        userEmail={userEmail}
      />
    </div>
  );
}
