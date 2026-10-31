/**
 * Guest Invite Page
 * Personalized landing page for wedding/event guests
 * Guests share where they are traveling from and confirm their RSVP
 *
 * Row 278 (ledger `2026-10-28-guest-landing-render`): the event details come from the server's
 * `landing` key only (`guestLandingRows`); the page is noindex; the view is recorded by one
 * POST …/view per page load, because the GET no longer records it (row 277).
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MapPin,
  Calendar,
  Users,
  Heart,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getTripContext, updateTripContext } from '@/lib/trip-context';
import { guestLandingRows, type GuestLandingPayload, type GuestLandingRow } from '@/lib/guest-landing';
import { GuestPostRsvpCard } from '@/components/GuestPostRsvpCard';
import { GuestPlanMyDayButton } from '@/components/GuestPlanMyDayButton';
import { GuestDataRetentionNotice } from '@/components/GuestDataRetentionNotice';
import { retentionDaysFromPayload } from '@shared/guest-data-retention';
import { SEOHead } from '@/components/seo-head';

/** The guest-safe invite (row 277's seven keys); nothing else is returned or read. */
interface Invite {
  id: string;
  guestName: string;
  originCity?: string;
  originState?: string;
  originCountry?: string;
  rsvpStatus: string;
  numberOfGuests: number;
}

interface Experience {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  eventDetails: any;
  /** Event-type NAME from the redacted token view (e.g. "Wedding") — A2. */
  experienceType?: string | null;
}

/**
 * A2 (docs/briefs/04): stamp invite provenance into TripContext when the guest
 * surface hydrates from an invite. `origin` is FIRST-TOUCH (the module drops a
 * re-stamp), so a traveler who already carries provenance keeps it. When a trip
 * is already BOUND locally (`tripId` set — Server-truth mode), only the
 * provenance is stamped: overwriting the bound trip's identity/display fields
 * from an invite would be the #972 desync class the module warns about.
 * Exported so the behavioral gate (scripts/verify-guest-invite-context.ts) can
 * drive the real entry-point code path.
 */
export function stampInviteTripContext(
  experience:
    | Pick<Experience, 'title' | 'destination' | 'startDate' | 'experienceType'>
    | null
    | undefined,
): void {
  if (!experience) return;
  if (getTripContext().tripId) {
    updateTripContext({ origin: 'guest_invite' });
    return;
  }
  updateTripContext({
    origin: 'guest_invite',
    title: experience.title ?? undefined,
    destination: experience.destination ?? undefined,
    startDate: experience.startDate ?? undefined,
    experienceType: experience.experienceType ?? undefined,
  });
}

/** The icon beside each landing row; a row with no entry shows none. */
const LANDING_ROW_ICON: Partial<Record<GuestLandingRow['key'], typeof Calendar>> = {
  host: Users,
  date: Calendar,
  rsvpBy: Calendar,
  venue: MapPin,
  city: MapPin,
  address: MapPin,
};

