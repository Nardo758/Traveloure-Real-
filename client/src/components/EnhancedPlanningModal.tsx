/**
 * EnhancedPlanningModal — the AI branch's own form, and NOTHING the plan modal already asked.
 *
 * WHAT THIS IS. The "Plan with AI" finish of the ONE planning modal (ledger
 * `2026-09-04-one-modal-many-doors`, CLAUDE.md Locked Decision 33). It generates an itinerary from
 * a plan the traveler has already described, and it asks only the questions the GENERATOR needs
 * and the steps do not collect: pace, must-sees, interests, budget tier, dietary, mobility,
 * special requests.
 *
 * WHAT WAS REMOVED, AND WHY (ledger `2026-09-04-golf-occasion-and-housekeeping`). This form used
 * to ask for the destination, the dates, the occasion and the party a SECOND time. The one-modal
 * lane pre-filled those four from the steps and recorded removing the fields as its own follow-up;
 * this is that follow-up. A pre-filled duplicate is still a duplicate: two editable homes for one
 * answer is the derivation-drift class §18 rule 1 names — a traveler who changed the dates here
 * left the plan modal's copy, the trip context and this form disagreeing, with nothing to say
 * which was meant. So the four basics are now a READ-ONLY summary of what was handed in, with one
 * "change" affordance that goes back to the step that owns the answer.
 *
 * THE "CHANGE" LINK IS NOT A SECOND MODAL. It closes this form and re-opens THE plan modal through
 * the single opener `usePlanning().open(source)` (ruling `2026-08-28-single-planning-entry`,
 * untouched) — the provider owns that call and hands it down as `onChangeBasics`, so this
 * component neither imports the context it is rendered by nor learns the step table. Which step it
 * lands on is `resolvePlanSteps`' answer and no one else's: a plan that already names an occasion
 * re-opens at step 2 (Where), the first of the basics.
 *
 * §13: the summary states only what it was GIVEN. A basic that arrived empty is rendered as "not
 * set" with the change link beside it, never as a fabricated default — with the ONE documented
 * exception of the party count, whose pre-existing `2` fallback is preserved verbatim because the
 * generator has always required a number (see `travelers` below).
 *
 * Other features, unchanged: progressive disclosure of the preference groups, the neighborhood and
 * hidden-gem refinements for a resolved city, `/api/ai/generate-itinerary`, the 2-variant
 * optimization, and the redirect to the comparison page.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Users, MapPin, Sparkles, ChevronDown, ChevronRight, Settings, Heart, Utensils, Accessibility, DollarSign, Target, AlertCircle, Gem, LogIn } from 'lucide-react';
import { useLocation } from 'wouter';
import { useToast } from "@/hooks/use-toast";
import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';
import { readSlipHasItemsRefusal, slipHref, type AiDraftRefusal } from '@/lib/ai-draft-refusal';

/**
 * The five FROZEN coarse occasion keys the generator accepts (ruling `2026-09-01-moment-key`).
 * This is a KEY MAP, no longer a picker: the occasion is chosen on step 1 of the plan modal from
 * the real `experience_types` catalog, and this list only LABELS whichever coarse key arrived. It
 * is deliberately not grown — it is not a second occasion vocabulary (§4 / `shared/occasions.ts`).
 */
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
  cityId: string | null;
}

interface EnhancedPlanningModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDestination?: Destination | null;
  userId: string;
  /** Coarse machine key to prefill (Landing v2.5 Moment CTA). Falls back to 'travel'. */
  initialExperienceType?: string;
  /**
   * What the plan modal already collected (ledger `2026-09-04-one-modal-many-doors`). Since
   * ledger `2026-09-04-golf-occasion-and-housekeeping` these are the ONLY source of the four
   * basics — the duplicate fields that used to ask for them again are gone, and the summary is
   * read-only.
   *
   * §13: each is optional and each falls back to EXACTLY the previous empty/`2` behaviour when
   * the door has no answer — an absent prop is "not stated", never a value.
   */
  initialStartDate?: string;
  initialEndDate?: string;
  initialTravelers?: number;
  /** Fine occasion identity (proposal|golf|…) — rides into the generation prompt so the brief
   *  carries the moment (ruling 2026-09-01-moment-key). */
  momentKey?: string;
  /**
   * Go back and change the basics. THE PROVIDER OWNS THIS CALL — it re-opens the ONE plan modal
   * through `usePlanning().open(source)` (ledger `2026-09-04-golf-occasion-and-housekeeping`), so
   * this component never opens a modal of its own and never decides which step to land on. Absent
   * ⇒ the change affordance is not rendered at all, rather than rendered dead: an affordance that
   * promises a capability nobody wired is the same dishonesty as a disabled control (§13).
   */
  onChangeBasics?: () => void;
}

