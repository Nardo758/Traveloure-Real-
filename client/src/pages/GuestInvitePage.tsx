/**
 * Guest Invite Page
 * Personalized landing page for wedding/event guests
 * Shows travel recommendations based on their origin city
 */

import React, { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Plane,
  Car,
  Hotel,
  Palmtree,
  Heart,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Invite {
  id: string;
  guestName: string;
  guestEmail: string;
  originCity?: string;
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
}

export function GuestInvitePage() {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<'welcome' | 'origin' | 'rsvp' | 'recommendations'>('welcome');
  const { toast } = useToast();
  
  // Form state
  const [originCity, setOriginCity] = useState('');
  const [originState, setOriginState] = useState('');
  const [originCountry, setOriginCountry] = useState('United States');
  const [rsvpStatus, setRsvpStatus] = useState('');
  const [numberOfGuests, setNumberOfGuests] = useState(1);
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([]);
  const [accommodationPreference, setAccommodationPreference] = useState('');
  const [transportationNeeded, setTransportationNeeded] = useState(false);
  const [specialRequests, setSpecialRequests] = useState('');
  const [message, setMessage] = useState('');
  
  // Recommendations state
  const [recommendations, setRecommendations] = useState<any>(null);
  
  useEffect(() => {
    fetchInvite();
  }, [token]);
  
  async function fetchInvite() {
    try {
      const response = await fetch(`/api/invites/${token}`);
      const data = await response.json();
      
      if (response.ok) {
        setInvite(data.invite);
        setExperience(data.experience);
        
        // Set initial form values if already filled
        if (data.invite.originCity) {
          setOriginCity(data.invite.originCity);
          setOriginState(data.invite.originState || '');
          setOriginCountry(data.invite.originCountry || 'United States');
        }
        
        if (data.invite.rsvpStatus !== 'pending') {
          setRsvpStatus(data.invite.rsvpStatus);
          setNumberOfGuests(data.invite.numberOfGuests || 1);
          setCurrentStep('recommendations');
          fetchRecommendations();
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
    
    try {
      const response = await fetch(`/api/invites/${token}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rsvpStatus,
          numberOfGuests,
          dietaryRestrictions,
          accommodationPreference,
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
      
      setCurrentStep('recommendations');
      fetchRecommendations();
      
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  }
  
  async function fetchRecommendations() {
    try {
      const response = await fetch(`/api/invites/${token}/recommendations`);
      const data = await response.json();
      
      if (response.ok) {
        setRecommendations(data.recommendations);
      }
    } catch (error) {
      console.error('Error fetching recommendations:', error);
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
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <Heart className="h-16 w-16 text-purple-600 mx-auto mb-4" />
          <h1 className="text-4xl font-bold mb-2">{experience.title}</h1>
          <div className="flex items-center justify-center gap-4 text-muted-foreground">
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>{experience.destination}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>{new Date(experience.startDate).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
        
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
              <div className="bg-purple-50 p-6 rounded-lg">
                <h3 className="font-semibold mb-2">🌟 Personalized Travel Planning</h3>
                <p className="text-sm text-muted-foreground">
                  We'll help you plan your journey! Just tell us where you're traveling from, 
                  and we'll show you flight options, ground transportation, accommodation near 
                  the venue, and local activities during your stay.
                </p>
              </div>
              
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
              <CardDescription>
                We'll use this to show you personalized travel recommendations
              </CardDescription>
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
                    <Select value={accommodationPreference} onValueChange={setAccommodationPreference}>
                      <SelectTrigger>
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
        
        {/* Recommendations Step */}
        {currentStep === 'recommendations' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                  RSVP Confirmed!
                </CardTitle>
                <CardDescription>
                  Here are your personalized travel recommendations from {originCity} to {experience.destination}
                </CardDescription>
              </CardHeader>
            </Card>
            
            {recommendations?.needsApiIntegration ? (
              <Card className="bg-blue-50">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <Plane className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                    <h3 className="font-semibold mb-2">Travel Recommendations Coming Soon!</h3>
                    <p className="text-sm text-muted-foreground">
                      We're working on integrating flight search, hotel recommendations, and local activities.
                      Check back soon for personalized travel options from {originCity} to {experience.destination}!
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Tabs defaultValue="flights">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="flights">
                    <Plane className="mr-2 h-4 w-4" />
                    Flights
                  </TabsTrigger>
                  <TabsTrigger value="transport">
                    <Car className="mr-2 h-4 w-4" />
                    Transport
                  </TabsTrigger>
                  <TabsTrigger value="hotels">
                    <Hotel className="mr-2 h-4 w-4" />
                    Hotels
                  </TabsTrigger>
                  <TabsTrigger value="activities">
                    <Palmtree className="mr-2 h-4 w-4" />
                    Activities
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="flights">
                  <Card>
                    <CardHeader>
                      <CardTitle>Flights: {originCity} → {experience.destination}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">Flight options will appear here</p>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="transport">
                  <Card>
                    <CardHeader>
                      <CardTitle>Ground Transportation</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">Transport options will appear here</p>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="hotels">
                  <Card>
                    <CardHeader>
                      <CardTitle>Hotels Near Venue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">Hotel recommendations will appear here</p>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="activities">
                  <Card>
                    <CardHeader>
                      <CardTitle>Things to Do in {experience.destination}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">Activity recommendations will appear here</p>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
