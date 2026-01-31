import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, addDays, parseISO, differenceInDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Sparkles,
  Calendar as CalendarIcon,
  MapPin,
  Users,
  DollarSign,
  Clock,
  ChevronRight,
  ChevronDown,
  Loader2,
  CheckCircle2,
  Coffee,
  Utensils,
  Camera,
  Hotel,
  Car,
  Bus,
  Plane,
  Train,
  RefreshCw,
  ArrowLeft,
  Send,
  Edit,
  MessageSquare,
  Zap,
  Star,
  Lightbulb,
  AlertTriangle,
  Gem,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

interface DayActivity {
  time: string;
  name: string;
  type: string;
  duration: string;
  estimatedCost: number;
  location: string;
  description: string;
  tips?: string;
  bookingRequired?: boolean;
}

interface DayMeal {
  time: string;
  type: "breakfast" | "lunch" | "dinner";
  suggestion: string;
  cuisine: string;
  priceRange: string;
}

interface DayTransportation {
  from: string;
  to: string;
  mode: string;
  duration: string;
  cost: number;
}

interface DayItinerary {
  day: number;
  date: string;
  theme: string;
  activities: DayActivity[];
  meals: DayMeal[];
  transportation: DayTransportation[];
}

interface Accommodation {
  name: string;
  type: string;
  pricePerNight: number;
  neighborhood: string;
  whyRecommended: string;
}

interface CityIntelligence {
  pulseScore: number | null;
  trendingScore: number | null;
  hiddenGemsCount: number;
  happeningNowCount: number;
  alertsCount: number;
}

interface GeneratedItinerary {
  id: string;
  title: string;
  summary: string;
  totalEstimatedCost: number;
  dailyItinerary: DayItinerary[];
  accommodationSuggestions: Accommodation[];
  packingList: string[];
  travelTips: string[];
  cityIntelligence: CityIntelligence | null;
}

const INTEREST_OPTIONS = [
  { id: "culture", label: "Culture & History", icon: Camera },
  { id: "food", label: "Food & Dining", icon: Utensils },
  { id: "adventure", label: "Adventure", icon: Sparkles },
  { id: "nature", label: "Nature & Outdoors", icon: Gem },
  { id: "nightlife", label: "Nightlife", icon: Coffee },
];

const PACE_OPTIONS = [
  { value: "relaxed", label: "Relaxed", description: "Fewer activities, more downtime" },
  { value: "moderate", label: "Moderate", description: "Balanced pace with variety" },
  { value: "packed", label: "Packed", description: "Maximum activities each day" },
];

const getMealIcon = (type: string) => {
  switch (type) {
    case "breakfast": return Coffee;
    case "lunch": return Utensils;
    case "dinner": return Utensils;
    default: return Utensils;
  }
};

const getTransportIcon = (mode: string) => {
  const lowerMode = mode.toLowerCase();
  if (lowerMode.includes("walk")) return null;
  if (lowerMode.includes("car") || lowerMode.includes("taxi") || lowerMode.includes("uber")) return Car;
  if (lowerMode.includes("bus")) return Bus;
  if (lowerMode.includes("train") || lowerMode.includes("metro") || lowerMode.includes("subway")) return Train;
  if (lowerMode.includes("plane") || lowerMode.includes("flight")) return Plane;
  return Car;
};