export default function EnhancedPlanningModal({
  isOpen,
  onClose,
  initialDestination = null,
  userId,
  initialExperienceType,
  initialStartDate,
  initialEndDate,
  initialTravelers,
  momentKey,
  onChangeBasics,
}: EnhancedPlanningModalProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: authUser } = useQuery<{ id: string } | null>({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });
  const isAuthenticated = !!authUser?.id;

  // ── The four basics — HANDED IN, never asked here ────────────────────────────────────────────
  // They are derived straight from the props on every render rather than held in editable state:
  // there is no control that can change them, so a second copy of the value would only be able to
  // go stale (ledger `2026-09-04-golf-occasion-and-housekeeping`).
  const destinations: Destination[] = useMemo(
    () => (initialDestination ? [initialDestination] : []),
    [initialDestination],
  );
  // From the plan modal's When step; empty when the door had no answer — §13, never a made-up date.
  const startDate = initialStartDate ?? '';
  const endDate = initialEndDate ?? '';
  // The coarse machine key the door carried (a landing Moment CTA, or step 1's occasion); 'travel'
  // otherwise, exactly as before.
  const experienceType = initialExperienceType ?? 'travel';
  // From the plan modal's Who step. The pre-existing default of 2 is UNCHANGED for the doors that
  // pass nothing — this modal's generator has always required a count, and that fallback predates
  // this lane. It is the one basic whose empty state is a number, and the summary says so.
  const travelers =
    typeof initialTravelers === 'number' && initialTravelers > 0 ? initialTravelers : 2;
  const travelersStated = typeof initialTravelers === 'number' && initialTravelers > 0;

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
  // LD 41 (b) / ledger `2026-09-05-draft-only-on-empty`: the server refuses a free draft on a slip
  // that already holds items (409 `slip_has_items`). Held as its OWN state, not folded into
  // `error`, because it is not a failure — it is a routing answer that carries a destination.
  const [draftRefusal, setDraftRefusal] = useState<AiDraftRefusal | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // City-derived refinements (neighborhoods + hidden gems). These are AI-only inputs — they
  // narrow the GENERATION, they are not a fifth basic — so they stay.
  const [neighborhoods, setNeighborhoods] = useState<{ id: string; name: string; slug: string; description: string | null }[]>([]);
  const [gems, setGems] = useState<{ id: string; placeName: string; placeType: string | null; description: string | null }[]>([]);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState('');

  /**
   * Fetch the neighborhood/gem refinements for the destination that was handed in.
   *
   * Keyed on the CITY NAME, not on a resolved `cityId`. The typed destination field used to
   * resolve an id through `/api/cities/lookup` before adding a chip, and this effect then required
   * `cityId !== null`; with the field gone the handed-in destination carries no id, so keeping
   * that condition would have silently switched these refinements off for every traveler. Both
   * endpoints already take `?city=<name>` — that is what they were always called with — and a city
   * the catalog does not know answers with an empty list, which renders nothing (§13: the absence
   * of local knowledge is shown by showing none, never by inventing some).
   */
  useEffect(() => {
    const cityName = destinations[0]?.city?.trim();
    if (!cityName) {
      setNeighborhoods([]);
      setGems([]);
      setSelectedNeighborhood('');
      return;
    }
    let cancelled = false;
    Promise.all([
      fetch(`/api/cities/neighborhoods?city=${encodeURIComponent(cityName)}`).then(r => r.json()),
      fetch(`/api/cities/gems?city=${encodeURIComponent(cityName)}&limit=5`).then(r => r.json()),
    ]).then(([nbh, gms]) => {
      if (cancelled) return;
      setNeighborhoods(Array.isArray(nbh) ? nbh : []);
      setGems(Array.isArray(gms) ? gms : []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [destinations]);

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

  // ── The read-only summary's four labels ──────────────────────────────────────────────────────
  // Each says what it was GIVEN and says so plainly when it was given nothing (§13). None of them
  // guesses: an unstated destination reads "no destination yet", not the nearest city.
  const destinationLabel = destinations.length
    ? destinations.map((d) => (d.country ? `${d.city}, ${d.country}` : d.city)).join(' · ')
    : 'No destination yet';
  const datesLabel = startDate && endDate
    ? `${startDate} → ${endDate}${getSuggestedDays() ? ` · ${getSuggestedDays()}` : ''}`
    : 'No dates yet';
  // The ONE place a number stands in for an unstated answer, and it is labelled as such rather
  // than shown as the traveler's own. The `2` fallback itself predates this lane (the generator
  // has always required a count) and is deliberately unchanged.
  const travelersLabel = travelersStated
    ? `${travelers} ${travelers === 1 ? 'traveler' : 'travelers'}`
    : `${travelers} travelers (not stated)`;
  const occasionType = EXPERIENCE_TYPES.find((t) => t.value === experienceType);
  const occasionLabel = occasionType
    ? `${occasionType.emoji} ${occasionType.label}`
    : experienceType;

  // Handle form submission
  const handleGenerate = async () => {
    // Validate. The basics are no longer editable here, so every message points the traveler at
    // the step that OWNS the answer instead of at a field this form no longer has.
    const newErrors: Record<string, string> = {};
    if (destinations.length === 0) {
      newErrors.destinations = 'This plan has no destination yet — use “change” to add one.';
    }
    if (!startDate || !endDate) {
      newErrors.dates = 'This plan has no dates yet — use “change” to set them.';
    } else if (new Date(startDate) >= new Date(endDate)) {
      newErrors.dates = 'The end date must be after the start date — use “change” to fix it.';
    } else if (new Date(startDate) < new Date()) {
      newErrors.dates = 'The start date is in the past — use “change” to fix it.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);
    setError('');
    setDraftRefusal(null);

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
          // Fine occasion identity when opened from a landing Moment — the server folds it into
          // the generation prompt ("Occasion: …") so the brief carries the moment
          // (ruling 2026-09-01-moment-key).
          momentKey: momentKey || undefined,
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
        const errorData = await response.json().catch(() => ({}));
        // LD 41 (b): the free draft runs only on an EMPTY slip. Read through the ONE shared
        // reader — never a second copy of the discriminator (§18 rule 1) — and shown as the
        // server's own sentence plus a link to the slip, whose existing Optimize button runs the
        // ONE pay-gate implementation. This surface sends no tripId today, so the branch is
        // reachable only if a door starts to; it is here so that door does not have to invent
        // its own handling.
        const refusal = readSlipHasItemsRefusal(response.status, errorData);
        if (refusal) {
          setDraftRefusal(refusal);
          return;
        }
        throw new Error(errorData.message || 'Failed to generate itinerary');
      }

      const data = await response.json();

      // The backend creates the comparison INSIDE the snapshot transaction
      // (saveGeneratedItinerarySnapshot, content-query.service.ts) and the
      // endpoint's one success exit always returns comparisonId — so the branch
      // below is defensive only (Phase 0 of ruling 2026-08-28-single-planning-entry
      // verified no server path returns 200 without it).
      if (data.comparisonId) {
        // Close modal and redirect to comparison page
        onClose();
        setLocation(`/itinerary-comparison/${data.comparisonId}`);
      } else if (data.tripId) {
        // Defensive fallback: land on the PLANNING surface for the trip, never
        // the details card mid-flow (the slip is the canonical planning address).
        toast({
          title: "Itinerary saved",
          description: "The optimized comparison isn't ready — continuing on your plan.",
        });
        onClose();
        setLocation(`/plans/${data.tripId}`);
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

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 text-center">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-purple-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Sign in to Plan Your Trip</h2>
          <p className="text-gray-600 mb-6">
            Create a free account or sign in to generate your personalized AI travel itinerary.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={onClose}
              className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
              data-testid="button-cancel-signin-prompt"
            >
              Cancel
            </button>
            <button
              onClick={() => { onClose(); window.location.href = "/api/login"; }}
              className="px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-semibold flex items-center gap-2"
              data-testid="button-signin-from-modal"
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

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
              A few preferences and we'll build personalized itineraries for the plan below
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition" data-testid="button-close-planning-modal">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-6 space-y-6">
          {/* ── The plan, as the traveler already described it — READ-ONLY ─────────────────────
              Ledger `2026-09-04-golf-occasion-and-housekeeping`. Destination, dates, party and
              occasion are the plan modal's answers; this form shows them and offers ONE way to
              change them — going back to the step that owns the answer. Nothing here is an input,
              because a second editable home for one answer is how the two copies drift apart. */}
          <div
            className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
            data-testid="planning-basics-summary"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                  Your plan
                </p>
                <p className="text-sm text-gray-900 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="inline-flex items-center gap-1" data-testid="text-basics-destination">
                    <MapPin className="w-4 h-4 text-gray-500 shrink-0" />
                    {destinationLabel}
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="inline-flex items-center gap-1" data-testid="text-basics-dates">
                    <Calendar className="w-4 h-4 text-gray-500 shrink-0" />
                    {datesLabel}
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="inline-flex items-center gap-1" data-testid="text-basics-travelers">
                    <Users className="w-4 h-4 text-gray-500 shrink-0" />
                    {travelersLabel}
                  </span>
                  <span className="text-gray-300">·</span>
                  <span data-testid="text-basics-occasion">{occasionLabel}</span>
                </p>
              </div>
              {onChangeBasics && (
                <button
                  onClick={onChangeBasics}
                  className="text-sm font-medium text-purple-600 hover:text-purple-800 underline underline-offset-2 shrink-0"
                  data-testid="button-change-basics"
                >
                  change
                </button>
              )}
            </div>

            {(errors.destinations || errors.dates) && (
              <p className="text-red-500 text-sm mt-2" data-testid="text-basics-error">
                {errors.destinations || errors.dates}
              </p>
            )}
          </div>

          {/* City-derived refinements for the generator. Not a fifth basic — these narrow what the
              AI proposes and have no home on any step. */}
          <div>

            {/* Neighborhoods — an AI-only refinement, shown when the destination's city has any */}
            {neighborhoods.length > 0 && (
              <div className="mt-3">
                <label className="text-xs font-semibold text-gray-600 mb-1 block">
                  Focus neighborhood <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <select
                  value={selectedNeighborhood}
                  onChange={(e) => setSelectedNeighborhood(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent bg-white"
                  data-testid="select-neighborhood"
                >
                  <option value="">Any neighborhood</option>
                  {neighborhoods.map(n => (
                    <option key={n.id} value={n.slug}>{n.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Hidden gems — an AI-only refinement, shown when the destination's city has any */}
            {gems.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                  <Gem className="w-3 h-3 text-purple-500" />
                  Local hidden gems to consider
                </p>
                <div className="flex flex-wrap gap-2">
                  {gems.map(g => (
                    <span
                      key={g.id}
                      className="px-2 py-1 bg-purple-50 border border-purple-200 text-purple-700 rounded-full text-xs"
                      title={g.description ?? undefined}
                      data-testid={`chip-gem-${g.id}`}
                    >
                      {g.placeName}{g.placeType ? ` · ${g.placeType}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Progressive Disclosure: Trip Preferences */}
          <div className="border-t border-gray-200 pt-6">
            <button
              onClick={() => setShowPreferences(!showPreferences)}
              className="flex items-center justify-between w-full text-left group"
              data-testid="button-toggle-preferences"
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
                        data-testid={`button-pace-${pace.value}`}
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
                    data-testid="input-must-see"
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
                    data-testid="button-toggle-interests"
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
                          data-testid={`button-interest-${interest.value}`}
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
                    data-testid="button-toggle-budget"
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
                          data-testid={`button-budget-${tier.value}`}
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
                    data-testid="button-toggle-dietary"
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
                          data-testid={`button-dietary-${option.value}`}
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
                    data-testid="button-toggle-mobility"
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
                          data-testid={`button-mobility-${option.value}`}
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
              data-testid="textarea-special-requests"
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

          {/* LD 41 (b): not an error — the plan already has items, so Optimize is the rail that
              works on it. Neutral styling, the server's own sentence, and a link to the slip
              rather than a re-implemented gate. No link when the refusal named no trip (§13). */}
          {draftRefusal && (
            <div
              className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-lg text-sm"
              data-testid="ai-draft-slip-has-items"
            >
              <p>{draftRefusal.message}</p>
              {slipHref(draftRefusal) && (
                <button
                  type="button"
                  onClick={() => { onClose(); setLocation(slipHref(draftRefusal)!); }}
                  className="mt-2 underline font-medium"
                  data-testid="ai-draft-optimize-instead"
                >
                  Optimize this plan instead
                </button>
              )}
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
            data-testid="button-cancel-planning"
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
            data-testid="button-generate-itinerary"
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
