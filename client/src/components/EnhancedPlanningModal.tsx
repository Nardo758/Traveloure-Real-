/**
 * EnhancedPlanningModal - Proper integration with existing itinerary framework
 * Features:
 * - Progressive disclosure (only show relevant fields)
 * - Full user profiling (pace, dietary, mobility, budget, interests)
 * - Integrates with /api/ai/generate-itinerary
 * - Triggers optimization for 2 variants
 * - Redirects to comparison page
 */

import React, { useState } from 'react';
import { X, Calendar, Users, MapPin, Sparkles, ChevronDown, ChevronRight, Settings, Heart, Utensils, Accessibility, DollarSign, Target, AlertCircle } from 'lucide-react';
import { useLocation } from 'wouter';

const EXPERIENCE_TYPES = [
  { value: 'travel', label: 'Travel', emoji: '✈️', description: 'Leisure vacation' },
  { value: 'wedding', label: 'Wedding', emoji: '💒', description: 'Destination wedding' },
  { value: 'corporate', label: 'Corporate', emoji: '💼', description: 'Business retreat' },
  { value: 'event', label: 'Event', emoji: '🎉', description: 'Special occasion' },
  { value: 'retreat', label: 'Retreat', emoji: '🧘', description: 'Wellness getaway' },
];

const PACE_OPTIONS = [
  { value: 'relaxed', label: 'Relaxed', description: '2-3 activities per day, lots of free time', emoji: '🌴' },
  { value: 'moderate', label: 'Moderate', description: '3-4 activities per day, balanced pace', emoji: '🚶' },
  { value: 'packed', label: 'Packed', description: '5+ activities per day, maximize experiences', emoji: '⚡' },
];

const INTERESTS = [
  { value: 'museums', label: 'Museums & Culture', emoji: '🏛️' },
  { value: 'food', label: 'Food & Dining', emoji: '🍽️' },
  { value: 'nightlife', label: 'Nightlife & Entertainment', emoji: '🎭' },
  { value: 'nature', label: 'Nature & Outdoors', emoji: '🌲' },
  { value: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { value: 'adventure', label: 'Adventure & Sports', emoji: '🏔️' },
  { value: 'history', label: 'Historical Sites', emoji: '🏰' },
  { value: 'wellness', label: 'Wellness & Spa', emoji: '💆' },
];

const DIETARY_OPTIONS = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'gluten-free', label: 'Gluten-free' },
  { value: 'halal', label: 'Halal' },
  { value: 'kosher', label: 'Kosher' },
  { value: 'dairy-free', label: 'Dairy-free' },
  { value: 'nut-allergy', label: 'Nut allergy' },
];

const MOBILITY_OPTIONS = [
  { value: 'wheelchair', label: 'Wheelchair accessible required' },
  { value: 'limited-walking', label: 'Limited walking distance' },
  { value: 'no-stairs', label: 'Avoid stairs/steep inclines' },
  { value: 'none', label: 'No restrictions' },
];

const BUDGET_TIERS = [
  { value: 'budget', label: 'Budget', description: 'Cost-effective options', range: '$' },
  { value: 'moderate', label: 'Moderate', description: 'Quality at fair prices', range: '$$' },
  { value: 'luxury', label: 'Luxury', description: 'Premium experiences', range: '$$$' },
];

interface Destination {
  city: string;
  country: string;
  cityId: string;
}

interface EnhancedPlanningModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDestination?: Destination | null;
  mode?: 'single' | 'multi';
  userId: string;
}

