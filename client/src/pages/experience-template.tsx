import { useState, useMemo, useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  Search,
  Plus,
  X,
  Star,
  Clock,
  Calendar,
  MapPin,
  Check,
  Sparkles,
  ChevronDown,
  Wand2,
  SlidersHorizontal,
  Heart,
  Gem,
  Cake,
  Users,
  MessageCircle,
  ArrowLeft,
  Coins,
  Loader2,
  ShoppingCart,
  GitCompare,
  Plane,
  Hotel,
  Utensils,
  Camera,
  Music,
  Flower2,
  Car,
  Wine,
  Dumbbell,
  ShoppingBag,
  PartyPopper,
  GraduationCap,
  Baby,
  Home,
  Briefcase,
  Award,
  TreePine,
  Palmtree,
  Moon,
  Gift,
  Landmark,
  Package,
  Building2,
  Wrench,
  Ticket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ExperienceMap } from "@/components/experience-map";
import { ExpertChatWidget, CheckoutExpertBanner } from "@/components/expert-chat-widget";
import { TransportationAnalysis } from "@/components/transportation-analysis";
import type { ExperienceType, ProviderService, CustomVenue } from "@shared/schema";
import { matchesCategory } from "@shared/constants/providerCategories";
import { AddCustomVenueModal } from "@/components/add-custom-venue-modal";
import { FlightSearch } from "@/components/flight-search";
import { HotelSearch } from "@/components/hotel-search";
import { ServiceBrowser } from "@/components/service-browser";
import { ActivitySearch } from "@/components/activity-search";

interface CartItem {
  id: string;
  cartItemId?: string;
  type: string;
  name: string;
  price: number;
  quantity: number;
  date?: string;
  details?: string;
  provider?: string;
  isExternal?: boolean;
  metadata?: {
    cabin?: string;
    baggage?: string;
    stops?: number;
    duration?: string;
    airline?: string;
    flightNumber?: string;
    departureTime?: string;
    arrivalTime?: string;
    seatsLeft?: number;
    lastTicketingDate?: string;
    refundable?: boolean;
    cancellationDeadline?: string;
    boardType?: string;
    bedInfo?: string;
    roomCategory?: string;
    taxTotal?: number;
    nights?: number;
    pricePerNight?: number;
    checkInDate?: string;
    checkOutDate?: string;
    travelers?: number;
    meetingPoint?: string;
    meetingPointCoordinates?: { lat: number; lng: number };
    rawData?: any;
  };
}

const experienceConfigs: Record<string, {
  heroImage: string;
  tabs: { id: string; label: string; icon: any; category: string | null }[];
  filters: string[];
  locationLabel: string;
  dateLabel: string;
}> = {
  travel: {
    heroImage: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1600&q=80",
    tabs: [
      { id: "activities", label: "Activities", icon: Palmtree, category: "activities" },
      { id: "hotels", label: "Hotels", icon: Hotel, category: "hotels" },
      { id: "services", label: "Services", icon: Wrench, category: "services-travel" },
      { id: "dining", label: "Dining", icon: Utensils, category: "dining" },
      { id: "flights", label: "Flights", icon: Plane, category: "flights" },
      { id: "transportation", label: "Transportation", icon: Car, category: "transportation" },
    ],
    filters: ["Budget", "Luxury", "Family", "Adventure", "Business", "Beach", "City", "Nature"],
    locationLabel: "Destination:",
    dateLabel: "Travel Dates:",
  },
  wedding: {
    heroImage: "https://images.unsplash.com/photo-1519741497674-611481863552?w=1600&q=80",
    tabs: [
      { id: "venue", label: "Venues", icon: Landmark, category: "venue" },
      { id: "catering", label: "Catering", icon: Utensils, category: "catering" },
      { id: "photography", label: "Photography", icon: Camera, category: "photography" },
      { id: "florist", label: "Florist", icon: Flower2, category: "florist" },
      { id: "entertainment", label: "Entertainment", icon: Music, category: "entertainment" },
      { id: "services", label: "Services", icon: Wrench, category: "services-wedding" },
    ],
    filters: ["Indoor", "Outdoor", "Beach", "Garden", "Ballroom", "Rustic", "Modern", "Traditional"],
    locationLabel: "Wedding Location:",
    dateLabel: "Wedding Date:",
  },
  proposal: {
    heroImage: "https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?w=1600&q=80",
    tabs: [
      { id: "venue", label: "Venues", icon: Landmark, category: "venue" },
      { id: "photography", label: "Photography", icon: Camera, category: "photography" },
      { id: "dining", label: "Dining", icon: Utensils, category: "dining" },
      { id: "decorations", label: "Decorations", icon: Flower2, category: "decorations" },
      { id: "services", label: "Services", icon: Wrench, category: "services-proposal" },
    ],
    filters: ["Romantic", "Private", "Scenic", "Restaurant", "Beach", "Rooftop", "Garden", "Sunset"],
    locationLabel: "Proposal Location:",
    dateLabel: "Proposal Date:",
  },
  birthday: {
    heroImage: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=1600&q=80",
    tabs: [
      { id: "venue", label: "Venues", icon: Landmark, category: "venue" },
      { id: "catering", label: "Catering", icon: Cake, category: "catering" },
      { id: "entertainment", label: "Entertainment", icon: Music, category: "entertainment" },
      { id: "decorations", label: "Decorations", icon: PartyPopper, category: "decorations" },
      { id: "services", label: "Services", icon: Wrench, category: "services-birthday" },
    ],
    filters: ["Kids", "Teens", "Adults", "Milestone", "Outdoor", "Indoor", "Theme Party", "Elegant"],
    locationLabel: "Party Location:",
    dateLabel: "Party Date:",
  },
  "boys-trip": {
    heroImage: "https://images.unsplash.com/photo-1506869640319-fe1a24fd76dc?w=1600&q=80",
    tabs: [
      { id: "accommodations", label: "Accommodations", icon: Hotel, category: "accommodations" },
      { id: "activities", label: "Adventures", icon: Dumbbell, category: "adventures" },
      { id: "nightlife", label: "Nightlife", icon: Moon, category: "nightlife" },
      { id: "sports", label: "Sports", icon: Dumbbell, category: "sports" },
      { id: "services", label: "Services", icon: Wrench, category: "services-trip" },
    ],
    filters: ["Adventure", "Sports", "Nightlife", "Beach", "Mountains", "City", "Bachelor", "Fishing"],
    locationLabel: "Destination:",
    dateLabel: "Trip Dates:",
  },
  "girls-trip": {
    heroImage: "https://images.unsplash.com/photo-1559181567-c3190ca9959b?w=1600&q=80",
    tabs: [
      { id: "accommodations", label: "Accommodations", icon: Hotel, category: "accommodations" },
      { id: "spa", label: "Spa & Wellness", icon: Heart, category: "spa" },
      { id: "shopping", label: "Shopping", icon: ShoppingBag, category: "shopping" },
      { id: "dining", label: "Dining & Wine", icon: Wine, category: "dining" },
      { id: "services", label: "Services", icon: Wrench, category: "services-trip" },
    ],
    filters: ["Spa", "Shopping", "Beach", "Wine", "Brunch", "Wellness", "Bachelorette", "Luxury"],
    locationLabel: "Destination:",
    dateLabel: "Trip Dates:",
  },
  "date-night": {
    heroImage: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&q=80",
    tabs: [
      { id: "dining", label: "Dining", icon: Utensils, category: "dining" },
      { id: "entertainment", label: "Entertainment", icon: Music, category: "entertainment" },
      { id: "activities", label: "Activities", icon: Heart, category: "activities" },
      { id: "spa", label: "Spa & Wellness", icon: Heart, category: "spa" },
      { id: "services", label: "Services", icon: Wrench, category: "services-romance" },
    ],
    filters: ["Romantic", "Casual", "Upscale", "Adventure", "Foodie", "First Date", "Anniversary"],
    locationLabel: "Location:",
    dateLabel: "Date:",
  },
  "corporate-events": {
    heroImage: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1600&q=80",
    tabs: [
      { id: "venue", label: "Venues", icon: Landmark, category: "venue" },
      { id: "catering", label: "Catering", icon: Utensils, category: "catering" },
      { id: "av", label: "A/V Equipment", icon: Briefcase, category: "av-equipment" },
      { id: "team", label: "Team Activities", icon: Users, category: "team-building" },
      { id: "services", label: "Services", icon: Wrench, category: "services-corporate" },
    ],
    filters: ["Conference", "Retreat", "Workshop", "Team Building", "Seminar", "Gala", "Networking"],
    locationLabel: "Event Location:",
    dateLabel: "Event Date:",
  },
  "reunions": {
    heroImage: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1600&q=80",
    tabs: [
      { id: "venue", label: "Venues", icon: Landmark, category: "venue" },
      { id: "catering", label: "Catering", icon: Utensils, category: "catering" },
      { id: "activities", label: "Activities", icon: Users, category: "activities" },
      { id: "accommodations", label: "Accommodations", icon: Hotel, category: "accommodations" },
      { id: "services", label: "Services", icon: Wrench, category: "services-event" },
    ],
    filters: ["Family", "School", "Friends", "Outdoor", "Indoor", "Casual", "Formal", "Weekend"],
    locationLabel: "Reunion Location:",
    dateLabel: "Reunion Date:",
  },
  "wedding-anniversaries": {
    heroImage: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=1600&q=80",
    tabs: [
      { id: "dining", label: "Dining", icon: Utensils, category: "dining" },
      { id: "venue", label: "Venues", icon: Landmark, category: "venue" },
      { id: "activities", label: "Activities", icon: Heart, category: "activities" },
      { id: "photography", label: "Photography", icon: Camera, category: "photography" },
      { id: "services", label: "Services", icon: Wrench, category: "services-romance" },
    ],
    filters: ["Romantic", "Elegant", "Intimate", "Luxury", "Destination", "Classic", "Milestone"],
    locationLabel: "Celebration Location:",
    dateLabel: "Anniversary Date:",
  },
  "retreats": {
    heroImage: "https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=1600&q=80",
    tabs: [
      { id: "accommodations", label: "Accommodations", icon: Hotel, category: "accommodations" },
      { id: "wellness", label: "Wellness Programs", icon: Heart, category: "wellness" },
      { id: "activities", label: "Activities", icon: TreePine, category: "activities" },
      { id: "catering", label: "Catering", icon: Utensils, category: "catering" },
      { id: "services", label: "Services", icon: Wrench, category: "services-retreat" },
    ],
    filters: ["Wellness", "Yoga", "Meditation", "Nature", "Spiritual", "Detox", "Corporate", "Silent"],
    locationLabel: "Retreat Location:",
    dateLabel: "Retreat Dates:",
  },
  "baby-shower": {
    heroImage: "https://images.unsplash.com/photo-1544776193-352d25ca82cd?w=1600&q=80",
    tabs: [
      { id: "venue", label: "Venues", icon: Landmark, category: "venue" },
      { id: "catering", label: "Catering", icon: Cake, category: "catering" },
      { id: "decorations", label: "Decorations", icon: Baby, category: "decorations" },
      { id: "entertainment", label: "Entertainment", icon: Music, category: "entertainment" },
      { id: "services", label: "Services", icon: Wrench, category: "services-party" },
    ],
    filters: ["Boy", "Girl", "Gender Neutral", "Garden", "Indoor", "Elegant", "Casual", "Theme"],
    locationLabel: "Party Location:",
    dateLabel: "Party Date:",
  },
  "graduation-party": {
    heroImage: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1600&q=80",
    tabs: [
      { id: "venue", label: "Venues", icon: Landmark, category: "venue" },
      { id: "catering", label: "Catering", icon: Utensils, category: "catering" },
      { id: "decorations", label: "Decorations", icon: GraduationCap, category: "decorations" },
      { id: "entertainment", label: "Entertainment", icon: Music, category: "entertainment" },
      { id: "services", label: "Services", icon: Wrench, category: "services-party" },
    ],
    filters: ["High School", "College", "Masters", "PhD", "Outdoor", "Indoor", "Casual", "Formal"],
    locationLabel: "Party Location:",
    dateLabel: "Party Date:",
  },
  "engagement-party": {
    heroImage: "https://images.unsplash.com/photo-1469371670807-013ccf25f16a?w=1600&q=80",
    tabs: [
      { id: "venue", label: "Venues", icon: Landmark, category: "venue" },
      { id: "catering", label: "Catering", icon: Wine, category: "catering" },
      { id: "photography", label: "Photography", icon: Camera, category: "photography" },
      { id: "entertainment", label: "Entertainment", icon: Music, category: "entertainment" },
      { id: "services", label: "Services", icon: Wrench, category: "services-wedding" },
    ],
    filters: ["Elegant", "Casual", "Garden", "Rooftop", "Beach", "Restaurant", "Home", "Cocktail"],
    locationLabel: "Party Location:",
    dateLabel: "Party Date:",
  },
  "housewarming-party": {
    heroImage: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1600&q=80",
    tabs: [
      { id: "catering", label: "Catering", icon: Utensils, category: "catering" },
      { id: "decorations", label: "Decorations", icon: Home, category: "decorations" },
      { id: "entertainment", label: "Entertainment", icon: Music, category: "entertainment" },
      { id: "rentals", label: "Rentals", icon: Package, category: "rentals" },
      { id: "services", label: "Services", icon: Wrench, category: "services-party" },
    ],
    filters: ["Casual", "Formal", "BBQ", "Cocktail", "Brunch", "Dinner", "Open House", "Theme"],
    locationLabel: "Party Location:",
    dateLabel: "Party Date:",
  },
  "retirement-party": {
    heroImage: "https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=1600&q=80",
    tabs: [
      { id: "venue", label: "Venues", icon: Landmark, category: "venue" },
      { id: "catering", label: "Catering", icon: Wine, category: "catering" },
      { id: "entertainment", label: "Entertainment", icon: Music, category: "entertainment" },
      { id: "decorations", label: "Decorations", icon: PartyPopper, category: "decorations" },
      { id: "services", label: "Services", icon: Wrench, category: "services-party" },
    ],
    filters: ["Elegant", "Casual", "Office", "Restaurant", "Garden", "Formal", "Surprise", "Milestone"],
    locationLabel: "Party Location:",
    dateLabel: "Party Date:",
  },
  "career-achievement-party": {
    heroImage: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1600&q=80",
    tabs: [
      { id: "venue", label: "Venues", icon: Landmark, category: "venue" },
      { id: "catering", label: "Catering", icon: Utensils, category: "catering" },
      { id: "av", label: "A/V Equipment", icon: Award, category: "av-equipment" },
      { id: "entertainment", label: "Entertainment", icon: Music, category: "entertainment" },
      { id: "services", label: "Services", icon: Wrench, category: "services-corporate" },
    ],
    filters: ["Promotion", "Award", "Milestone", "Corporate", "Formal", "Cocktail", "Dinner", "Gala"],
    locationLabel: "Event Location:",
    dateLabel: "Event Date:",
  },
  "farewell-party": {
    heroImage: "https://images.unsplash.com/photo-1496024840928-4c417adf211d?w=1600&q=80",
    tabs: [
      { id: "venue", label: "Venues", icon: Landmark, category: "venue" },
      { id: "catering", label: "Catering", icon: Utensils, category: "catering" },
      { id: "entertainment", label: "Entertainment", icon: Music, category: "entertainment" },
      { id: "decorations", label: "Decorations", icon: Gift, category: "decorations" },
      { id: "services", label: "Services", icon: Wrench, category: "services-party" },
    ],
    filters: ["Casual", "Formal", "Office", "Outdoor", "Restaurant", "Surprise", "Sentimental", "Fun"],
    locationLabel: "Party Location:",
    dateLabel: "Party Date:",
  },
  "holiday-party": {
    heroImage: "https://images.unsplash.com/photo-1482517967863-00e15c9b44be?w=1600&q=80",
    tabs: [
      { id: "venue", label: "Venues", icon: Landmark, category: "venue" },
      { id: "catering", label: "Catering", icon: Utensils, category: "catering" },
      { id: "decorations", label: "Decorations", icon: TreePine, category: "decorations" },
      { id: "entertainment", label: "Entertainment", icon: Music, category: "entertainment" },
      { id: "services", label: "Services", icon: Wrench, category: "services-party" },
    ],
    filters: ["Christmas", "New Year", "Thanksgiving", "Easter", "Halloween", "July 4th", "Corporate", "Family"],
    locationLabel: "Party Location:",
    dateLabel: "Party Date:",
  },
};

