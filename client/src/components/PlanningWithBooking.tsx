/**
 * PlanningWithBooking - Trip planning flow with integrated booking
 * Flow: Plan Trip → Generate Itinerary → Review & Book → Payment → Confirmation
 */

import React, { useState } from 'react';
import { X, Calendar, Users, MapPin, Sparkles } from 'lucide-react';
import BookingFlowModal from './booking/BookingFlowModal';

const EXPERIENCE_TYPES = [
  { value: 'travel', label: 'Travel', emoji: '✈️', description: 'Leisure vacation' },
  { value: 'wedding', label: 'Wedding', emoji: '💒', description: 'Destination wedding' },
  { value: 'corporate', label: 'Corporate', emoji: '💼', description: 'Business retreat' },
  { value: 'event', label: 'Event', emoji: '🎉', description: 'Special occasion' },
  { value: 'retreat', label: 'Retreat', emoji: '🧘', description: 'Wellness getaway' },
];

interface Destination {
  city: string;
  country: string;
  cityId: string;
}

interface PlanningWithBookingProps {
  isOpen: boolean;
  onClose: () => void;
  initialDestination?: Destination | null;
  mode?: 'single' | 'multi';
  userId: string;
  userEmail?: string;
}

export default function PlanningWithBooking({
  isOpen,
  onClose,
  initialDestination = null,
  mode = 'single',
  userId,
  userEmail,
}: PlanningWithBookingProps) {
  // Form state
  const [destinations, setDestinations] = useState<Destination[]>(
    initialDestination ? [initialDestination] : []
  );
  const [cityInput, setCityInput] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [experienceType, setExperienceType] = useState('travel');
  const [travelers, setTravelers] = useState(2);
  const [specialRequests, setSpecialRequests] = useState('');

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Booking state
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [generatedTripId, setGeneratedTripId] = useState('');

  // Handle form submission
  const handleGenerate = async () => {
    // Validate
    const newErrors: Record<string, string> = {};
    if (destinations.length === 0) {
      newErrors.destinations = 'Please add at least one destination';
    }
    if (!startDate) {
      newErrors.startDate = 'Start date is required';
    }
    if (!endDate) {
      newErrors.endDate = 'End date is required';
    }
    if (new Date(startDate) >= new Date(endDate)) {
      newErrors.dates = 'End date must be after start date';
    }
    if (new Date(startDate) < new Date()) {
      newErrors.startDate = 'Start date must be in the future';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);
    setError('');

    try {
      // Call AI API to generate itinerary
      const response = await fetch('/api/ai/generate-itinerary/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinations,
          startDate,
          endDate,
          experienceType,
          travelers,
          specialRequests,
          mode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate itinerary');
      }

      const data = await response.json();
      
      // Convert itinerary items to cart items
      const items = convertItineraryToCartItems(data.itinerary, data.tripId);
      
      setCartItems(items);
      setGeneratedTripId(data.tripId);
      
      // Open booking modal
      setShowBookingModal(true);

    } catch (err: any) {
      console.error('Error generating itinerary:', err);
      setError(err.message || 'Failed to generate itinerary. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Convert AI-generated itinerary to bookable cart items
  const convertItineraryToCartItems = (itinerary: any, tripId: string) => {
    if (!itinerary || !itinerary.items) return [];

    return itinerary.items
      .filter((item: any) => item.bookable !== false) // Only include bookable items
      .map((item: any, index: number) => ({
        id: item.id || `item-${index}`,
        tripId: tripId,
        providerId: item.providerId || undefined,
        title: item.title || item.name || 'Untitled Activity',
        itemType: item.type || item.category || 'activities',
        bookingType: item.bookingType || 'instant', // instant, request, or external
        date: item.date || startDate,
        time: item.time || '09:00',
        price: item.price || item.estimatedPrice || 0,
        location: item.location || destinations[0]?.city || '',
        metadata: {
          description: item.description,
          duration: item.duration,
          originalData: item,
        },
      }));
  };

  // Add destination
  const handleAddDestination = () => {
    if (!cityInput.trim()) return;

    const parts = cityInput.split(',').map((s) => s.trim());
    const city = parts[0];
    const country = parts[1] || '';
    const cityId = `${city.toLowerCase().replace(/\s+/g, '-')}-${country.toLowerCase().substring(0, 2)}`;

    setDestinations([...destinations, { city, country, cityId }]);
    setCityInput('');
  };

  const removeDestination = (index: number) => {
    setDestinations(destinations.filter((_, i) => i !== index));
  };

  // Calculate trip length
  const getSuggestedDays = () => {
    if (!startDate || !endDate) return '';
    const days = Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    return days > 0 ? `${days} days` : '';
  };

  // Handle booking completion
  const handleBookingClose = () => {
    setShowBookingModal(false);
    onClose(); // Close planning modal too
    // Optionally navigate to trips page
    window.location.href = '/my-trips';
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Planning Modal */}
      {!showBookingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center rounded-t-2xl">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-purple-600" />
                  Plan Your Perfect Trip
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {mode === 'multi' ? 'Multi-city adventure' : 'Single destination'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Form */}
            <div className="px-6 py-6 space-y-6">
              {/* Destinations */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <MapPin className="w-4 h-4" />
                  Destination{mode === 'multi' ? 's' : ''}
                </label>

                {destinations.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {destinations.map((dest, index) => (
                      <div
                        key={index}
                        className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm flex items-center gap-2"
                      >
                        {dest.city}
                        {dest.country && `, ${dest.country}`}
                        {(mode === 'multi' || destinations.length > 1) && (
                          <button
                            onClick={() => removeDestination(index)}
                            className="hover:text-purple-900"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {(mode === 'multi' || destinations.length === 0) && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={cityInput}
                      onChange={(e) => setCityInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddDestination()}
                      placeholder="City, Country (e.g., Tokyo, Japan)"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    <button
                      onClick={handleAddDestination}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                    >
                      Add
                    </button>
                  </div>
                )}

                {errors.destinations && (
                  <p className="text-red-500 text-sm mt-1">{errors.destinations}</p>
                )}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <Calendar className="w-4 h-4" />
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  {errors.startDate && (
                    <p className="text-red-500 text-sm mt-1">{errors.startDate}</p>
                  )}
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <Calendar className="w-4 h-4" />
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate || new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  {errors.endDate && (
                    <p className="text-red-500 text-sm mt-1">{errors.endDate}</p>
                  )}
                </div>
              </div>

              {getSuggestedDays() && (
                <p className="text-sm text-gray-600">
                  Trip length: <span className="font-semibold">{getSuggestedDays()}</span>
                </p>
              )}

              {errors.dates && <p className="text-red-500 text-sm">{errors.dates}</p>}

              {/* Experience Type */}
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-3 block">
                  What type of experience?
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {EXPERIENCE_TYPES.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setExperienceType(type.value)}
                      className={`
                        px-4 py-3 rounded-lg border-2 transition text-left
                        ${
                          experienceType === type.value
                            ? 'border-purple-600 bg-purple-50 text-purple-900'
                            : 'border-gray-200 hover:border-purple-300'
                        }
                      `}
                    >
                      <div className="text-2xl mb-1">{type.emoji}</div>
                      <div className="font-semibold text-sm">{type.label}</div>
                      <div className="text-xs text-gray-600">{type.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Travelers */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Users className="w-4 h-4" />
                  Number of Travelers
                </label>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setTravelers(Math.max(1, travelers - 1))}
                    className="w-10 h-10 rounded-full border-2 border-gray-300 hover:border-purple-600 transition flex items-center justify-center text-xl font-bold"
                  >
                    −
                  </button>
                  <span className="text-2xl font-semibold w-12 text-center">{travelers}</span>
                  <button
                    onClick={() => setTravelers(Math.min(50, travelers + 1))}
                    className="w-10 h-10 rounded-full border-2 border-gray-300 hover:border-purple-600 transition flex items-center justify-center text-xl font-bold"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Special Requests */}
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 block">
                  Special Requests{' '}
                  <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  placeholder="Dietary restrictions, accessibility needs, interests, budget preferences..."
                  maxLength={500}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {specialRequests.length}/500 characters
                </p>
              </div>

              {/* Error Display */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 rounded-b-2xl flex justify-between items-center">
              <button
                onClick={onClose}
                className="px-6 py-2 text-gray-700 hover:text-gray-900 transition font-medium"
                disabled={isLoading}
              >
                Cancel
              </button>

              <button
                onClick={handleGenerate}
                disabled={isLoading || destinations.length === 0}
                className={`
                  px-8 py-3 rounded-lg font-semibold transition flex items-center gap-2
                  ${
                    isLoading || destinations.length === 0
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg hover:shadow-xl'
                  }
                `}
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate & Book Trip
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Modal */}
      {showBookingModal && cartItems.length > 0 && (
        <BookingFlowModal
          isOpen={showBookingModal}
          onClose={handleBookingClose}
          cartItems={cartItems}
          tripData={{
            destinations,
            startDate,
            endDate,
            travelers,
            experienceType,
          }}
          userId={userId}
          userEmail={userEmail}
        />
      )}
    </>
  );
}