export default function EnhancedPlanningModal({
  isOpen,
  onClose,
  initialDestination = null,
  mode = 'single',
  userId,
}: EnhancedPlanningModalProps) {
  const [, setLocation] = useLocation();

  // Basic form state
  const [destinations, setDestinations] = useState<Destination[]>(
    initialDestination ? [initialDestination] : []
  );
  const [cityInput, setCityInput] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [experienceType, setExperienceType] = useState('travel');
  const [travelers, setTravelers] = useState(2);

  // Progressive disclosure toggles
  const [showPreferences, setShowPreferences] = useState(false);
  const [showDietary, setShowDietary] = useState(false);
  const [showMobility, setShowMobility] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [showInterests, setShowInterests] = useState(false);

  // Profiling fields
  const [pacePreference, setPacePreference] = useState<string>('moderate');
  const [mustSeeAttractions, setMustSeeAttractions] = useState('');
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([]);
  const [mobilityConsiderations, setMobilityConsiderations] = useState<string[]>(['none']);
  const [budgetTier, setBudgetTier] = useState<string>('moderate');
  const [interests, setInterests] = useState<string[]>([]);
  const [specialRequests, setSpecialRequests] = useState('');

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Handle destination management
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

  // Toggle interest
  const toggleInterest = (value: string) => {
    setInterests(prev =>
      prev.includes(value) ? prev.filter(i => i !== value) : [...prev, value]
    );
  };

  // Toggle dietary
  const toggleDietary = (value: string) => {
    setDietaryRestrictions(prev =>
      prev.includes(value) ? prev.filter(d => d !== value) : [...prev, value]
    );
  };

  // Toggle mobility
  const toggleMobility = (value: string) => {
    if (value === 'none') {
      setMobilityConsiderations(['none']);
    } else {
      setMobilityConsiderations(prev => {
        const withoutNone = prev.filter(m => m !== 'none');
        return withoutNone.includes(value)
          ? withoutNone.filter(m => m !== value)
          : [...withoutNone, value];
      });
    }
  };

  // Calculate trip length
  const getSuggestedDays = () => {
    if (!startDate || !endDate) return '';
    const days = Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    return days > 0 ? `${days} days` : '';
  };

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
      // Call the existing itinerary generation endpoint
      const response = await fetch('/api/ai/generate-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: destinations.map(d => `${d.city}, ${d.country}`).join('; '),
          dates: { start: startDate, end: endDate },
          travelers,
          eventType: experienceType,
          interests: interests.length > 0 ? interests : undefined,
          pacePreference,
          mustSeeAttractions: mustSeeAttractions || undefined,
          dietaryRestrictions: dietaryRestrictions.length > 0 ? dietaryRestrictions : undefined,
          mobilityConsiderations: mobilityConsiderations.includes('none') ? undefined : mobilityConsiderations,
          budget: budgetTier,
          specialRequests: specialRequests || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to generate itinerary');
      }

      const data = await response.json();

      // The backend should create a comparison and return the comparisonId
      if (data.comparisonId) {
        // Close modal and redirect to comparison page
        onClose();
        setLocation(`/itinerary-comparison/${data.comparisonId}`);
      } else if (data.tripId) {
        // Fallback: if only tripId is returned, redirect to trip view
        onClose();
        setLocation(`/trips/${data.tripId}`);
      } else {
        throw new Error('No comparison or trip ID returned from server');
      }

    } catch (err: any) {
      console.error('Error generating itinerary:', err);
      setError(err.message || 'Failed to generate itinerary. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center rounded-t-2xl z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-purple-600" />
              Plan Your Perfect Trip
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Tell us about your trip and we'll create personalized itineraries
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
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
                      <button onClick={() => removeDestination(index)} className="hover:text-purple-900">
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
                  placeholder="City, Country (e.g., Paris, France)"
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
                  className={`px-4 py-3 rounded-lg border-2 transition text-left ${
                    experienceType === type.value
                      ? 'border-purple-600 bg-purple-50 text-purple-900'
                      : 'border-gray-200 hover:border-purple-300'
                  }`}
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

          {/* Progressive Disclosure: Trip Preferences */}
          <div className="border-t border-gray-200 pt-6">
            <button
              onClick={() => setShowPreferences(!showPreferences)}
              className="flex items-center justify-between w-full text-left group"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-gray-600" />
                <span className="font-semibold text-gray-900">Trip Preferences</span>
                <span className="text-sm text-gray-500">(Optional - helps us personalize)</span>
              </div>
              {showPreferences ? (
                <ChevronDown className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
              )}
            </button>

            {showPreferences && (
              <div className="mt-4 space-y-6 pl-7">
                {/* Pace Preference */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-3 block">
                    Travel Pace
                  </label>
                  <div className="grid gap-3">
                    {PACE_OPTIONS.map((pace) => (
                      <button
                        key={pace.value}
                        onClick={() => setPacePreference(pace.value)}
                        className={`px-4 py-3 rounded-lg border-2 transition text-left flex items-center gap-3 ${
                          pacePreference === pace.value
                            ? 'border-purple-600 bg-purple-50'
                            : 'border-gray-200 hover:border-purple-300'
                        }`}
                      >
                        <span className="text-2xl">{pace.emoji}</span>
                        <div className="flex-1">
                          <div className="font-semibold text-sm">{pace.label}</div>
                          <div className="text-xs text-gray-600">{pace.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Must-See Attractions */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <Target className="w-4 h-4" />
                    Must-See Attractions
                  </label>
                  <input
                    type="text"
                    value={mustSeeAttractions}
                    onChange={(e) => setMustSeeAttractions(e.target.value)}
                    placeholder="e.g., Eiffel Tower, Louvre, Notre-Dame"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Separate multiple attractions with commas
                  </p>
                </div>

                {/* Interests Toggle */}
                <div>
                  <button
                    onClick={() => setShowInterests(!showInterests)}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2 hover:text-purple-600 transition"
                  >
                    <Heart className="w-4 h-4" />
                    Interests & Activities
                    {showInterests ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>

                  {showInterests && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {INTERESTS.map((interest) => (
                        <button
                          key={interest.value}
                          onClick={() => toggleInterest(interest.value)}
                          className={`px-3 py-2 rounded-lg border-2 text-sm transition flex items-center gap-2 ${
                            interests.includes(interest.value)
                              ? 'border-purple-600 bg-purple-50 text-purple-900'
                              : 'border-gray-200 hover:border-purple-300'
                          }`}
                        >
                          <span>{interest.emoji}</span>
                          <span>{interest.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Budget Toggle */}
                <div>
                  <button
                    onClick={() => setShowBudget(!showBudget)}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2 hover:text-purple-600 transition"
                  >
                    <DollarSign className="w-4 h-4" />
                    Budget Preference
                    {showBudget ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>

                  {showBudget && (
                    <div className="grid gap-2 mt-2">
                      {BUDGET_TIERS.map((tier) => (
                        <button
                          key={tier.value}
                          onClick={() => setBudgetTier(tier.value)}
                          className={`px-4 py-3 rounded-lg border-2 transition text-left ${
                            budgetTier === tier.value
                              ? 'border-purple-600 bg-purple-50'
                              : 'border-gray-200 hover:border-purple-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-semibold text-sm">{tier.label}</div>
                              <div className="text-xs text-gray-600">{tier.description}</div>
                            </div>
                            <span className="text-lg font-bold text-purple-600">{tier.range}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Dietary Toggle */}
                <div>
                  <button
                    onClick={() => setShowDietary(!showDietary)}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2 hover:text-purple-600 transition"
                  >
                    <Utensils className="w-4 h-4" />
                    Dietary Restrictions
                    {showDietary ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>

                  {showDietary && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {DIETARY_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => toggleDietary(option.value)}
                          className={`px-3 py-2 rounded-lg border-2 text-sm transition ${
                            dietaryRestrictions.includes(option.value)
                              ? 'border-purple-600 bg-purple-50 text-purple-900'
                              : 'border-gray-200 hover:border-purple-300'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Mobility Toggle */}
                <div>
                  <button
                    onClick={() => setShowMobility(!showMobility)}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2 hover:text-purple-600 transition"
                  >
                    <Accessibility className="w-4 h-4" />
                    Accessibility Needs
                    {showMobility ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>

                  {showMobility && (
                    <div className="grid gap-2 mt-2">
                      {MOBILITY_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => toggleMobility(option.value)}
                          className={`px-3 py-2 rounded-lg border-2 text-sm transition text-left ${
                            mobilityConsiderations.includes(option.value)
                              ? 'border-purple-600 bg-purple-50 text-purple-900'
                              : 'border-gray-200 hover:border-purple-300'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Special Requests */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">
              Additional Notes <span className="text-gray-400 font-normal">(Optional)</span>
            </label>
            <textarea
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              placeholder="Any other preferences, requirements, or special requests..."
              maxLength={500}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">{specialRequests.length}/500 characters</p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-900 mb-2">What happens next?</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li className="flex items-start gap-2">
                <span className="text-blue-600">1.</span>
                <span>AI generates a personalized itinerary based on your preferences</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600">2.</span>
                <span>We create 2 optimized alternative versions for you to compare</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600">3.</span>
                <span>You choose your favorite and book with one click</span>
              </li>
            </ul>
          </div>
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
            className={`px-8 py-3 rounded-lg font-semibold transition flex items-center gap-2 ${
              isLoading || destinations.length === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg hover:shadow-xl'
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate Itineraries
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