const slugAliases: Record<string, string> = {
  "romance": "date-night",
  "corporate": "corporate-events",
};

function resolveSlug(slug: string): string {
  return slugAliases[slug] || slug;
}

interface OptimizationResult {
  overallScore: number;
  summary: string;
  recommendations: Array<{
    type: string;
    title: string;
    description: string;
    impact: string;
    potentialSavings: number | null;
  }>;
  optimizedSchedule: Array<{
    time: string;
    activity: string;
    location: string;
    notes: string;
  }>;
  estimatedTotal: {
    original: number;
    optimized: number;
    savings: number;
  };
  warnings: string[];
}

function AIOptimizationTab({ 
  experienceType, 
  destination, 
  date, 
  cart 
}: { 
  experienceType: ExperienceType; 
  destination: string; 
  date?: Date; 
  cart: CartItem[];
}) {
  const [optimizing, setOptimizing] = useState(false);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runOptimization = async () => {
    setOptimizing(true);
    setError(null);
    
    try {
      const response = await fetch("/api/ai/optimize-experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          experienceType: experienceType.name,
          destination,
          date: date?.toISOString(),
          selectedServices: cart.map(item => ({
            name: item.name,
            provider: item.provider,
            price: item.price,
            category: item.type
          })),
          preferences: {}
        })
      });

      if (!response.ok) {
        throw new Error("Failed to optimize");
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError("Unable to run optimization. Please try again.");
    } finally {
      setOptimizing(false);
    }
  };

  if (result) {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white",
                result.overallScore >= 80 ? "bg-green-500" : 
                result.overallScore >= 60 ? "bg-amber-500" : "bg-red-500"
              )}>
                {result.overallScore}
              </div>
              <div>
                <h3 className="text-xl font-semibold">Optimization Score</h3>
                <p className="text-sm text-muted-foreground">{result.summary}</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setResult(null)} data-testid="button-reoptimize">
              Run Again
            </Button>
          </div>

          {result.estimatedTotal.savings > 0 && (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md p-4 mb-4">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <Sparkles className="w-5 h-5" />
                <span className="font-semibold">Potential Savings: ${result.estimatedTotal.savings}</span>
              </div>
            </div>
          )}
        </Card>

        {result.recommendations.length > 0 && (
          <Card className="p-6">
            <h4 className="font-semibold mb-4 flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-[#FF385C]" />
              Recommendations
            </h4>
            <div className="space-y-3">
              {result.recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                  <div className={cn(
                    "w-2 h-2 rounded-full mt-2 flex-shrink-0",
                    rec.impact === "high" ? "bg-red-500" :
                    rec.impact === "medium" ? "bg-amber-500" : "bg-blue-500"
                  )} />
                  <div>
                    <div className="font-medium">{rec.title}</div>
                    <p className="text-sm text-muted-foreground">{rec.description}</p>
                    {rec.potentialSavings && (
                      <Badge variant="secondary" className="mt-1">
                        Save ${rec.potentialSavings}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {result.optimizedSchedule.length > 0 && (
          <Card className="p-6">
            <h4 className="font-semibold mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#FF385C]" />
              Optimized Schedule
            </h4>
            <div className="space-y-2">
              {result.optimizedSchedule.map((item, i) => (
                <div key={i} className="flex items-start gap-4 p-3 rounded-md bg-muted/50">
                  <span className="text-sm font-medium text-muted-foreground w-20 flex-shrink-0">
                    {item.time}
                  </span>
                  <div>
                    <div className="font-medium">{item.activity}</div>
                    <p className="text-sm text-muted-foreground">{item.location}</p>
                    {item.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {result.warnings.length > 0 && (
          <Card className="p-6 border-amber-200 dark:border-amber-800">
            <h4 className="font-semibold mb-3 text-amber-600 dark:text-amber-400">Warnings</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {result.warnings.map((warning, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-amber-500">!</span>
                  {warning}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    );
  }

  return (
    <Card className="p-8 text-center">
      <Wand2 className="w-12 h-12 text-[#FF385C] mx-auto mb-4" />
      <h3 className="text-xl font-semibold mb-2">AI Optimization</h3>
      <p className="text-muted-foreground mb-4 max-w-md mx-auto">
        Let our AI analyze your selections and optimize your {experienceType.name.toLowerCase()} plan
        for the best experience, timing, and value.
      </p>
      
      {cart.length === 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">
          Add some items to your cart first for better optimization results.
        </p>
      )}

      {error && (
        <p className="text-sm text-red-500 mb-4">{error}</p>
      )}

      <Button 
        className="bg-[#FF385C] hover:bg-[#E23350]" 
        onClick={runOptimization}
        disabled={optimizing}
        data-testid="button-optimize"
      >
        {optimizing ? (
          <>
            <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Optimizing...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" />
            Optimize My {experienceType.name}
          </>
        )}
      </Button>
    </Card>
  );
}

export default function ExperienceTemplatePage() {
  const [, params] = useRoute("/experiences/:slug");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const rawSlug = params?.slug || "";
  const slug = resolveSlug(rawSlug);
  
  const { data: experienceType, isLoading: typeLoading } = useQuery<ExperienceType>({
    queryKey: ["/api/experience-types", slug],
    queryFn: async () => {
      const res = await fetch(`/api/experience-types/${slug}`);
      if (!res.ok) throw new Error("Experience type not found");
      return res.json();
    },
    enabled: !!slug,
  });

  const { data: services, isLoading: servicesLoading } = useQuery<ProviderService[]>({
    queryKey: ["/api/provider-services"],
  });

  interface ServerCartItem {
    id: string;
    serviceId: string;
    quantity: number;
    service: { id: string; serviceName: string; price: string; location?: string } | null;
  }

  interface ServerCartData {
    items: ServerCartItem[];
    subtotal: string;
    total: string;
    itemCount: number;
  }

  const { data: serverCart, refetch: refetchCart } = useQuery<ServerCartData>({
    queryKey: ["/api/cart", slug],
    queryFn: async () => {
      const res = await fetch(`/api/cart?experience=${slug}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch cart");
      return res.json();
    },
    enabled: !!slug,
  });

  const [localExternalCart, setLocalExternalCart] = useState<CartItem[]>(() => {
    try {
      const stored = sessionStorage.getItem(`externalCart_${slug}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`externalCart_${slug}`);
      setLocalExternalCart(stored ? JSON.parse(stored) : []);
    } catch {
      setLocalExternalCart([]);
    }
  }, [slug]);

  useEffect(() => {
    if (localExternalCart.length > 0) {
      sessionStorage.setItem(`externalCart_${slug}`, JSON.stringify(localExternalCart));
    } else {
      sessionStorage.removeItem(`externalCart_${slug}`);
    }
  }, [localExternalCart, slug]);

  const cart: CartItem[] = useMemo(() => {
    const platformItems: CartItem[] = serverCart?.items ? serverCart.items.map((item) => ({
      id: item.serviceId,
      cartItemId: item.id,
      type: "service",
      name: item.service?.serviceName || "Unknown Service",
      price: parseFloat(item.service?.price || "0"),
      quantity: item.quantity || 1,
      provider: "Platform Provider",
    })) : [];
    return [...platformItems, ...localExternalCart];
  }, [serverCart, localExternalCart]);

  const config = experienceConfigs[slug] || experienceConfigs.wedding;
  
  const [destination, setDestination] = useState("");
  const [originCity, setOriginCity] = useState("");
  const [originCode, setOriginCode] = useState("");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [activeTab, setActiveTab] = useState(config.tabs[0]?.id || "venue");
  const [searchQuery, setSearchQuery] = useState("");
  const [priceRange, setPriceRange] = useState([0, 500]);
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState("popular");
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  
  // Flight-specific filters
  const [flightMaxPrice, setFlightMaxPrice] = useState(2000);
  const [flightStops, setFlightStops] = useState<"any" | "nonstop" | "1stop">("any");
  const [flightSortBy, setFlightSortBy] = useState<"price" | "duration" | "departure">("price");
  
  // Hotel-specific filters
  const [hotelMaxPrice, setHotelMaxPrice] = useState(5000);
  const [hotelStarRating, setHotelStarRating] = useState<number>(0);
  const [hotelSortBy, setHotelSortBy] = useState<"price" | "rating">("price");
  const [travelers, setTravelers] = useState(2);
  const [detailsSubmitted, setDetailsSubmitted] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [aiOptimizeOpen, setAiOptimizeOpen] = useState(false);
  const [generatingItinerary, setGeneratingItinerary] = useState(false);
  const [creatingComparison, setCreatingComparison] = useState(false);
  const [addVenueModalOpen, setAddVenueModalOpen] = useState(false);

  const { data: customVenues = [] } = useQuery<CustomVenue[]>({
    queryKey: ["/api/custom-venues", slug],
    queryFn: async () => {
      const res = await fetch(`/api/custom-venues?experienceType=${slug}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!slug,
  });

  const createComparison = async () => {
    if (cart.length === 0) {
      toast({ variant: "destructive", title: "Cart is empty", description: "Add some services first" });
      return;
    }
    if (!user) {
      toast({ title: "Please sign in", description: "Sign in to use AI comparison" });
      return;
    }
    setCreatingComparison(true);
    
    const cartItems = cart.map((item) => ({
      name: item.name,
      category: item.type,
      price: item.price.toString(),
      provider: item.provider || "Provider",
      location: destination
    }));
    
    try {
      const response = await apiRequest("POST", "/api/itinerary-comparisons", {
        title: `${experienceType?.name || "Trip"} Experience`,
        destination: destination,
        startDate: startDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
        endDate: endDate?.toISOString().split('T')[0] || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        budget: cartTotal.toString(),
        travelers: 2
      });
      
      const comparison = await response.json();
      sessionStorage.setItem(`comparison_baseline_${comparison.id}`, JSON.stringify(cartItems));
      setCartOpen(false);
      setLocation(`/itinerary-comparison/${comparison.id}`);
    } catch (error: any) {
      console.error("Failed to create comparison:", error);
      toast({ 
        variant: "destructive", 
        title: "Failed to create comparison",
        description: error?.message || "Please try again"
      });
    } finally {
      setCreatingComparison(false);
    }
  };

  const { data: walletData } = useQuery<{ balance: number }>({
    queryKey: ["/api/wallet"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/wallet", { credentials: "include" });
        if (!res.ok) return { balance: 0 };
        return res.json();
      } catch {
        return { balance: 0 };
      }
    },
    retry: false,
    staleTime: 30000,
  });

  const userCredits = walletData?.balance ?? 0;

  const dateError = useMemo(() => {
    if (startDate && endDate && endDate < startDate) {
      return "End date cannot be before start date";
    }
    return null;
  }, [startDate, endDate]);

  const handleEndDateSelect = (date: Date | undefined) => {
    if (date && startDate && date < startDate) {
      setEndDate(startDate);
    } else {
      setEndDate(date);
    }
  };

  const canGenerateItinerary = !dateError && destination.trim();

  const generateItinerary = async () => {
    if (!canGenerateItinerary || cart.length === 0) return;
    setGeneratingItinerary(true);
    
    // Store experience context for cart page to use
    const experienceContext = {
      experienceType: experienceType?.name,
      destination,
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
      selectedServices: cart.map(item => ({
        name: item.name,
        provider: item.provider,
        price: item.price,
        category: item.type
      }))
    };
    sessionStorage.setItem("experienceContext", JSON.stringify(experienceContext));
    
    try {
      const response = await fetch("/api/ai/optimize-experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...experienceContext,
          preferences: {}
        })
      });
      if (response.ok) {
        const result = await response.json();
        // Store optimization result for cart page to pick up
        sessionStorage.setItem("optimizationResult", JSON.stringify(result));
        // Navigate to cart with itinerary step
        setLocation("/cart?step=itinerary");
      } else {
        // Go to cart without optimization
        setLocation("/cart");
      }
    } catch (error) {
      console.error("Failed to generate itinerary:", error);
      setLocation("/cart");
    } finally {
      setGeneratingItinerary(false);
    }
  };

  const openExpertChat = () => {
    setChatOpen(true);
  };

  const toggleFilter = (filter: string) => {
    setSelectedFilters((prev) =>
      prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter]
    );
  };

  const isExternalProviderItem = (itemOrId: CartItem | string) => {
    if (typeof itemOrId === 'object') {
      return itemOrId.isExternal === true;
    }
    const item = cart.find(i => i.id === itemOrId);
    return item?.isExternal === true;
  };

  const addToCart = async (item: CartItem) => {
    if (!user) {
      toast({ 
        variant: "destructive", 
        title: "Sign in required", 
        description: "Please sign in to add items to your cart" 
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 1500);
      return;
    }
    
    const isCustomVenue = item.id.startsWith("custom-");
    const isExternal = item.isExternal === true;
    const existing = cart.find((i) => i.id === item.id);
    
    if (isExternal) {
      if (existing) {
        setLocalExternalCart(prev => prev.map(i => 
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        ));
        toast({ title: "Cart updated", description: "Item quantity increased" });
      } else {
        setLocalExternalCart(prev => [...prev, { ...item, quantity: item.quantity || 1 }]);
        toast({ title: "Added to cart", description: `${item.name} added to your cart` });
      }
      sessionStorage.setItem("experienceContext", JSON.stringify({
        title: `${experienceType?.name || slug} Experience`,
        experienceType: experienceType?.name || slug,
        experienceSlug: slug,
        destination,
        startDate: startDate?.toISOString().split('T')[0],
        endDate: endDate?.toISOString().split('T')[0],
        travelers: 2
      }));
      return;
    }
    
    if (existing && existing.cartItemId) {
      try {
        await apiRequest("PATCH", `/api/cart/${existing.cartItemId}`, { quantity: existing.quantity + 1 });
        queryClient.invalidateQueries({ queryKey: ["/api/cart", slug] });
        toast({ title: "Cart updated", description: "Item quantity increased" });
      } catch (error) {
        toast({ variant: "destructive", title: "Failed to update cart" });
      }
    } else if (!existing) {
      try {
        const payload: any = { quantity: 1, experienceSlug: slug };
        if (isCustomVenue) {
          payload.customVenueId = item.id.replace("custom-", "");
        } else {
          payload.serviceId = item.id;
        }
        await apiRequest("POST", "/api/cart", payload);
        queryClient.invalidateQueries({ queryKey: ["/api/cart", slug] });
        toast({ title: "Added to cart", description: `${item.name} added to your cart` });
      } catch (error) {
        toast({ variant: "destructive", title: "Failed to add to cart" });
      }
    }
    // Store experience context and navigate to full cart page
    sessionStorage.setItem("experienceContext", JSON.stringify({
      title: `${experienceType?.name || slug} Experience`,
      experienceType: experienceType?.name || slug,
      experienceSlug: slug,
      destination,
      startDate: startDate?.toISOString().split('T')[0],
      endDate: endDate?.toISOString().split('T')[0],
      travelers: 2
    }));
    setLocation("/cart");
  };

  const removeFromCart = async (id: string) => {
    if (isExternalProviderItem(id)) {
      setLocalExternalCart(prev => prev.filter(i => i.id !== id));
      toast({ title: "Removed from cart" });
      return;
    }
    
    const item = cart.find((i) => i.id === id);
    if (item?.cartItemId) {
      try {
        await apiRequest("DELETE", `/api/cart/${item.cartItemId}`);
        queryClient.invalidateQueries({ queryKey: ["/api/cart", slug] });
      } catch (error) {
        toast({ variant: "destructive", title: "Failed to remove from cart" });
      }
    }
  };

  const updateCartQuantity = async (id: string, quantity: number) => {
    const clampedQty = Math.max(1, Math.min(10, quantity));
    
    if (isExternalProviderItem(id)) {
      setLocalExternalCart(prev => prev.map(i => 
        i.id === id ? { ...i, quantity: clampedQty } : i
      ));
      return;
    }
    
    const item = cart.find((i) => i.id === id);
    if (item?.cartItemId) {
      try {
        await apiRequest("PATCH", `/api/cart/${item.cartItemId}`, { quantity: clampedQty });
        queryClient.invalidateQueries({ queryKey: ["/api/cart", slug] });
      } catch (error) {
        toast({ variant: "destructive", title: "Failed to update quantity" });
      }
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const currentTabCategory = config.tabs.find(t => t.id === activeTab)?.category;

  const filteredServices = useMemo(() => {
    if (!services) return [];
    
    let filtered = [...services];

    if (currentTabCategory) {
      filtered = filtered.filter(s => 
        matchesCategory(
          s.serviceType || "",
          s.serviceName,
          s.description || "",
          currentTabCategory
        )
      );
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        s.serviceName.toLowerCase().includes(query) ||
        (s.shortDescription?.toLowerCase().includes(query)) ||
        (s.description?.toLowerCase().includes(query))
      );
    }

    if (priceRange[0] > 0 || priceRange[1] < 500) {
      filtered = filtered.filter(s => {
        const price = Number(s.price) || 0;
        return price >= priceRange[0] && (priceRange[1] >= 500 || price <= priceRange[1]);
      });
    }

    if (minRating > 0) {
      filtered = filtered.filter(s => (Number(s.averageRating) || 0) >= minRating);
    }

    if (selectedFilters.length > 0) {
      filtered = filtered.filter(s => {
        const desc = (s.description || "").toLowerCase();
        const name = s.serviceName.toLowerCase();
        return selectedFilters.some(f => 
          desc.includes(f.toLowerCase()) || name.includes(f.toLowerCase())
        );
      });
    }

    if (sortBy === "price-low") {
      filtered.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    } else if (sortBy === "price-high") {
      filtered.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    } else if (sortBy === "rating") {
      filtered.sort((a, b) => (Number(b.averageRating) || 0) - (Number(a.averageRating) || 0));
    }

    return filtered;
  }, [services, searchQuery, priceRange, minRating, sortBy, currentTabCategory, selectedFilters]);

  const mapProviders = useMemo(() => {
    const serviceMarkers = filteredServices.map((s, index) => {
      const numericId = typeof s.id === 'number' ? s.id : parseInt(String(s.id), 10) || index;
      const baseHash = numericId * 1000;
      const latOffset = ((baseHash % 100) - 50) / 1000;
      const lngOffset = (((baseHash + 37) % 100) - 50) / 1000;
      return {
        id: s.id.toString(),
        name: s.serviceName,
        category: s.serviceType || currentTabCategory || "venue",
        price: Number(s.price) || 0,
        rating: Number(s.averageRating) || 4.5,
        lat: 40.7128 + latOffset,
        lng: -74.0060 + lngOffset,
        description: s.shortDescription || s.description || undefined
      };
    });
    
    const customVenueMarkers = (activeTab === "venue" || activeTab === "accommodations" || activeTab === "hotels")
      ? customVenues
          .filter(v => v.latitude && v.longitude)
          .map(v => ({
            id: `custom-${v.id}`,
            name: v.name,
            category: "custom-venue",
            price: Number(v.estimatedCost) || 0,
            rating: 5,
            lat: Number(v.latitude),
            lng: Number(v.longitude),
            description: v.address || v.notes || "Custom location"
          }))
      : [];
    
    return [...customVenueMarkers, ...serviceMarkers];
  }, [filteredServices, currentTabCategory, customVenues, activeTab]);

  const selectedProviderIds = useMemo(() => cart.map(item => item.id), [cart]);

  const activityLocations = useMemo(() => {
    return cart
      .filter(item => item.type === "activities" && item.metadata?.meetingPointCoordinates)
      .map(item => ({
        id: item.id,
        name: item.name,
        lat: item.metadata!.meetingPointCoordinates!.lat,
        lng: item.metadata!.meetingPointCoordinates!.lng,
        meetingPoint: item.metadata?.meetingPoint,
        duration: item.metadata?.duration,
      }));
  }, [cart]);

  const hotelLocation = useMemo(() => {
    const hotelItem = cart.find(item => 
      (item.type === "hotels" || item.type === "hotel" || item.type === "accommodations") && 
      item.metadata?.rawData?.hotel?.latitude
    );
    if (hotelItem?.metadata?.rawData?.hotel) {
      const hotel = hotelItem.metadata.rawData.hotel;
      return {
        id: hotelItem.id,
        name: hotelItem.name,
        lat: hotel.latitude,
        lng: hotel.longitude,
      };
    }
    return undefined;
  }, [cart]);

  const [transitRoutes, setTransitRoutes] = useState<Map<string, any>>(new Map());
  const [highlightedActivityId, setHighlightedActivityId] = useState<string | null>(null);

  // Auto-fetch transit routes when hotel and activities are available
  useEffect(() => {
    if (!hotelLocation || activityLocations.length === 0) {
      setTransitRoutes(new Map());
      return;
    }
    
    const fetchTransitRoutes = async () => {
      try {
        const res = await fetch("/api/routes/transit-multi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            origin: {
              lat: hotelLocation.lat,
              lng: hotelLocation.lng,
              name: hotelLocation.name,
            },
            destinations: activityLocations.map(a => ({
              id: a.id,
              lat: a.lat,
              lng: a.lng,
              name: a.name,
            })),
          }),
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data?.routes) {
            const routeMap = new Map<string, any>();
            Object.entries(data.routes).forEach(([id, route]) => {
              routeMap.set(id, route);
            });
            setTransitRoutes(routeMap);
          }
        }
      } catch (error) {
        console.error("Failed to fetch transit routes:", error);
      }
    };
    
    fetchTransitRoutes();
  }, [
    hotelLocation?.id, 
    hotelLocation?.lat, 
    hotelLocation?.lng,
    JSON.stringify(activityLocations.map(a => ({ id: a.id, lat: a.lat, lng: a.lng })))
  ]);

  if (typeLoading) {
    return (
      <Layout>
        <div className="min-h-screen bg-background">
          <Skeleton className="h-[320px] w-full" />
          <div className="container mx-auto px-4 py-8">
            <Skeleton className="h-12 w-full mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-64 w-full" />
              ))}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!experienceType) {
    return (
      <Layout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Card className="p-8 max-w-md text-center">
            <h2 className="text-xl font-semibold mb-2">Experience Not Found</h2>
            <p className="text-muted-foreground mb-6">
              The experience type you're looking for doesn't exist.
            </p>
            <Link href="/">
              <Button data-testid="button-back-home">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <PanelGroup direction="horizontal" className="h-screen hidden lg:flex">
          <Panel defaultSize={60} minSize={40} maxSize={80} className="flex flex-col overflow-hidden">
          {/* Hero Section with ribbon bar */}
          <div className="relative h-56 md:h-72 lg:h-80 flex-shrink-0 overflow-hidden">
            <div 
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url('${config.heroImage}')` }}
            />

            {/* White ribbon bar with Credits, Expert Help, Cart, Generate Itinerary */}
            <div className="absolute top-0 left-0 right-0 bg-white/90 backdrop-blur-sm px-4 py-2 flex items-center justify-end gap-3 z-10">
              <Link href="/credits">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  data-testid="button-credits"
                >
                  <Coins className="w-4 h-4 text-amber-500" />
                  {userCredits} Credits
                  <Plus className="w-3 h-3" />
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={openExpertChat}
                data-testid="button-expert-help-ribbon"
              >
                <MessageCircle className="w-4 h-4" />
                Get Expert Help
              </Button>
              {/* Separate Cart Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Store experience context for cart page
                  sessionStorage.setItem("experienceContext", JSON.stringify({
                    title: `${experienceType.name} Experience`,
                    experienceType: experienceType.name,
                    experienceSlug: slug,
                    destination,
                    startDate: startDate?.toISOString().split('T')[0],
                    endDate: endDate?.toISOString().split('T')[0],
                    travelers: 2
                  }));
                  setLocation("/cart");
                }}
                className="gap-1.5"
                data-testid="button-cart-ribbon"
              >
                <ShoppingCart className="w-4 h-4" />
                <span data-testid="text-cart-items">{cart.length}</span>
                <span className="text-muted-foreground">|</span>
                <span data-testid="text-cart-total">${cartTotal.toLocaleString()}</span>
              </Button>
              {/* Separate Generate Itinerary Button */}
              <Button
                size="sm"
                onClick={generateItinerary}
                disabled={!canGenerateItinerary || generatingItinerary || cart.length === 0}
                className="gap-1.5 bg-[#FF385C] hover:bg-[#E23350]"
                data-testid="button-generate-ribbon"
              >
                {generatingItinerary ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                Generate Itinerary
              </Button>
            </div>
          </div>

          {/* Trip Details Card - negative margin overlay */}
          <Card className="bg-white dark:bg-gray-800 rounded-xl shadow-md border p-4 sm:p-6 w-full max-w-xl mx-auto mt-[-200px] z-20 relative">
            <CardContent className="p-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {experienceType.name} Details
                </h2>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-500" />
                  <Select value={travelers.toString()} onValueChange={(v) => setTravelers(parseInt(v))}>
                    <SelectTrigger className="w-[140px] h-8" data-testid="select-travelers">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <SelectItem key={n} value={n.toString()} data-testid={`select-travelers-${n}`}>
                          {n} {n === 1 ? 'traveler' : 'travelers'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="location" className="text-sm font-medium">
                    {config.locationLabel}
                  </Label>
                  <Input
                    id="location"
                    placeholder="Eg: Paris, New York, Japan"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="mt-1"
                    data-testid="input-location"
                  />
                </div>

                <div>
                  <Label htmlFor="origin" className="text-sm font-medium">
                    City of Origin:
                  </Label>
                  <Input
                    id="origin"
                    placeholder="Eg: Los Angeles, Chicago, Miami"
                    value={originCity}
                    onChange={(e) => {
                      setOriginCity(e.target.value);
                      setOriginCode("");
                    }}
                    className="mt-1"
                    data-testid="input-origin"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium">{config.dateLabel}</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div>
                      <span className="text-sm text-muted-foreground">From</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              "w-full mt-1 justify-start text-left font-normal",
                              !startDate && "text-muted-foreground",
                              dateError && "border-red-500"
                            )}
                            data-testid="button-start-date"
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            {startDate ? format(startDate, "M/d/yyyy") : "Select"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <CalendarComponent
                            mode="single"
                            selected={startDate}
                            onSelect={setStartDate}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">To</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              "w-full mt-1 justify-start text-left font-normal",
                              !endDate && "text-muted-foreground",
                              dateError && "border-red-500"
                            )}
                            data-testid="button-end-date"
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            {endDate ? format(endDate, "M/d/yyyy") : "Select"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <CalendarComponent
                            mode="single"
                            selected={endDate}
                            onSelect={handleEndDateSelect}
                            disabled={(date) => startDate ? date < startDate : false}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  {dateError && (
                    <p className="text-xs text-red-500 mt-1" data-testid="text-date-error">{dateError}</p>
                  )}
                </div>

                <Button 
                  className="w-full bg-[#FF385C] hover:bg-[#E23350] text-white"
                  disabled={!!dateError || !destination.trim()}
                  onClick={() => {
                    setDetailsSubmitted(true);
                    toast({
                      title: "Details Saved",
                      description: "Your travel details have been applied. Browse the tabs to find flights, hotels, and more!"
                    });
                  }}
                  data-testid="button-submit-details"
                >
                  Submit {experienceType.name} Details
                </Button>
              </div>
            </CardContent>
          </Card>

        <div className="sticky top-0 z-40 bg-white dark:bg-gray-800 border-b">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="h-auto bg-transparent p-0 gap-0">
                  {config.tabs.map((tab) => (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className={cn(
                        "rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-[#FF385C] data-[state=active]:text-[#FF385C]",
                        "data-[state=active]:shadow-none"
                      )}
                      data-testid={`tab-${tab.id}`}
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* Parallel lines below tabs */}
                <div className="mt-2 space-y-1">
                  <div className="h-px bg-gray-200 dark:bg-gray-700 w-full"></div>
                  <div className="h-px bg-gray-200 dark:bg-gray-700 w-full"></div>
                </div>
              </Tabs>

              <Sheet open={cartOpen} onOpenChange={setCartOpen}>
                <SheetContent className="flex flex-col h-full">
                  <SheetHeader className="flex-shrink-0">
                    <SheetTitle>Your Selection</SheetTitle>
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto mt-4 pr-1">
                    {cart.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">Your cart is empty</p>
                    ) : (
                      <div className="space-y-4 pb-4">
                        {cart.map((item) => (
                          <Card key={item.id}>
                            <CardContent className="p-4">
                              <div className="flex justify-between items-start mb-3">
                                <div>
                                  <h4 className="font-medium">{item.name}</h4>
                                  <p className="text-sm text-muted-foreground">{item.provider}</p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeFromCart(item.id)}
                                  data-testid={`button-remove-${item.id}`}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs text-muted-foreground">Quantity: {item.quantity}</Label>
                                  <span className="text-sm font-medium">${item.price * item.quantity}</span>
                                </div>
                                <Slider
                                  value={[item.quantity]}
                                  onValueChange={([val]) => updateCartQuantity(item.id, val)}
                                  min={1}
                                  max={10}
                                  step={1}
                                  className="w-full"
                                  data-testid={`slider-quantity-${item.id}`}
                                />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                  {cart.length > 0 && (
                    <div className="flex-shrink-0 pt-4 border-t mt-auto">
                      <CheckoutExpertBanner 
                        onConnect={() => {
                          setCartOpen(false);
                          openExpertChat();
                        }}
                        cartTotal={cartTotal}
                      />
                      <div className="flex justify-between mb-4">
                        <span className="font-medium">Total</span>
                        <span className="font-bold">${cartTotal}</span>
                      </div>
                      <div className="space-y-2">
                        <Button 
                          className="w-full bg-[#FF385C] hover:bg-[#E23350]"
                          onClick={createComparison}
                          disabled={creatingComparison}
                          data-testid="button-compare-ai"
                        >
                          {creatingComparison ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <GitCompare className="w-4 h-4 mr-2" />
                          )}
                          Compare AI Alternatives
                        </Button>
                        <Button 
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            setCartOpen(false);
                            setTimeout(() => setLocation("/cart"), 150);
                          }}
                          data-testid="button-checkout"
                        >
                          Proceed to Checkout
                        </Button>
                      </div>
                    </div>
                  )}
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-6">
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="gap-2 mb-4" data-testid="button-toggle-filters">
                <SlidersHorizontal className="w-4 h-4" />
                Filters & Sort
                <ChevronDown className={cn("w-4 h-4 transition-transform", filtersOpen && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card className="mb-6">
                <CardContent className="p-4 space-y-4">
                  {activeTab === "flights" ? (
                    <>
                      <div className="flex flex-wrap gap-4">
                        <div className="min-w-[200px] flex-1">
                          <Label className="text-sm font-medium">Max Price: ${flightMaxPrice}</Label>
                          <Slider
                            value={[flightMaxPrice]}
                            onValueChange={(v) => setFlightMaxPrice(v[0])}
                            min={100}
                            max={5000}
                            step={100}
                            className="mt-2"
                            data-testid="slider-flight-price"
                          />
                        </div>

                        <div className="min-w-[200px] flex-1">
                          <Label className="text-sm font-medium">Stops</Label>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {[
                              { value: "any", label: "Any" },
                              { value: "nonstop", label: "Nonstop" },
                              { value: "1stop", label: "1 Stop" },
                            ].map((option) => (
                              <Button
                                key={option.value}
                                variant={flightStops === option.value ? "default" : "outline"}
                                size="sm"
                                onClick={() => setFlightStops(option.value as "any" | "nonstop" | "1stop")}
                                className={flightStops === option.value ? "bg-[#FF385C]" : ""}
                                data-testid={`button-stops-${option.value}`}
                              >
                                {option.label}
                              </Button>
                            ))}
                          </div>
                        </div>

                        <div className="min-w-[140px] max-w-[180px]">
                          <Label className="text-sm font-medium">Sort By</Label>
                          <Select value={flightSortBy} onValueChange={(v) => setFlightSortBy(v as "price" | "duration" | "departure")}>
                            <SelectTrigger className="mt-2" data-testid="select-flight-sort">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="price">Lowest Price</SelectItem>
                              <SelectItem value="duration">Shortest Duration</SelectItem>
                              <SelectItem value="departure">Earliest Departure</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </>
                  ) : activeTab === "hotels" || activeTab === "accommodations" ? (
                    <>
                      <div className="flex flex-wrap gap-4">
                        <div className="min-w-[200px] flex-1">
                          <Label className="text-sm font-medium">Max Price/Night: ${hotelMaxPrice}</Label>
                          <Slider
                            value={[hotelMaxPrice]}
                            onValueChange={(v) => setHotelMaxPrice(v[0])}
                            min={50}
                            max={1000}
                            step={25}
                            className="mt-2"
                            data-testid="slider-hotel-price"
                          />
                        </div>

                        <div className="min-w-[200px] flex-1">
                          <Label className="text-sm font-medium">Star Rating</Label>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {[0, 3, 4, 5].map((stars) => (
                              <Button
                                key={stars}
                                variant={hotelStarRating === stars ? "default" : "outline"}
                                size="sm"
                                onClick={() => setHotelStarRating(stars)}
                                className={hotelStarRating === stars ? "bg-[#FF385C]" : ""}
                                data-testid={`button-stars-${stars}`}
                              >
                                {stars === 0 ? "All" : <><Star className="w-3 h-3 mr-1 fill-current" />{stars}+</>}
                              </Button>
                            ))}
                          </div>
                        </div>

                        <div className="min-w-[140px] max-w-[180px]">
                          <Label className="text-sm font-medium">Sort By</Label>
                          <Select value={hotelSortBy} onValueChange={(v) => setHotelSortBy(v as "price" | "rating")}>
                            <SelectTrigger className="mt-2" data-testid="select-hotel-sort">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="price">Lowest Price</SelectItem>
                              <SelectItem value="rating">Highest Rating</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label className="text-sm font-medium">Search</Label>
                        <div className="relative mt-1">
                          <Input
                            placeholder="Search by name, provider, or description..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                            data-testid="input-search"
                          />
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-4">
                        <div className="min-w-[200px] flex-1">
                          <Label className="text-sm font-medium">Price Range: ${priceRange[0]} - ${priceRange[1]}+</Label>
                          <Slider
                            value={priceRange}
                            onValueChange={setPriceRange}
                            max={500}
                            step={10}
                            className="mt-2"
                            data-testid="slider-price"
                          />
                        </div>

                        <div className="min-w-[200px] flex-1">
                          <Label className="text-sm font-medium">Minimum Rating</Label>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {[0, 3, 3.5, 4, 4.5].map((rating) => (
                              <Button
                                key={rating}
                                variant={minRating === rating ? "default" : "outline"}
                                size="sm"
                                onClick={() => setMinRating(rating)}
                                className={minRating === rating ? "bg-[#FF385C]" : ""}
                                data-testid={`button-rating-${rating}`}
                              >
                                {rating === 0 ? "All" : <><Star className="w-3 h-3 mr-1" />{rating}+</>}
                              </Button>
                            ))}
                          </div>
                        </div>

                        <div className="min-w-[140px] max-w-[180px]">
                          <Label className="text-sm font-medium">Sort By</Label>
                          <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="mt-2" data-testid="select-sort">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="popular">Most Popular</SelectItem>
                              <SelectItem value="price-low">Price: Low to High</SelectItem>
                              <SelectItem value="price-high">Price: High to Low</SelectItem>
                              <SelectItem value="rating">Highest Rated</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium mb-2 block">Preferences</Label>
                        <div className="flex flex-wrap gap-2">
                          {config.filters.map((filter) => (
                            <Badge
                              key={filter}
                              variant={selectedFilters.includes(filter) ? "default" : "outline"}
                              className={cn(
                                "cursor-pointer",
                                selectedFilters.includes(filter) && "bg-[#FF385C]"
                              )}
                              onClick={() => toggleFilter(filter)}
                              data-testid={`filter-${filter.toLowerCase()}`}
                            >
                              {filter}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {activeTab === "flights" && !detailsSubmitted && (
            <Card className="border-2 border-dashed mb-6">
              <CardContent className="p-8 text-center">
                <Plane className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <h3 className="font-semibold text-lg mb-2">Search Flights</h3>
                <p className="text-muted-foreground">
                  Fill in your Travel Details above and click "Submit" to search for available flights.
                </p>
              </CardContent>
            </Card>
          )}

          {activeTab === "flights" && detailsSubmitted && (
            <div className="mb-6">
              <FlightSearch
                destination={destination}
                origin={originCity}
                startDate={startDate}
                endDate={endDate}
                travelers={travelers}
                maxPrice={flightMaxPrice}
                stops={flightStops}
                sortBy={flightSortBy}
                onSelectFlight={(flight) => {
                  const outbound = flight.itineraries[0];
                  const firstSegment = outbound?.segments[0];
                  const lastSegment = outbound?.segments[outbound.segments.length - 1];
                  const travelerPricing = flight.travelerPricings?.[0];
                  const fareDetails = travelerPricing?.fareDetailsBySegment?.[0];
                  const checkedBags = fareDetails?.includedCheckedBags;
                  const bagsInfo = checkedBags?.quantity !== undefined 
                    ? `${checkedBags.quantity} bag${checkedBags.quantity !== 1 ? 's' : ''}`
                    : checkedBags?.weight 
                      ? `${checkedBags.weight}${checkedBags.weightUnit || 'kg'}`
                      : undefined;
                  
                  addToCart({
                    id: `flight-${flight.id}`,
                    type: "flights",
                    name: `${firstSegment?.departure.iataCode} → ${lastSegment?.arrival.iataCode}`,
                    price: parseFloat(flight.price.total),
                    quantity: 1,
                    provider: `${firstSegment?.carrierCode} ${firstSegment?.number}`,
                    details: `${fareDetails?.cabin || 'Economy'} class${bagsInfo ? `, ${bagsInfo}` : ''}`,
                    isExternal: true,
                    metadata: {
                      cabin: fareDetails?.cabin,
                      baggage: bagsInfo,
                      stops: outbound?.segments.length - 1,
                      duration: outbound?.duration,
                      airline: firstSegment?.carrierCode,
                      flightNumber: `${firstSegment?.carrierCode}${firstSegment?.number}`,
                      departureTime: firstSegment?.departure.at,
                      arrivalTime: lastSegment?.arrival.at,
                      seatsLeft: flight.numberOfBookableSeats,
                      lastTicketingDate: flight.lastTicketingDate,
                      travelers: travelers,
                      rawData: flight,
                    },
                  });
                }}
              />
            </div>
          )}

          {(activeTab === "hotels" || activeTab === "accommodations") && !detailsSubmitted && (
            <Card className="border-2 border-dashed mb-6">
              <CardContent className="p-8 text-center">
                <Hotel className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <h3 className="font-semibold text-lg mb-2">Search Hotels</h3>
                <p className="text-muted-foreground">
                  Fill in your Travel Details above and click "Submit" to search for available hotels.
                </p>
              </CardContent>
            </Card>
          )}

          {(activeTab === "hotels" || activeTab === "accommodations") && detailsSubmitted && (
            <div className="mb-6">
              <HotelSearch
                destination={destination}
                checkIn={startDate}
                checkOut={endDate}
                guests={travelers}
                maxPrice={hotelMaxPrice}
                starRating={hotelStarRating}
                sortBy={hotelSortBy}
                activityLocations={activityLocations}
                onSelectHotel={(hotelData) => {
                  const hotel = hotelData.hotel;
                  const offer = hotelData.offers?.[0];
                  
                  const nights = offer 
                    ? Math.max(1, Math.ceil((new Date(offer.checkOutDate).getTime() - new Date(offer.checkInDate).getTime()) / (1000 * 60 * 60 * 24)))
                    : 1;
                  const totalPrice = offer ? parseFloat(offer.price.total) : 0;
                  const pricePerNight = totalPrice / nights;
                  
                  const refundStatus = offer?.policies?.refundable?.cancellationRefund;
                  const isRefundable = refundStatus === "REFUNDABLE_UP_TO_DEADLINE" || refundStatus === "REFUNDABLE";
                  const cancellationDeadline = offer?.policies?.cancellations?.[0]?.deadline;
                  const boardType = offer?.boardType;
                  
                  const roomEstimate = offer?.room?.typeEstimated;
                  const bedInfo = roomEstimate?.beds && roomEstimate?.bedType 
                    ? `${roomEstimate.beds} ${roomEstimate.bedType.toLowerCase()}` 
                    : undefined;
                  const roomCategory = roomEstimate?.category?.replace(/_/g, " ").toLowerCase();
                  
                  const taxes = offer?.price?.taxes?.filter((t: any) => !t.included);
                  const taxTotal = taxes?.reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0) || 0;
                  
                  addToCart({
                    id: `hotel-${hotel.hotelId}`,
                    type: activeTab,
                    name: hotel.name,
                    price: totalPrice,
                    quantity: 1,
                    provider: "Amadeus Hotels",
                    details: `${nights} nights${boardType ? `, ${boardType.replace(/_/g, " ").toLowerCase()}` : ''}${isRefundable ? ', refundable' : ''}`,
                    isExternal: true,
                    metadata: {
                      refundable: isRefundable,
                      cancellationDeadline: cancellationDeadline,
                      boardType: boardType,
                      bedInfo: bedInfo,
                      roomCategory: roomCategory,
                      taxTotal: taxTotal,
                      nights: nights,
                      pricePerNight: pricePerNight,
                      checkInDate: offer?.checkInDate,
                      checkOutDate: offer?.checkOutDate,
                      travelers: travelers,
                      rawData: hotelData,
                    },
                  });
                }}
              />
            </div>
          )}

          {activeTab === "services" && (
            <div className="mb-6">
              <ServiceBrowser
                defaultLocation={destination}
                showCategoryFilter={true}
                onAddToCart={(service) => {
                  addToCart({
                    id: `service-${service.id}`,
                    type: "services",
                    name: service.serviceName,
                    price: parseFloat(service.price) || 0,
                    quantity: 1,
                    provider: "Platform Service",
                  });
                }}
              />
            </div>
          )}

          {activeTab === "transportation" && !detailsSubmitted && (
            <div className="mb-6">
              <ServiceBrowser
                defaultLocation={destination}
                categorySlug="transportation-logistics"
                showCategoryFilter={false}
                title="Transportation Services"
                onAddToCart={(service) => {
                  addToCart({
                    id: `transport-${service.id}`,
                    type: "transportation",
                    name: service.serviceName,
                    price: parseFloat(service.price) || 0,
                    quantity: 1,
                    provider: "Platform Service",
                  });
                }}
              />
            </div>
          )}

          {activeTab === "transportation" && detailsSubmitted && (
            <div className="mb-6 space-y-6">
              <ActivitySearch
                destination={destination}
                startDate={startDate}
                endDate={endDate}
                travelers={travelers}
                filterType="transport"
                onSelectActivity={(activity) => {
                  const durationMinutes = activity.duration?.fixedDurationInMinutes || 
                    activity.duration?.variableDurationFromMinutes || 0;
                  const durationHours = durationMinutes > 0 ? Math.ceil(durationMinutes / 60) : undefined;
                  
                  const cancellation = activity.cancellationPolicy;
                  const fullRefund = cancellation?.refundEligibility?.find(r => r.percentageRefundable === 100);
                  const isRefundable = !!fullRefund;
                  
                  const logistics = activity.logistics as any;
                  let meetingPoint: string | undefined;
                  let meetingPointCoordinates: { lat: number; lng: number } | undefined;
                  
                  if (logistics?.start?.[0]) {
                    const startLoc = logistics.start[0].location;
                    const addr = startLoc?.address;
                    meetingPoint = startLoc?.name || 
                      [addr?.street, addr?.city, addr?.state, addr?.country].filter(Boolean).join(', ') ||
                      logistics.start[0].description;
                    if (startLoc?.coordinates) {
                      meetingPointCoordinates = {
                        lat: startLoc.coordinates.latitude,
                        lng: startLoc.coordinates.longitude
                      };
                    }
                  }
                  
                  addToCart({
                    id: `transport-viator-${activity.productCode}`,
                    type: "transportation",
                    name: activity.title,
                    price: (activity.pricing?.summary?.fromPrice || 0) * travelers,
                    quantity: 1,
                    provider: "Viator",
                    details: `${durationHours ? `${durationHours}h` : 'Duration varies'}${isRefundable ? ', Free cancellation' : ''}${meetingPoint ? ` | ${meetingPoint}` : ''}`,
                    isExternal: true,
                    metadata: {
                      refundable: isRefundable,
                      cancellationDeadline: fullRefund?.dayRangeMin ? `${fullRefund.dayRangeMin} days before` : undefined,
                      duration: durationHours ? `${durationHours} hours` : undefined,
                      travelers: travelers,
                      meetingPoint,
                      meetingPointCoordinates,
                      rawData: activity,
                    },
                  });
                }}
              />
              <ServiceBrowser
                defaultLocation={destination}
                categorySlug="transportation-logistics"
                showCategoryFilter={false}
                title="Local Transportation Services"
                onAddToCart={(service) => {
                  addToCart({
                    id: `transport-${service.id}`,
                    type: "transportation",
                    name: service.serviceName,
                    price: parseFloat(service.price) || 0,
                    quantity: 1,
                    provider: "Platform Service",
                  });
                }}
              />
              
              {/* Transportation Analysis - Google Transit Routes & AI Tips */}
              {(activityLocations.length > 0 || hotelLocation) && (
                <div className="mt-6 border-t pt-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Car className="h-5 w-5 text-[#FF385C]" />
                    Getting Around
                  </h3>
                  <TransportationAnalysis
                    activityLocations={activityLocations}
                    hotelLocation={hotelLocation}
                    initialTransitRoutes={transitRoutes}
                    onActivitySelect={setHighlightedActivityId}
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === "activities" && !detailsSubmitted && (
            <Card className="border-2 border-dashed mb-6">
              <CardContent className="p-8 text-center">
                <Palmtree className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <h3 className="font-semibold text-lg mb-2">Search Activities</h3>
                <p className="text-muted-foreground">
                  Fill in your Travel Details above and click "Submit" to search for tours and activities.
                </p>
              </CardContent>
            </Card>
          )}

          {activeTab === "activities" && detailsSubmitted && (
            <div className="mb-6">
              <ActivitySearch
                destination={destination}
                startDate={startDate}
                endDate={endDate}
                travelers={travelers}
                onSelectActivity={(activity) => {
                  const durationMinutes = activity.duration?.fixedDurationInMinutes || 
                    activity.duration?.variableDurationFromMinutes || 0;
                  const durationHours = durationMinutes > 0 ? Math.ceil(durationMinutes / 60) : undefined;
                  
                  const cancellation = activity.cancellationPolicy;
                  const fullRefund = cancellation?.refundEligibility?.find(r => r.percentageRefundable === 100);
                  const isRefundable = !!fullRefund;
                  
                  const logistics = activity.logistics as any;
                  let meetingPoint: string | undefined;
                  let meetingPointCoordinates: { lat: number; lng: number } | undefined;
                  
                  if (logistics?.start?.[0]) {
                    const startLoc = logistics.start[0].location;
                    const addr = startLoc?.address;
                    meetingPoint = startLoc?.name || 
                      [addr?.street, addr?.city, addr?.state, addr?.country].filter(Boolean).join(', ') ||
                      logistics.start[0].description;
                    if (startLoc?.coordinates) {
                      meetingPointCoordinates = {
                        lat: startLoc.coordinates.latitude,
                        lng: startLoc.coordinates.longitude
                      };
                    }
                  }
                  
                  addToCart({
                    id: `activity-${activity.productCode}`,
                    type: "activities",
                    name: activity.title,
                    price: (activity.pricing?.summary?.fromPrice || 0) * travelers,
                    quantity: 1,
                    provider: "Viator",
                    details: `${durationHours ? `${durationHours}h` : 'Duration varies'}${isRefundable ? ', Free cancellation' : ''}${meetingPoint ? ` | ${meetingPoint}` : ''}`,
                    isExternal: true,
                    metadata: {
                      refundable: isRefundable,
                      cancellationDeadline: fullRefund?.dayRangeMin ? `${fullRefund.dayRangeMin} days before` : undefined,
                      duration: durationHours ? `${durationHours} hours` : undefined,
                      travelers: travelers,
                      meetingPoint,
                      meetingPointCoordinates,
                      rawData: activity,
                    },
                  });
                }}
              />
            </div>
          )}

          {activeTab !== "flights" && activeTab !== "hotels" && activeTab !== "services" && activeTab !== "transportation" && activeTab !== "activities" && (
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {filteredServices.length > 0 
                ? `Showing ${filteredServices.length} ${filteredServices.length === 1 ? 'provider' : 'providers'}${customVenues.length > 0 ? ` + ${customVenues.length} custom` : ''}${destination ? ` in ${destination}` : ''}`
                : destination 
                  ? `No providers found in ${destination}` 
                  : "Enter a location to see available options"}
            </p>
            {(activeTab === "venue" || activeTab === "accommodations" || activeTab === "hotels") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddVenueModalOpen(true)}
                data-testid="button-add-custom-venue"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Custom Location
              </Button>
            )}
          </div>
          )}

          {activeTab !== "flights" && activeTab !== "hotels" && activeTab !== "services" && activeTab !== "transportation" && activeTab !== "activities" && (
            <div className="flex gap-6">
              <div className="flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {(activeTab === "venue" || activeTab === "accommodations" || activeTab === "hotels") && customVenues.length > 0 && customVenues.map((venue) => {
                    const venueId = `custom-${venue.id}`;
                    const isInCart = selectedProviderIds.includes(venueId);
                    return (
                      <Card key={venueId} className="overflow-hidden hover-elevate border-dashed border-2 border-[#FF385C]/30">
                        <div className="h-48 bg-gradient-to-br from-[#FF385C]/10 to-[#FF385C]/20 flex items-center justify-center">
                          <MapPin className="w-12 h-12 text-[#FF385C]" />
                        </div>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold text-lg">{venue.name}</h3>
                            <Badge variant="outline" className="text-xs border-[#FF385C] text-[#FF385C]">
                              Custom
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                            {venue.address || venue.notes || "Custom location"}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-lg">
                              {venue.estimatedCost ? `$${venue.estimatedCost}` : "Free"}
                            </span>
                            {isInCart ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-500 text-red-500 hover:bg-red-50"
                                onClick={() => removeFromCart(venueId)}
                                data-testid={`button-remove-custom-${venue.id}`}
                              >
                                <X className="w-4 h-4 mr-1" />
                                Remove
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                className="bg-[#FF385C] hover:bg-[#E23350]"
                                onClick={() => addToCart({
                                  id: venueId,
                                  type: "venue",
                                  name: venue.name,
                                  price: Number(venue.estimatedCost) || 0,
                                  quantity: 1,
                                  provider: "Custom Venue",
                                })}
                                data-testid={`button-add-custom-${venue.id}`}
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                Add
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {servicesLoading ? (
                    [1, 2, 3, 4, 5, 6].map((i) => (
                      <Card key={i}>
                        <Skeleton className="h-48 w-full" />
                        <CardContent className="p-4">
                          <Skeleton className="h-6 w-3/4 mb-2" />
                          <Skeleton className="h-4 w-full mb-2" />
                          <Skeleton className="h-4 w-1/2" />
                        </CardContent>
                      </Card>
                    ))
                  ) : filteredServices.length > 0 ? (
                    filteredServices.map((service) => (
                      <Card key={service.id} className="overflow-hidden hover-elevate">
                        <div className="h-48 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">
                          <Building2 className="w-12 h-12 text-gray-400" />
                        </div>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold text-lg">{service.serviceName}</h3>
                            <Badge variant="secondary" className="text-xs">
                              <Star className="w-3 h-3 mr-1 fill-amber-400 text-amber-400" />
                              {service.averageRating || "4.8"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                            {service.shortDescription || service.description}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-lg">${service.price || 0}</span>
                            <Button
                              size="sm"
                              className="bg-[#FF385C] hover:bg-[#E23350]"
                              onClick={() => addToCart({
                                id: service.id.toString(),
                                type: activeTab,
                                name: service.serviceName,
                                price: Number(service.price) || 0,
                                quantity: 1,
                                provider: "Platform Provider",
                              })}
                              data-testid={`button-add-${service.id}`}
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              Add
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <div className="col-span-full text-center py-12">
                      <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">No providers available yet</h3>
                      <p className="text-muted-foreground mb-4">
                        We're adding providers for this category. Check back soon!
                      </p>
                      <Button variant="outline" data-testid="button-notify-me">
                        Notify Me When Available
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              
            </div>
          )}
        </div>
        
          </Panel>

          <PanelResizeHandle className="w-2 bg-gray-200 dark:bg-gray-700 hover:bg-[#FF385C] transition-colors cursor-col-resize flex items-center justify-center">
            <div className="w-1 h-8 bg-gray-400 dark:bg-gray-500 rounded-full" />
          </PanelResizeHandle>

          <Panel defaultSize={40} minSize={20} maxSize={60} className="flex flex-col overflow-hidden">
            <div className="h-full flex flex-col overflow-hidden">
              <div className="flex-1 relative min-h-0">
                <ExperienceMap
                  providers={mapProviders}
                  selectedProviderIds={selectedProviderIds}
                  destination={destination}
                  onAddToCart={(provider) => addToCart({
                    id: provider.id,
                    type: provider.category,
                    name: provider.name,
                    price: provider.price,
                    quantity: 1,
                    provider: "Platform Provider"
                  })}
                  onRemoveFromCart={removeFromCart}
                  height="100%"
                  activityLocations={activityLocations}
                  hotelLocation={hotelLocation}
                  transitRoutes={transitRoutes}
                  highlightedActivityId={highlightedActivityId}
                />
              </div>
            </div>
          </Panel>
        </PanelGroup>

        {/* Mobile Layout - Content stacked with collapsible map */}
        <div className="lg:hidden flex flex-col min-h-screen">
          {/* Mobile Hero Section */}
          <div className="relative h-48 flex-shrink-0 overflow-hidden">
            <div 
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url('${config.heroImage}')` }}
            />
            <div className="absolute top-0 left-0 right-0 bg-white/90 backdrop-blur-sm px-3 py-2 flex items-center justify-end gap-2 z-10">
              <Link href="/credits">
                <Button variant="outline" size="sm" className="gap-1 text-xs">
                  <Coins className="w-3 h-3 text-amber-500" />
                  {userCredits}
                  <Plus className="w-2 h-2" />
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs"
                onClick={openExpertChat}
                data-testid="button-expert-help-ribbon-mobile"
              >
                <MessageCircle className="w-3 h-3" />
                Expert
              </Button>
              {/* Mobile Cart Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  sessionStorage.setItem("experienceContext", JSON.stringify({
                    title: `${experienceType.name} Experience`,
                    experienceType: experienceType.name,
                    destination,
                    startDate: startDate?.toISOString().split('T')[0],
                    endDate: endDate?.toISOString().split('T')[0],
                    travelers: 2
                  }));
                  setLocation("/cart");
                }}
                className="gap-1 px-2"
                data-testid="button-cart-ribbon-mobile"
              >
                <ShoppingCart className="w-3 h-3" />
                <span data-testid="text-cart-items-mobile">{cart.length}</span>
              </Button>
              {/* Mobile Generate Itinerary Button */}
              <Button
                size="sm"
                onClick={generateItinerary}
                disabled={!canGenerateItinerary || generatingItinerary || cart.length === 0}
                className="gap-1 px-2 bg-[#FF385C] hover:bg-[#E23350]"
                data-testid="button-generate-ribbon-mobile"
              >
                {generatingItinerary ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Wand2 className="w-3 h-3" />
                )}
                Generate
              </Button>
            </div>
          </div>

          {/* Mobile Trip Details Card */}
          <Card className="bg-white dark:bg-gray-800 rounded-xl shadow-md border p-4 w-full max-w-md mx-auto mt-[-80px] z-20 relative">
            <CardContent className="p-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">{experienceType.name} Details</h2>
                <Users className="w-4 h-4 text-gray-400" />
              </div>
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">{config.locationLabel}</Label>
                  <Input
                    placeholder="Eg: Paris, New York"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-xs text-muted-foreground">From</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full mt-1 justify-start text-xs">
                          <Calendar className="mr-1 h-3 w-3" />
                          {startDate ? format(startDate, "M/d/yy") : "Select"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <CalendarComponent mode="single" selected={startDate} onSelect={setStartDate} />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">To</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full mt-1 justify-start text-xs">
                          <Calendar className="mr-1 h-3 w-3" />
                          {endDate ? format(endDate, "M/d/yy") : "Select"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <CalendarComponent mode="single" selected={endDate} onSelect={handleEndDateSelect} disabled={(date) => startDate ? date < startDate : false} />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <Button className="w-full bg-[#FF385C] hover:bg-[#E23350] text-white" disabled={!!dateError}>
                  Submit Details
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Mobile Tabs */}
          <div className="bg-white dark:bg-gray-800 border-b mt-4 px-2 overflow-x-auto">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="h-auto bg-transparent p-0 gap-0 flex-nowrap">
                {config.tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="rounded-none border-b-2 border-transparent px-3 py-2 text-sm data-[state=active]:border-[#FF385C] data-[state=active]:text-[#FF385C] whitespace-nowrap"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Mobile Content */}
          <div className="flex-1 p-4 pb-20">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {servicesLoading ? (
                  [1, 2, 3, 4].map((i) => (
                    <Card key={i}><Skeleton className="h-40 w-full" /></Card>
                  ))
                ) : filteredServices.length > 0 ? (
                  filteredServices.slice(0, 6).map((service) => (
                    <Card key={service.id} className="overflow-hidden">
                      <div className="h-32 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                        <Building2 className="w-8 h-8 text-gray-400" />
                      </div>
                      <CardContent className="p-3">
                        <h3 className="font-medium text-sm truncate">{service.serviceName}</h3>
                        <div className="flex items-center justify-between mt-2">
                          <span className="font-bold">${service.price || 0}</span>
                          <Button
                            size="sm"
                            className="bg-[#FF385C] hover:bg-[#E23350] h-7 text-xs"
                            onClick={() => addToCart({
                              id: service.id.toString(),
                              type: activeTab,
                              name: service.serviceName,
                              price: Number(service.price) || 0,
                              quantity: 1,
                              provider: "Platform Provider",
                            })}
                          >
                            <Plus className="w-3 h-3 mr-1" />Add
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="col-span-full text-center py-8">
                    <Building2 className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">No providers available yet</p>
                  </div>
                )}
              </div>
          </div>
        </div>

        {/* Mobile Map Collapsible */}
        <div className="lg:hidden">
          <Collapsible>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t shadow-lg z-40">
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full flex items-center justify-between p-4 h-auto"
                  data-testid="button-toggle-map-mobile"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-[#FF385C]" />
                    <span className="font-medium">View Map</span>
                    {cart.length > 0 && (
                      <Badge className="bg-[#FF385C]">{cart.length} selected</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {cart.length > 0 && (
                      <span className="font-bold text-[#FF385C]">${cartTotal}</span>
                    )}
                    <ChevronDown className="w-5 h-5" />
                  </div>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="h-[300px] border-t">
                  <ExperienceMap
                    providers={mapProviders}
                    selectedProviderIds={selectedProviderIds}
                    destination={destination}
                    onAddToCart={(provider) => addToCart({
                      id: provider.id,
                      type: provider.category,
                      name: provider.name,
                      price: provider.price,
                      quantity: 1,
                      provider: "Platform Provider"
                    })}
                    onRemoveFromCart={removeFromCart}
                    height="100%"
                    activityLocations={activityLocations}
                    hotelLocation={hotelLocation}
                    transitRoutes={transitRoutes}
                  />
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </div>

        {/* AI Optimization Sheet */}
        <Sheet open={aiOptimizeOpen} onOpenChange={setAiOptimizeOpen}>
          <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#FF385C]" />
                AI Optimization
              </SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <AIOptimizationTab 
                experienceType={experienceType}
                destination={destination}
                date={startDate}
                cart={cart}
              />
            </div>
          </SheetContent>
        </Sheet>
        
        <ExpertChatWidget
          experienceType={experienceType?.name}
          destination={destination}
          onRequestExpert={() => {}}
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
        />
        
        {!chatOpen && (
          <Button
            onClick={() => setChatOpen(true)}
            className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-[#FF385C] hover:bg-[#E23350] shadow-lg z-50"
            size="icon"
            data-testid="button-open-chat"
          >
            <MessageCircle className="w-6 h-6" />
          </Button>
        )}
        
        <AddCustomVenueModal
          open={addVenueModalOpen}
          onOpenChange={setAddVenueModalOpen}
          experienceType={slug}
          userId={user?.id}
          onVenueAdded={(venue) => {
            queryClient.invalidateQueries({ queryKey: ["/api/custom-venues", slug] });
            addToCart({
              id: `custom-${venue.id}`,
              type: "venue",
              name: venue.name,
              price: Number(venue.estimatedCost) || 0,
              quantity: 1,
              provider: "Custom Venue",
            });
            toast({ title: "Custom venue added", description: `${venue.name} is now in your plan` });
          }}
        />
      </div>
    </Layout>
  );
}