export function GuestInvitePage() {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [landing, setLanding] = useState<GuestLandingPayload | null>(null);
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const viewRecordedFor = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<'welcome' | 'origin' | 'rsvp' | 'confirmed'>('welcome');
  const { toast } = useToast();
  
  // Form state
  const [originCity, setOriginCity] = useState('');
  const [originState, setOriginState] = useState('');
  const [originCountry, setOriginCountry] = useState('United States');
  const [rsvpStatus, setRsvpStatus] = useState('');
  const [numberOfGuests, setNumberOfGuests] = useState(1);
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([]);
  const [accommodationPreference, setAccommodationPreference] = useState('');
  // A yes with no accommodation choice marks the field instead of sending a body the server refuses.
  const [accommodationMissing, setAccommodationMissing] = useState(false);
  const accommodationTriggerRef = useRef<HTMLButtonElement>(null);
  const [transportationNeeded, setTransportationNeeded] = useState(false);
  const [specialRequests, setSpecialRequests] = useState('');
  const [message, setMessage] = useState('');
  
  useEffect(() => {
    fetchInvite();
  }, [token]);

  // One view per page load (row 277 moved the view record off the GET). The ref keeps a re-render
  // or a repeated effect from counting the same load twice; a failure is not shown to the guest.
  useEffect(() => {
    if (!token || viewRecordedFor.current === token) return;
    viewRecordedFor.current = token;
    fetch(`/api/invites/${token}/view`, { method: 'POST' }).catch(() => {});
  }, [token]);
  
  async function fetchInvite() {
    try {
      const response = await fetch(`/api/invites/${token}`);
      const data = await response.json();
      
      if (response.ok) {
        setInvite(data.invite);
        setExperience(data.experience);
        setLanding(data.landing ?? null);
        setRetentionDays(retentionDaysFromPayload(data.retentionDays));
        stampInviteTripContext(data.experience);

        // Set initial form values if already filled
        if (data.invite.originCity) {
          setOriginCity(data.invite.originCity);
          setOriginState(data.invite.originState || '');
          setOriginCountry(data.invite.originCountry || 'United States');
        }
        
        if (data.invite.rsvpStatus !== 'pending') {
          setRsvpStatus(data.invite.rsvpStatus);
          setNumberOfGuests(data.invite.numberOfGuests || 1);
          setCurrentStep('confirmed');
        } else if (data.invite.originCity) {
          setCurrentStep('rsvp');
        }
      } else {
        toast({
          title: "Error",
          description: data.error || "Invite not found",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }
  
  async function handleSaveOrigin() {
    if (!originCity) {
      toast({
        title: "Error",
        description: "Please enter your city",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const response = await fetch(`/api/invites/${token}/origin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originCity,
          originState,
          originCountry,
        }),
      });
      
      if (!response.ok) throw new Error('Failed to save origin');
      
      toast({
        title: "Success!",
        description: "Your location has been saved",
      });
      
      setCurrentStep('rsvp');
      
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  }
  
  async function handleSubmitRsvp() {
    if (!rsvpStatus) {
      toast({
        title: "Error",
        description: "Please select an RSVP response",
        variant: "destructive",
      });
      return;
    }

    // Ledger `2026-10-29-rsvp-accommodation-by-answer`: accommodation is asked only of a guest
    // who is coming. A yes with no choice marks the field and sends nothing.
    if (rsvpStatus === 'accepted' && !accommodationPreference) {
      setAccommodationMissing(true);
      accommodationTriggerRef.current?.focus();
      return;
    }
    
    try {
      const response = await fetch(`/api/invites/${token}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rsvpStatus,
          numberOfGuests,
          dietaryRestrictions,
          ...(rsvpStatus === 'accepted' ? { accommodationPreference } : {}),
          transportationNeeded,
          specialRequests,
          message,
        }),
      });
      
      if (!response.ok) throw new Error('Failed to submit RSVP');
      
      toast({
        title: "RSVP Submitted!",
        description: "Thank you for responding",
      });
      
      setCurrentStep('confirmed');
      // Order 279: re-read the landing once, so a "yes" shows the street address without a reload
      // (the server releases it only after "accepted"). The view beacon is its own effect and is
      // not re-sent by this read.
      void fetchInvite();
      
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  }
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  
  if (!invite || !experience) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardHeader>
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <CardTitle>Invite Not Found</CardTitle>
            <CardDescription>
              This invite link is invalid or has been deleted.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  
  const landingRows = guestLandingRows(landing, invite.rsvpStatus);

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white py-12 px-4">
      <SEOHead url={`/invite/${token}`} noindex />
      <div className="max-w-4xl mx-auto">
        {/* Header: every detail comes from `landing`; an absent key shows nothing (row 278).
            Dates are stored "YYYY-MM-DD" and read as a local calendar day (QA F3). */}
        <div className="text-center mb-12">
          <Heart className="h-16 w-16 text-purple-600 mx-auto mb-4" />
          {landing?.title && <h1 className="text-4xl font-bold mb-2">{landing.title}</h1>}
          {landingRows.length > 0 && (
            <dl className="mx-auto mt-4 max-w-md space-y-2 text-left text-muted-foreground" data-testid="guest-landing">
              {landingRows.map((row) => (
                <div key={row.key} className="flex items-start gap-2" data-testid={`guest-landing-${row.key}`}>
                  {LANDING_ROW_ICON[row.key] && React.createElement(LANDING_ROW_ICON[row.key]!, { className: 'h-4 w-4 shrink-0' })}
                  <div className="min-w-0">
                    {row.label && <dt className="text-xs font-medium uppercase tracking-wide">{row.label}</dt>}
                    <dd className={row.key === 'note' ? 'whitespace-pre-line text-foreground' : 'text-foreground'}>{row.value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          )}
        </div>

        {token ? (
          <GuestDataRetentionNotice
            retentionDays={retentionDays}
            token={token}
            onErased={() => {
              setInvite(null);
              setExperience(null);
            }}
          />
        ) : null}

        {/* Welcome Step */}
        {currentStep === 'welcome' && (
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle>You're Invited, {invite.guestName}! 🎉</CardTitle>
              <CardDescription>
                We're excited to have you join us for this special occasion.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Button 
                className="w-full" 
                size="lg"
                onClick={() => setCurrentStep('origin')}
              >
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}
        
        {/* Origin City Step */}
        {currentStep === 'origin' && (
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle>Where are you traveling from?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    placeholder="e.g., Tampa"
                    value={originCity}
                    onChange={(e) => setOriginCity(e.target.value)}
                  />
                </div>
                
                <div>
                  <Label htmlFor="state">State/Province</Label>
                  <Input
                    id="state"
                    placeholder="e.g., FL"
                    value={originState}
                    onChange={(e) => setOriginState(e.target.value)}
                  />
                </div>
                
                <div>
                  <Label htmlFor="country">Country</Label>
                  <Select value={originCountry} onValueChange={setOriginCountry}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="United States">United States</SelectItem>
                      <SelectItem value="Canada">Canada</SelectItem>
                      <SelectItem value="United Kingdom">United Kingdom</SelectItem>
                      <SelectItem value="Mexico">Mexico</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setCurrentStep('welcome')}>
                  Back
                </Button>
                <Button onClick={handleSaveOrigin}>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* RSVP Step */}
        {currentStep === 'rsvp' && (
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle>Please RSVP</CardTitle>
              <CardDescription>
                Let us know if you can make it
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* RSVP Status */}
              <div className="space-y-2">
                <Label>Will you be attending? *</Label>
                <RadioGroup value={rsvpStatus} onValueChange={setRsvpStatus}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="accepted" id="accepted" />
                    <Label htmlFor="accepted">Yes, I'll be there! ✅</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="declined" id="declined" />
                    <Label htmlFor="declined">Sorry, can't make it ❌</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="maybe" id="maybe" />
                    <Label htmlFor="maybe">Maybe / Not sure yet 🤔</Label>
                  </div>
                </RadioGroup>
              </div>
              
              {rsvpStatus === 'accepted' && (
                <>
                  {/* Number of Guests */}
                  <div className="space-y-2">
                    <Label htmlFor="guests">Number of Guests</Label>
                    <Input
                      id="guests"
                      type="number"
                      min="1"
                      max="10"
                      value={numberOfGuests}
                      onChange={(e) => setNumberOfGuests(parseInt(e.target.value))}
                    />
                    <p className="text-sm text-muted-foreground">Including yourself</p>
                  </div>
                  
                  {/* Dietary Restrictions */}
                  <div className="space-y-2">
                    <Label>Dietary Restrictions</Label>
                    <div className="space-y-2">
                      {['Vegetarian', 'Vegan', 'Gluten-Free', 'Nut Allergy', 'Dairy-Free'].map((option) => (
                        <div key={option} className="flex items-center space-x-2">
                          <Checkbox
                            id={option}
                            checked={dietaryRestrictions.includes(option)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setDietaryRestrictions([...dietaryRestrictions, option]);
                              } else {
                                setDietaryRestrictions(dietaryRestrictions.filter(d => d !== option));
                              }
                            }}
                          />
                          <Label htmlFor={option}>{option}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Accommodation Preference */}
                  <div className="space-y-2">
                    <Label htmlFor="accommodation">Accommodation Preference</Label>
                    <Select
                      value={accommodationPreference}
                      onValueChange={(value) => {
                        setAccommodationPreference(value);
                        setAccommodationMissing(false);
                      }}
                    >
                      <SelectTrigger
                        id="accommodation"
                        ref={accommodationTriggerRef}
                        aria-invalid={accommodationMissing || undefined}
                        className={accommodationMissing ? 'border-destructive ring-1 ring-destructive' : undefined}
                        data-testid="select-accommodation"
                      >
                        <SelectValue placeholder="Select preference" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hotel_block">Hotel block (group rate)</SelectItem>
                        <SelectItem value="own_booking">I'll book my own</SelectItem>
                        <SelectItem value="with_family">Staying with family/friends</SelectItem>
                        <SelectItem value="undecided">Haven't decided yet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Transportation */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="transportation"
                      checked={transportationNeeded}
                      onCheckedChange={(checked) => setTransportationNeeded(checked as boolean)}
                    />
                    <Label htmlFor="transportation">
                      I'll need transportation from the airport/hotel to the venue
                    </Label>
                  </div>
                  
                  {/* Special Requests */}
                  <div className="space-y-2">
                    <Label htmlFor="requests">Special Requests</Label>
                    <Textarea
                      id="requests"
                      placeholder="Any special accommodations or requests?"
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                      rows={3}
                    />
                  </div>
                </>
              )}
              
              {/* Message to Host */}
              <div className="space-y-2">
                <Label htmlFor="message">Message to Host (optional)</Label>
                <Textarea
                  id="message"
                  placeholder="Send a personal message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                />
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setCurrentStep('origin')}>
                  Back
                </Button>
                <Button onClick={handleSubmitRsvp}>
                  Submit RSVP
                  <CheckCircle2 className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Confirmation Step */}
        {currentStep === 'confirmed' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                  RSVP Confirmed!
                </CardTitle>
              </CardHeader>
            </Card>
            {/* Order 279 (ledger `2026-10-29-guest-post-rsvp-card`): the post-RSVP card, for every answer. */}
            <GuestPostRsvpCard landing={landing} landingRows={landingRows} />
            {/* Row 280b (ledger `2026-10-29-guest-plan-my-day-button`): signed-in and accepted only. */}
            <GuestPlanMyDayButton token={token} rsvpStatus={invite.rsvpStatus} />
          </div>
        )}
      </div>
    </div>
  );
}