export default function QuickStartItinerary() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  
  // Parse URL search params
  const searchParams = new URLSearchParams(window.location.search);
  const destination = searchParams.get("destination") || "";
  const country = searchParams.get("country") || "";
  
  // State for customization
  const [selectedDay, setSelectedDay] = useState(0);
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());
  const [showCustomization, setShowCustomization] = useState(!destination);
  
  // Customization options
  const [customDestination, setCustomDestination] = useState(destination);
  const [customCountry, setCustomCountry] = useState(country);
  const [startDate, setStartDate] = useState<Date | undefined>(addDays(new Date(), 1));
  const [endDate, setEndDate] = useState<Date | undefined>(addDays(new Date(), 4));
  const [travelers, setTravelers] = useState(2);
  const [interests, setInterests] = useState<string[]>(["culture", "food"]);
  const [pacePreference, setPacePreference] = useState<string>("moderate");

  const generateMutation = useMutation({
    mutationFn: async (params: {
      destination: string;
      country?: string;
      dates?: { start: string; end: string };
      travelers: number;
      interests: string[];
      pacePreference: string;
    }) => {
      const response = await apiRequest("POST", "/api/quick-start-itinerary", params);
      return response.json();
    },
  });

  // Mutation to create a trip when sending to expert
  const createTripMutation = useMutation({
    mutationFn: async (tripData: {
      destination: string;
      title: string;
      startDate: string;
      endDate: string;
      travelers: number;
      itineraryId?: string;
    }) => {
      const response = await apiRequest("POST", "/api/trips", tripData);
      return response.json();
    },
  });

  // Auto-generate if destination is provided
  useEffect(() => {
    if (destination && !generateMutation.data && !generateMutation.isPending) {
      generateMutation.mutate({
        destination,
        country: country || undefined,
        travelers: 2,
        interests: ["culture", "food", "nature"],
        pacePreference: "moderate",
      });
      setShowCustomization(false);
    }
  }, [destination, country]);

  const handleGenerate = () => {
    if (!customDestination) return;
    
    // Validate dates - end date must be after start date
    if (startDate && endDate && endDate <= startDate) {
      return; // Invalid date range, button should be disabled
    }
    
    generateMutation.mutate({
      destination: customDestination,
      country: customCountry || undefined,
      dates: startDate && endDate ? {
        start: format(startDate, "yyyy-MM-dd"),
        end: format(endDate, "yyyy-MM-dd"),
      } : undefined,
      travelers,
      interests,
      pacePreference,
    });
    setShowCustomization(false);
  };

  // Validate form
  const isFormValid = customDestination.trim().length > 0 && 
    (!startDate || !endDate || endDate > startDate);

  const handleSendToExpert = async () => {
    if (!generateMutation.data) return;
    
    const itinerary = generateMutation.data as GeneratedItinerary;
    const dest = customDestination || destination;
    const fullDestination = (customCountry || country) ? `${dest}, ${customCountry || country}` : dest;
    
    try {
      // Create a trip with the AI-generated itinerary
      const trip = await createTripMutation.mutateAsync({
        destination: fullDestination,
        title: itinerary.title,
        startDate: itinerary.dailyItinerary[0]?.date || format(startDate || new Date(), "yyyy-MM-dd"),
        endDate: itinerary.dailyItinerary[itinerary.dailyItinerary.length - 1]?.date || format(endDate || addDays(new Date(), 3), "yyyy-MM-dd"),
        travelers,
        itineraryId: itinerary.id,
      });
      
      // Navigate to expert matching with the trip context
      const params = new URLSearchParams();
      params.set("destination", dest);
      if (customCountry || country) params.set("country", customCountry || country);
      params.set("tripId", trip.id);
      params.set("itineraryId", itinerary.id);
      params.set("source", "quick-start");
      
      setLocation(`/experts?${params.toString()}`);
    } catch (error) {
      console.error("Failed to create trip:", error);
      // Fall back to direct navigation with itinerary context
      const params = new URLSearchParams();
      params.set("destination", dest);
      if (customCountry || country) params.set("country", customCountry || country);
      params.set("itineraryId", itinerary.id);
      params.set("source", "quick-start");
      
      setLocation(`/experts?${params.toString()}`);
    }
  };

  const handleCustomize = () => {
    if (!generateMutation.data) return;
    
    // Navigate to full experience builder with the itinerary context
    const params = new URLSearchParams();
    params.set("destination", `${customDestination || destination}, ${customCountry || country}`);
    params.set("itineraryId", generateMutation.data.id);
    
    setLocation(`/experiences/travel/new?${params.toString()}`);
  };

  const toggleActivityExpanded = (key: string) => {
    setExpandedActivities(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const itinerary = generateMutation.data as GeneratedItinerary | undefined;
  const isLoading = generateMutation.isPending;
  const error = generateMutation.error;

  // Customization panel
  if (showCustomization && !isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <Button 
            variant="ghost" 
            onClick={() => setLocation("/discover")}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Discover
          </Button>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>AI Quick Start Itinerary</CardTitle>
                  <CardDescription>
                    Tell us about your trip and we'll create a personalized itinerary using local intelligence
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Destination City</Label>
                <Input
                  placeholder="e.g., Tokyo, Paris, New York"
                  value={customDestination}
                  onChange={(e) => setCustomDestination(e.target.value)}
                  data-testid="input-destination"
                />
              </div>

              <div className="space-y-2">
                <Label>Country</Label>
                <Input
                  placeholder="e.g., Japan, France, USA"
                  value={customCountry}
                  onChange={(e) => setCustomCountry(e.target.value)}
                  data-testid="input-country"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}
                        data-testid="button-start-date"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "MMM d, yyyy") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}
                        data-testid="button-end-date"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, "MMM d, yyyy") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        disabled={(date) => date < (startDate || new Date())}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Number of Travelers</Label>
                <Select value={travelers.toString()} onValueChange={(v) => setTravelers(parseInt(v))}>
                  <SelectTrigger data-testid="select-travelers">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <SelectItem key={n} value={n.toString()}>
                        {n} {n === 1 ? "traveler" : "travelers"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Interests</Label>
                <div className="flex flex-wrap gap-2">
                  {INTEREST_OPTIONS.map((interest) => (
                    <Badge
                      key={interest.id}
                      variant={interests.includes(interest.id) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => {
                        setInterests(prev =>
                          prev.includes(interest.id)
                            ? prev.filter(i => i !== interest.id)
                            : [...prev, interest.id]
                        );
                      }}
                      data-testid={`badge-interest-${interest.id}`}
                    >
                      <interest.icon className="h-3 w-3 mr-1" />
                      {interest.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Pace Preference</Label>
                <div className="grid grid-cols-3 gap-2">
                  {PACE_OPTIONS.map((pace) => (
                    <Button
                      key={pace.value}
                      variant={pacePreference === pace.value ? "default" : "outline"}
                      className="flex-col h-auto py-3"
                      onClick={() => setPacePreference(pace.value)}
                      data-testid={`button-pace-${pace.value}`}
                    >
                      <span className="font-medium">{pace.label}</span>
                      <span className="text-xs opacity-70">{pace.description}</span>
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex-col gap-2">
              {startDate && endDate && endDate <= startDate && (
                <p className="text-sm text-destructive w-full text-center">
                  End date must be after start date
                </p>
              )}
              <Button
                onClick={handleGenerate}
                disabled={!isFormValid}
                className="w-full"
                size="lg"
                data-testid="button-generate"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Generate AI Itinerary
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="relative">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                    <Sparkles className="h-8 w-8 text-primary animate-spin" />
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">Creating Your Personalized Itinerary</h3>
                  <p className="text-muted-foreground max-w-md">
                    Our AI is analyzing local intelligence, hidden gems, and real-time data to craft the perfect trip for you...
                  </p>
                </div>
                <div className="flex gap-2 pt-4">
                  <Badge variant="secondary" className="animate-pulse">
                    <Gem className="h-3 w-3 mr-1" />
                    Finding hidden gems
                  </Badge>
                  <Badge variant="secondary" className="animate-pulse delay-100">
                    <Zap className="h-3 w-3 mr-1" />
                    Checking live events
                  </Badge>
                  <Badge variant="secondary" className="animate-pulse delay-200">
                    <Star className="h-3 w-3 mr-1" />
                    Optimizing route
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <Button 
            variant="ghost" 
            onClick={() => setLocation("/discover")}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Discover
          </Button>

          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center space-y-4 text-center">
                <AlertTriangle className="h-12 w-12 text-destructive" />
                <h3 className="text-lg font-semibold">Failed to Generate Itinerary</h3>
                <p className="text-muted-foreground">
                  {(error as Error).message || "Something went wrong. Please try again."}
                </p>
                <Button onClick={() => setShowCustomization(true)} data-testid="button-try-again">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Itinerary display
  if (!itinerary) {
    return null;
  }

  const currentDay = itinerary.dailyItinerary[selectedDay];
  const tripDays = itinerary.dailyItinerary.length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setLocation("/discover")}
                data-testid="button-back"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold">{itinerary.title}</h1>
                <p className="text-sm text-muted-foreground">{itinerary.summary}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="hidden sm:flex">
                <DollarSign className="h-3 w-3 mr-1" />
                ${itinerary.totalEstimatedCost} estimated
              </Badge>
              <Badge variant="outline" className="hidden sm:flex">
                <CalendarIcon className="h-3 w-3 mr-1" />
                {tripDays} days
              </Badge>
            </div>
          </div>

          {/* City Intelligence Banner */}
          {itinerary.cityIntelligence && (
            <div className="mt-4 flex flex-wrap gap-2">
              {itinerary.cityIntelligence.pulseScore && (
                <Badge variant="secondary">
                  <Zap className="h-3 w-3 mr-1" />
                  Pulse Score: {itinerary.cityIntelligence.pulseScore}/100
                </Badge>
              )}
              {itinerary.cityIntelligence.hiddenGemsCount > 0 && (
                <Badge variant="secondary">
                  <Gem className="h-3 w-3 mr-1" />
                  {itinerary.cityIntelligence.hiddenGemsCount} hidden gems included
                </Badge>
              )}
              {itinerary.cityIntelligence.happeningNowCount > 0 && (
                <Badge variant="secondary">
                  <Star className="h-3 w-3 mr-1" />
                  {itinerary.cityIntelligence.happeningNowCount} live events
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Day Navigation */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Trip Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {itinerary.dailyItinerary.map((day, index) => (
                  <button
                    key={day.day}
                    onClick={() => setSelectedDay(index)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                      selectedDay === index
                        ? "bg-primary text-primary-foreground"
                        : "hover-elevate"
                    )}
                    data-testid={`button-day-${day.day}`}
                  >
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium",
                      selectedDay === index ? "bg-primary-foreground/20" : "bg-muted"
                    )}>
                      {day.day}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{day.theme}</p>
                      <p className={cn(
                        "text-xs truncate",
                        selectedDay === index ? "text-primary-foreground/70" : "text-muted-foreground"
                      )}>
                        {format(parseISO(day.date), "EEE, MMM d")}
                      </p>
                    </div>
                    <ChevronRight className={cn(
                      "h-4 w-4",
                      selectedDay === index ? "text-primary-foreground/70" : "text-muted-foreground"
                    )} />
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <Card className="mt-4">
              <CardContent className="pt-4 space-y-3">
                <Button
                  onClick={handleCustomize}
                  variant="outline"
                  className="w-full"
                  data-testid="button-customize"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Customize This Trip
                </Button>
                <Button
                  onClick={handleSendToExpert}
                  className="w-full"
                  disabled={createTripMutation.isPending}
                  data-testid="button-send-to-expert"
                >
                  {createTripMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {createTripMutation.isPending ? "Creating Trip..." : "Send to Expert"}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Get a local expert to refine your itinerary and add bookable services
                </p>
              </CardContent>
            </Card>

            {/* Travel Tips */}
            {itinerary.travelTips.length > 0 && (
              <Card className="mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    Travel Tips
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {itinerary.travelTips.slice(0, 4).map((tip, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Day Details */}
          <div className="lg:col-span-2">
            {currentDay && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Day {currentDay.day}: {currentDay.theme}</CardTitle>
                      <CardDescription>
                        {format(parseISO(currentDay.date), "EEEE, MMMM d, yyyy")}
                      </CardDescription>
                    </div>
                    <Badge variant="outline">
                      {currentDay.activities.length} activities
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-4">
                      {/* Activities Timeline */}
                      {currentDay.activities.map((activity, index) => {
                        const activityKey = `${currentDay.day}-${index}`;
                        const isExpanded = expandedActivities.has(activityKey);
                        
                        return (
                          <Collapsible
                            key={activityKey}
                            open={isExpanded}
                            onOpenChange={() => toggleActivityExpanded(activityKey)}
                          >
                            <div className="flex gap-3">
                              {/* Timeline */}
                              <div className="flex flex-col items-center">
                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                  <Camera className="h-5 w-5 text-primary" />
                                </div>
                                {index < currentDay.activities.length - 1 && (
                                  <div className="w-0.5 flex-1 bg-border my-2" />
                                )}
                              </div>

                              {/* Content */}
                              <div className="flex-1 pb-4">
                                <CollapsibleTrigger asChild>
                                  <div className="cursor-pointer">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-sm font-medium text-muted-foreground">
                                        {activity.time}
                                      </span>
                                      {activity.bookingRequired && (
                                        <Badge variant="secondary" className="text-xs">
                                          Booking Required
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <h4 className="font-medium">{activity.name}</h4>
                                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                                          <MapPin className="h-3 w-3" />
                                          {activity.location}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-xs">
                                          <Clock className="h-3 w-3 mr-1" />
                                          {activity.duration}
                                        </Badge>
                                        <ChevronDown className={cn(
                                          "h-4 w-4 text-muted-foreground transition-transform",
                                          isExpanded && "rotate-180"
                                        )} />
                                      </div>
                                    </div>
                                  </div>
                                </CollapsibleTrigger>
                                
                                <CollapsibleContent className="mt-3">
                                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                                    <p className="text-sm">{activity.description}</p>
                                    {activity.tips && (
                                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                                        <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                                        <span>{activity.tips}</span>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2 pt-2">
                                      <Badge variant="secondary">
                                        <DollarSign className="h-3 w-3" />
                                        ${activity.estimatedCost}
                                      </Badge>
                                      <Badge variant="outline">{activity.type}</Badge>
                                    </div>
                                  </div>
                                </CollapsibleContent>
                              </div>
                            </div>
                          </Collapsible>
                        );
                      })}

                      <Separator className="my-4" />

                      {/* Meals */}
                      <div>
                        <h4 className="font-medium mb-3 flex items-center gap-2">
                          <Utensils className="h-4 w-4" />
                          Meal Suggestions
                        </h4>
                        <div className="grid sm:grid-cols-3 gap-3">
                          {currentDay.meals.map((meal, index) => {
                            const MealIcon = getMealIcon(meal.type);
                            return (
                              <div key={index} className="bg-muted/50 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <MealIcon className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm font-medium capitalize">{meal.type}</span>
                                  <span className="text-xs text-muted-foreground">{meal.time}</span>
                                </div>
                                <p className="text-sm">{meal.suggestion}</p>
                                <div className="flex items-center gap-2 mt-2">
                                  <Badge variant="outline" className="text-xs">{meal.cuisine}</Badge>
                                  <Badge variant="secondary" className="text-xs">{meal.priceRange}</Badge>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Transportation */}
                      {currentDay.transportation.length > 0 && (
                        <>
                          <Separator className="my-4" />
                          <div>
                            <h4 className="font-medium mb-3 flex items-center gap-2">
                              <Car className="h-4 w-4" />
                              Transportation
                            </h4>
                            <div className="space-y-2">
                              {currentDay.transportation.map((transport, index) => {
                                const TransportIcon = getTransportIcon(transport.mode) || Car;
                                return (
                                  <div key={index} className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
                                    <TransportIcon className="h-5 w-5 text-muted-foreground" />
                                    <div className="flex-1">
                                      <p className="text-sm">
                                        {transport.from} → {transport.to}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {transport.mode} • {transport.duration}
                                      </p>
                                    </div>
                                    <Badge variant="secondary" className="text-xs">
                                      ${transport.cost}
                                    </Badge>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Accommodations */}
            {itinerary.accommodationSuggestions.length > 0 && (
              <Card className="mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Hotel className="h-4 w-4" />
                    Recommended Accommodations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {itinerary.accommodationSuggestions.map((hotel, index) => (
                      <div key={index} className="bg-muted/50 rounded-lg p-3">
                        <div className="flex items-start justify-between mb-1">
                          <h5 className="font-medium">{hotel.name}</h5>
                          <Badge variant="secondary" className="text-xs">
                            ${hotel.pricePerNight}/night
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          {hotel.type} • {hotel.neighborhood}
                        </p>
                        <p className="text-sm">{hotel.whyRecommended}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
