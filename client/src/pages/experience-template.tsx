import { useState, useMemo } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
  ShoppingCart,
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
  Building2,
  Users,
  MessageCircle,
  ArrowLeft,
  Coins,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ExperienceMap } from "@/components/experience-map";
import { ExpertChatWidget, CheckoutExpertBanner } from "@/components/expert-chat-widget";
import type { ExperienceType, ProviderService } from "@shared/schema";

interface CartItem {
  id: string;
  type: string;
  name: string;
  price: number;
  quantity: number;
  date?: string;
  details?: string;
  provider?: string;
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
      { id: "flights", label: "Flights", icon: Building2, category: "flights" },
      { id: "hotels", label: "Hotels", icon: Building2, category: "hotels" },
      { id: "activities", label: "Activities", icon: Building2, category: "activities" },
      { id: "transportation", label: "Transportation", icon: Building2, category: "transportation" },
      { id: "dining", label: "Dining", icon: Building2, category: "dining" },
    ],
    filters: ["Budget", "Luxury", "Family", "Adventure", "Business", "Beach", "City", "Nature"],
    locationLabel: "Destination:",
    dateLabel: "Travel Dates:",
  },
  wedding: {
    heroImage: "https://images.unsplash.com/photo-1519741497674-611481863552?w=1600&q=80",
    tabs: [
      { id: "venue", label: "Venues", icon: Building2, category: "venue" },
      { id: "catering", label: "Catering", icon: Building2, category: "catering" },
      { id: "photography", label: "Photography", icon: Building2, category: "photography" },
      { id: "florist", label: "Florist", icon: Building2, category: "florist" },
      { id: "entertainment", label: "Entertainment", icon: Building2, category: "entertainment" },
    ],
    filters: ["Indoor", "Outdoor", "Beach", "Garden", "Ballroom", "Rustic", "Modern", "Traditional"],
    locationLabel: "Wedding Location:",
    dateLabel: "Wedding Date:",
  },
  proposal: {
    heroImage: "https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?w=1600&q=80",
    tabs: [
      { id: "venue", label: "Venues", icon: Building2, category: "venue" },
      { id: "photography", label: "Photography", icon: Building2, category: "photography" },
      { id: "dining", label: "Dining", icon: Building2, category: "dining" },
      { id: "rings", label: "Rings", icon: Gem, category: "jewelry" },
      { id: "transportation", label: "Transportation", icon: Building2, category: "transportation" },
    ],
    filters: ["Romantic", "Private", "Scenic", "Restaurant", "Beach", "Rooftop", "Garden", "Sunset"],
    locationLabel: "Proposal Location:",
    dateLabel: "Proposal Date:",
  },
  romance: {
    heroImage: "https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?w=1600&q=80",
    tabs: [
      { id: "accommodations", label: "Accommodations", icon: Building2, category: "accommodations" },
      { id: "dining", label: "Dining", icon: Building2, category: "dining" },
      { id: "activities", label: "Activities", icon: Building2, category: "activities" },
      { id: "spa", label: "Spa & Wellness", icon: Building2, category: "spa" },
    ],
    filters: ["Couples", "Romantic", "Scenic", "Private", "Luxury", "Intimate", "Sunset", "Beachfront"],
    locationLabel: "Destination:",
    dateLabel: "Travel Dates:",
  },
  birthday: {
    heroImage: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=1600&q=80",
    tabs: [
      { id: "venue", label: "Venues", icon: Building2, category: "venue" },
      { id: "catering", label: "Catering", icon: Building2, category: "catering" },
      { id: "entertainment", label: "Entertainment", icon: Building2, category: "entertainment" },
      { id: "decorations", label: "Decorations", icon: Building2, category: "decorations" },
    ],
    filters: ["Kids", "Adults", "Outdoor", "Indoor", "Theme Party", "Elegant", "Casual", "Adventure"],
    locationLabel: "Party Location:",
    dateLabel: "Party Date:",
  },
  corporate: {
    heroImage: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1600&q=80",
    tabs: [
      { id: "venue", label: "Venues", icon: Building2, category: "venue" },
      { id: "catering", label: "Catering", icon: Building2, category: "catering" },
      { id: "av", label: "A/V Equipment", icon: Building2, category: "av-equipment" },
      { id: "team", label: "Team Activities", icon: Users, category: "team-building" },
    ],
    filters: ["Conference", "Retreat", "Workshop", "Team Building", "Seminar", "Gala", "Networking", "Training"],
    locationLabel: "Event Location:",
    dateLabel: "Event Dates:",
  },
  "boys-trip": {
    heroImage: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&q=80",
    tabs: [
      { id: "accommodations", label: "Accommodations", icon: Building2, category: "accommodations" },
      { id: "activities", label: "Adventures", icon: Building2, category: "adventures" },
      { id: "nightlife", label: "Nightlife", icon: Building2, category: "nightlife" },
      { id: "sports", label: "Sports", icon: Building2, category: "sports" },
    ],
    filters: ["Adventure", "Sports", "Nightlife", "Beach", "Mountains", "City", "Bachelor", "Fishing"],
    locationLabel: "Destination:",
    dateLabel: "Trip Dates:",
  },
  "girls-trip": {
    heroImage: "https://images.unsplash.com/photo-1559181567-c3190ca9959b?w=1600&q=80",
    tabs: [
      { id: "accommodations", label: "Accommodations", icon: Building2, category: "accommodations" },
      { id: "spa", label: "Spa & Wellness", icon: Building2, category: "spa" },
      { id: "shopping", label: "Shopping", icon: Building2, category: "shopping" },
      { id: "dining", label: "Dining & Wine", icon: Building2, category: "dining" },
    ],
    filters: ["Spa", "Shopping", "Beach", "Wine", "Brunch", "Wellness", "Bachelorette", "Luxury"],
    locationLabel: "Destination:",
    dateLabel: "Trip Dates:",
  },
};

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
  const slug = params?.slug || "";
  
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

  const config = experienceConfigs[slug] || experienceConfigs.wedding;
  
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [activeTab, setActiveTab] = useState(config.tabs[0]?.id || "venue");
  const [searchQuery, setSearchQuery] = useState("");
  const [priceRange, setPriceRange] = useState([0, 500]);
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState("popular");
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [aiOptimizeOpen, setAiOptimizeOpen] = useState(false);
  const [generatingItinerary, setGeneratingItinerary] = useState(false);

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
    if (!canGenerateItinerary) return;
    setGeneratingItinerary(true);
    try {
      const response = await fetch("/api/ai/optimize-experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          experienceType: experienceType?.name,
          destination,
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
          selectedServices: cart.map(item => ({
            name: item.name,
            provider: item.provider,
            price: item.price,
            category: item.type
          })),
          preferences: {}
        })
      });
      if (response.ok) {
        setAiOptimizeOpen(true);
      }
    } catch (error) {
      console.error("Failed to generate itinerary:", error);
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

  const addToCart = (item: CartItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    setCartOpen(true);
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const updateCartQuantity = (id: string, quantity: number) => {
    setCart((prev) => prev.map((item) => 
      item.id === id ? { ...item, quantity: Math.max(1, Math.min(10, quantity)) } : item
    ));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const currentTabCategory = config.tabs.find(t => t.id === activeTab)?.category;

  const filteredServices = useMemo(() => {
    if (!services) return [];
    
    let filtered = [...services];

    if (currentTabCategory) {
      filtered = filtered.filter(s => {
        const svcType = s.serviceType?.toLowerCase() || "";
        const svcName = s.serviceName.toLowerCase();
        return svcType.includes(currentTabCategory) || svcName.includes(currentTabCategory);
      });
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
    return filteredServices.map((s, index) => {
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
  }, [filteredServices, currentTabCategory]);

  const selectedProviderIds = useMemo(() => cart.map(item => item.id), [cart]);

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

            {/* White ribbon bar with Credits, Cart, Generate Itinerary */}
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
                onClick={() => setCartOpen(true)}
                data-testid="button-cart-ribbon"
              >
                <ShoppingCart className="w-4 h-4" />
                {cart.length > 0 ? `$${cartTotal}` : "Cart"}
              </Button>
              <Button
                size="sm"
                className="bg-[#FF385C] hover:bg-[#E23350] text-white gap-2"
                onClick={generateItinerary}
                disabled={!canGenerateItinerary || generatingItinerary || cart.length === 0}
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
                <Users className="w-5 h-5 text-gray-400" />
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
                  disabled={!!dateError}
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
                      <Button 
                        className="w-full bg-[#FF385C] hover:bg-[#E23350]"
                        onClick={() => {
                          setCartOpen(false);
                          setTimeout(() => setLocation("/cart"), 150);
                        }}
                        data-testid="button-checkout"
                      >
                        Proceed to Checkout
                      </Button>
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
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">
              {filteredServices.length > 0 
                ? `Showing ${filteredServices.length} ${filteredServices.length === 1 ? 'provider' : 'providers'}${destination ? ` in ${destination}` : ''}`
                : destination 
                  ? `No providers found in ${destination}` 
                  : "Enter a location to see available options"}
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2"
              onClick={openExpertChat}
              data-testid="button-expert-help"
            >
              <MessageCircle className="w-4 h-4" />
              Get Expert Help
            </Button>
          </div>

            <div className="flex gap-6">
              <div className="flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
        </div>
        
        {/* Sticky Cart Summary Footer on Content Panel */}
        {cart.length > 0 && (
          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t shadow-lg p-4 z-30">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-[#FF385C]" />
                  <span className="font-semibold">{cart.length} items</span>
                </div>
                <span className="text-lg font-bold text-[#FF385C]">${cartTotal}</span>
              </div>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setCartOpen(true)}
                data-testid="button-view-cart-content"
              >
                View Cart
              </Button>
            </div>
          </div>
        )}
          </Panel>

          <PanelResizeHandle className="w-2 bg-gray-200 dark:bg-gray-700 hover:bg-[#FF385C] transition-colors cursor-col-resize flex items-center justify-center">
            <div className="w-1 h-8 bg-gray-400 dark:bg-gray-500 rounded-full" />
          </PanelResizeHandle>

          <Panel defaultSize={40} minSize={20} maxSize={60} className="flex flex-col">
            <div className="h-full flex flex-col">
              <div className="flex-1 relative">
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
                />
              </div>
              
              {cart.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border-t p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">Your Selections ({cart.length})</h3>
                    <span className="font-bold text-[#FF385C]">${cartTotal}</span>
                  </div>
                  <div className="space-y-2 max-h-[120px] overflow-auto mb-3">
                    {cart.map((item) => (
                      <div key={item.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded p-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">${item.price}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="flex-shrink-0"
                          onClick={() => removeFromCart(item.id)}
                          data-testid={`button-map-remove-${item.id}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => setCartOpen(true)}
                    data-testid="button-view-cart-map"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    View Full Cart
                  </Button>
                </div>
              )}
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
                onClick={() => setCartOpen(true)}
                data-testid="button-cart-ribbon-mobile"
              >
                <ShoppingCart className="w-3 h-3" />
                {cart.length > 0 ? `$${cartTotal}` : "Cart"}
              </Button>
              <Button
                size="sm"
                className="bg-[#FF385C] hover:bg-[#E23350] text-white gap-1 text-xs"
                onClick={generateItinerary}
                disabled={!canGenerateItinerary || generatingItinerary || cart.length === 0}
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
                  />
                </div>
                {cart.length > 0 && (
                  <div className="p-3 border-t bg-gray-50 dark:bg-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{cart.length} items</span>
                      <span className="font-bold text-[#FF385C]">${cartTotal}</span>
                    </div>
                    <Button 
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => setCartOpen(true)}
                      data-testid="button-view-cart-mobile"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      View Full Cart
                    </Button>
                  </div>
                )}
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
      </div>
    </Layout>
  );
}
