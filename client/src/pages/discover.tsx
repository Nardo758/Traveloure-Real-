import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link, useLocation } from "wouter";
import {
  Search,
  MapPin,
  Star,
  Clock,
  DollarSign,
  Filter,
  X,
  SlidersHorizontal,
  Camera,
  Car,
  UtensilsCrossed,
  Baby,
  Compass,
  Briefcase,
  Wrench,
  Heart,
  Sparkles,
  Dog,
  PartyPopper,
  Laptop,
  Languages,
  Award,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Wand2,
  Loader2,
  ShoppingCart,
  Plus,
  Check,
  Building2,
  Globe,
  BookOpen,
  Ticket,
  TrendingUp,
  Calendar,
  Users,
  ArrowRight,
  GitCompare,
  Zap,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { TravelPulseCard, TravelPulseTrendingData } from "@/components/travelpulse/TravelPulseCard";
import { CityGrid } from "@/components/travelpulse/CityGrid";
import { GlobalCalendar } from "@/components/travelpulse/GlobalCalendar";

type ServiceCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryType: string;
  priceRange: { min: number; max: number } | null;
};

type Service = {
  id: string;
  userId: string;
  serviceName: string;
  shortDescription: string;
  description: string;
  categoryId: string;
  price: string;
  location: string;
  averageRating: string;
  reviewCount: number;
  status: string;
  deliveryMethod: string;
  deliveryTimeframe: string;
};

type DiscoverResult = {
  services: Service[];
  total: number;
};

type AIRecommendation = {
  recommendedCategories: Array<{
    slug: string;
    name: string;
    reason: string;
  }>;
  recommendedServices: Array<Service & { recommendationReason: string }>;
  suggestions: string;
};

interface CartData {
  items: any[];
  itemCount: number;
  subtotal: string;
  total: string;
}

type ExpertTemplate = {
  id: string;
  expertId: string;
  title: string;
  description: string;
  shortDescription?: string;
  destination: string;
  duration: number;
  price: string;
  currency?: string;
  category?: string;
  coverImage?: string;
  images?: string[];
  highlights?: string[];
  tags?: string[];
  isPublished: boolean;
  isFeatured: boolean;
  salesCount?: number;
  viewCount?: number;
  averageRating?: string;
  reviewCount?: number;
};

const categoryIcons: Record<string, React.ElementType> = {
  "photography-videography": Camera,
  "transportation-logistics": Car,
  "food-culinary": UtensilsCrossed,
  "childcare-family": Baby,
  "tours-experiences": Compass,
  "personal-assistance": Briefcase,
  "taskrabbit-services": Wrench,
  "health-wellness": Heart,
  "beauty-styling": Sparkles,
  "pets-animals": Dog,
  "events-celebrations": PartyPopper,
  "technology-connectivity": Laptop,
  "language-translation": Languages,
  "specialty-services": Award,
  "custom-other": HelpCircle,
};

const tripCategories = [
  { id: "all", label: "All", icon: Globe },
  { id: "adventure", label: "Adventure", icon: TrendingUp },
  { id: "cultural", label: "Cultural", icon: BookOpen },
  { id: "relaxation", label: "Relaxation", icon: Heart },
  { id: "romantic", label: "Romantic", icon: Heart },
  { id: "family", label: "Family", icon: Users },
];

const preResearchedTrips = [
  {
    id: 1,
    title: "Discover Kyoto's Ancient Temples",
    destination: "Kyoto, Japan",
    duration: "7 days",
    travelers: "2-4",
    category: "cultural",
    rating: 4.9,
    reviews: 234,
    price: 2499,
    originalPrice: 2999,
    highlights: ["Fushimi Inari Shrine", "Traditional Tea Ceremony", "Bamboo Grove Walk"],
    expertPick: true,
  },
  {
    id: 2,
    title: "Amalfi Coast Dream Escape",
    destination: "Amalfi, Italy",
    duration: "5 days",
    travelers: "2",
    category: "romantic",
    rating: 4.8,
    reviews: 189,
    price: 3299,
    originalPrice: 3899,
    highlights: ["Positano Beach Day", "Limoncello Tasting", "Sunset Boat Cruise"],
    expertPick: true,
  },
  {
    id: 3,
    title: "Bali Wellness Retreat",
    destination: "Ubud, Bali",
    duration: "6 days",
    travelers: "1-2",
    category: "relaxation",
    rating: 4.9,
    reviews: 312,
    price: 1899,
    originalPrice: 2299,
    highlights: ["Yoga Sessions", "Rice Terrace Walks", "Spa Treatments"],
    expertPick: false,
  },
  {
    id: 4,
    title: "Costa Rica Adventure Week",
    destination: "Costa Rica",
    duration: "8 days",
    travelers: "2-6",
    category: "adventure",
    rating: 4.7,
    reviews: 156,
    price: 2199,
    originalPrice: 2699,
    highlights: ["Zip-lining", "Volcano Hiking", "Wildlife Safari"],
    expertPick: false,
  },
  {
    id: 5,
    title: "Paris Family Discovery",
    destination: "Paris, France",
    duration: "5 days",
    travelers: "4-6",
    category: "family",
    rating: 4.8,
    reviews: 278,
    price: 2799,
    originalPrice: 3299,
    highlights: ["Eiffel Tower", "Disneyland Paris", "Seine River Cruise"],
    expertPick: true,
  },
  {
    id: 6,
    title: "Moroccan Desert Adventure",
    destination: "Marrakech, Morocco",
    duration: "6 days",
    travelers: "2-4",
    category: "adventure",
    rating: 4.6,
    reviews: 98,
    price: 1599,
    originalPrice: 1999,
    highlights: ["Sahara Camping", "Medina Tour", "Camel Trek"],
    expertPick: false,
  },
];

const influencerContent = [
  {
    id: 1,
    title: "My Top 10 Hidden Cafes in Bali",
    category: "Food & Drink",
    creator: "@wanderlust_sarah",
    followers: "125K",
    platform: "instagram",
  },
  {
    id: 2,
    title: "Ultimate Tokyo Street Food Guide",
    category: "Destinations",
    creator: "@nomadic_mike",
    followers: "89K",
    platform: "youtube",
  },
  {
    id: 3,
    title: "Budget Travel Hacks That Actually Work",
    category: "Tips",
    creator: "@thriftytraveler",
    followers: "250K",
    platform: "tiktok",
  },
  {
    id: 4,
    title: "Romance in Paris: Local's Guide",
    category: "Romantic",
    creator: "@couples_abroad",
    followers: "180K",
    platform: "instagram",
  },
  {
    id: 5,
    title: "Best Sunset Spots in Santorini",
    category: "Photography",
    creator: "@golden_hour_jen",
    followers: "95K",
    platform: "instagram",
  },
  {
    id: 6,
    title: "How I Plan Corporate Retreats",
    category: "Business",
    creator: "@eventpro_lisa",
    followers: "45K",
    platform: "linkedin",
  },
];

function ServiceCard({ 
  service, 
  category,
  onAddToCart,
  isAddingToCart,
  isAdded,
}: { 
  service: Service; 
  category?: ServiceCategory;
  onAddToCart?: (serviceId: string) => void;
  isAddingToCart?: boolean;
  isAdded?: boolean;
}) {
  const rating = parseFloat(service.averageRating || "0") || 0;
  const price = parseFloat(service.price || "0") || 0;
  const reviewCount = service.reviewCount || 0;
  const Icon = category ? categoryIcons[category.slug] || Compass : Compass;
  const description = service.shortDescription || service.description || "No description available";
  const location = service.location || "Remote";

  return (
    <Card className="hover-elevate h-full" data-testid={`card-service-${service.id}`}>
      <CardContent className="p-4">
        <Link href={`/services/${service.id}`} data-testid={`link-service-${service.id}`}>
          <div className="flex gap-4 cursor-pointer">
            <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              <Icon className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 
                className="font-semibold text-foreground truncate"
                data-testid={`text-service-name-${service.id}`}
              >
                {service.serviceName}
              </h3>
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                {description}
              </p>
              <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
                <div className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  <span data-testid={`text-location-${service.id}`}>{location}</span>
                </div>
                {service.deliveryTimeframe && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{service.deliveryTimeframe}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Link>
        <div className="flex items-center justify-between mt-4 pt-3 border-t gap-2">
          <div className="flex items-center gap-2">
            {category && (
              <Badge variant="secondary" className="text-xs" data-testid={`badge-category-${service.id}`}>
                {category.name}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span className="font-medium" data-testid={`text-rating-${service.id}`}>
                {rating.toFixed(1)}
              </span>
              <span className="text-muted-foreground text-sm">
                ({reviewCount})
              </span>
            </div>
            <div className="flex items-center gap-1 font-semibold">
              <DollarSign className="w-4 h-4" />
              <span data-testid={`text-price-${service.id}`}>${price.toFixed(0)}</span>
            </div>
          </div>
        </div>
        {onAddToCart && (
          <Button
            size="sm"
            className={cn(
              "w-full mt-3",
              isAdded ? "bg-green-600 hover:bg-green-700" : ""
            )}
            onClick={() => onAddToCart(service.id)}
            disabled={isAddingToCart || isAdded}
            data-testid={`button-add-to-cart-${service.id}`}
          >
            {isAdded ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Added
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4 mr-2" />
                {isAddingToCart ? "Adding..." : "Add to Cart"}
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function FilterPanel({
  categories,
  selectedCategory,
  setSelectedCategory,
  minPrice,
  setMinPrice,
  maxPrice,
  setMaxPrice,
  minRating,
  setMinRating,
  onClear,
}: {
  categories: ServiceCategory[];
  selectedCategory: string;
  setSelectedCategory: (v: string) => void;
  minPrice: number;
  setMinPrice: (v: number) => void;
  maxPrice: number;
  setMaxPrice: (v: number) => void;
  minRating: number;
  setMinRating: (v: number) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <Label className="text-sm font-medium">Category</Label>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="mt-2" data-testid="select-category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm font-medium">Price Range</Label>
        <div className="flex items-center gap-2 mt-2">
          <Input
            type="number"
            placeholder="Min"
            value={minPrice || ""}
            onChange={(e) => setMinPrice(Number(e.target.value) || 0)}
            className="w-24"
            data-testid="input-min-price"
          />
          <span className="text-muted-foreground">-</span>
          <Input
            type="number"
            placeholder="Max"
            value={maxPrice || ""}
            onChange={(e) => setMaxPrice(Number(e.target.value) || 0)}
            className="w-24"
            data-testid="input-max-price"
          />
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium">Minimum Rating</Label>
        <div className="flex items-center gap-3 mt-2">
          <Slider
            value={[minRating]}
            onValueChange={([v]) => setMinRating(v)}
            max={5}
            step={0.5}
            className="flex-1"
            data-testid="slider-rating"
          />
          <div className="flex items-center gap-1 min-w-[60px]">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span className="font-medium">{minRating.toFixed(1)}+</span>
          </div>
        </div>
      </div>

      <Button 
        variant="outline" 
        className="w-full" 
        onClick={onClear}
        data-testid="button-clear-filters"
      >
        <X className="w-4 h-4 mr-2" />
        Clear Filters
      </Button>
    </div>
  );
}

export default function DiscoverPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState("rating");
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(0);
  const [minRating, setMinRating] = useState(0);
  const [page, setPage] = useState(0);
  const limit = 12;

  // Trip packages state
  const [tripSearchQuery, setTripSearchQuery] = useState("");
  const [selectedTripCategory, setSelectedTripCategory] = useState("all");
  const [favorites, setFavorites] = useState<number[]>([]);

  // Cart state
  const [addedServices, setAddedServices] = useState<Set<string>>(new Set());
  const [addingToCartId, setAddingToCartId] = useState<string | null>(null);
  const [creatingComparison, setCreatingComparison] = useState(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Data queries
  const { data: categories } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
  });

  const { data: result, isLoading: servicesLoading } = useQuery<DiscoverResult>({
    queryKey: [
      "/api/discover",
      debouncedQuery,
      selectedCategory,
      locationFilter,
      minPrice,
      maxPrice,
      minRating,
      sortBy,
      page,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (selectedCategory && selectedCategory !== "all") params.set("categoryId", selectedCategory);
      if (locationFilter) params.set("location", locationFilter);
      if (minPrice > 0) params.set("minPrice", String(minPrice));
      if (maxPrice > 0) params.set("maxPrice", String(maxPrice));
      if (minRating > 0) params.set("minRating", String(minRating));
      if (sortBy) params.set("sortBy", sortBy);
      params.set("limit", String(limit));
      params.set("offset", String(page * limit));
      
      const res = await fetch(`/api/discover?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: cart } = useQuery<CartData>({
    queryKey: ["/api/cart"],
    enabled: !!user,
  });

  // Expert Templates Query
  const { data: expertTemplates, isLoading: templatesLoading } = useQuery<ExpertTemplate[]>({
    queryKey: ["/api/expert-templates"],
  });

  const getCategoryById = (id: string) => categories?.find((c) => c.id === id);

  // AI Recommendations
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [recommendations, setRecommendations] = useState<AIRecommendation | null>(null);

  const recommendationsMutation = useMutation({
    mutationFn: async (data: { query?: string; destination?: string }) => {
      const res = await apiRequest("POST", "/api/discover/recommendations", data);
      return res.json() as Promise<AIRecommendation>;
    },
    onSuccess: (data) => {
      setRecommendations(data);
      setShowRecommendations(true);
    },
  });

  const getAIRecommendations = () => {
    recommendationsMutation.mutate({
      query: debouncedQuery || undefined,
      destination: locationFilter || undefined,
    });
  };

  // Cart mutations
  const addToCartMutation = useMutation({
    mutationFn: async (serviceId: string) => {
      setAddingToCartId(serviceId);
      return apiRequest("POST", "/api/cart", { serviceId, quantity: 1 });
    },
    onSuccess: (_, serviceId) => {
      setAddedServices(prev => new Set(prev).add(serviceId));
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({ title: "Added to cart!", description: "Service has been added to your cart." });
      setAddingToCartId(null);
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Failed to add to cart", description: error.message });
      setAddingToCartId(null);
    },
  });

  const handleAddToCart = (serviceId: string) => {
    if (!user) {
      toast({ 
        variant: "destructive", 
        title: "Sign in required", 
        description: "Please sign in to add items to your cart" 
      });
      return;
    }
    addToCartMutation.mutate(serviceId);
  };

  const createComparison = async () => {
    if (!cart || cart.items.length === 0) {
      toast({ variant: "destructive", title: "Cart is empty", description: "Add some services first" });
      return;
    }
    if (!user) {
      toast({ title: "Please sign in", description: "Sign in to use AI comparison" });
      return;
    }
    setCreatingComparison(true);
    
    const cartItems = cart.items.map((item: any) => ({
      name: item.service?.serviceName || "Service",
      category: item.service?.category || "service",
      price: item.service?.price || "0",
      provider: item.service?.providerName || "Provider",
      location: item.service?.location || ""
    }));
    
    try {
      const response = await apiRequest("POST", "/api/itinerary-comparisons", {
        title: "My Trip",
        destination: cart.items[0]?.service?.location || "Paris, France",
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        budget: cart.total,
        travelers: 2
      });
      
      const comparison = await response.json();
      sessionStorage.setItem(`comparison_baseline_${comparison.id}`, JSON.stringify(cartItems));
      setLocation(`/itinerary-comparison/${comparison.id}`);
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Failed to create comparison",
        description: error?.message || "Please try again"
      });
    } finally {
      setCreatingComparison(false);
    }
  };

  const clearFilters = () => {
    setSelectedCategory("all");
    setMinPrice(0);
    setMaxPrice(0);
    setMinRating(0);
    setLocationFilter("");
    setPage(0);
  };

  const hasActiveFilters = 
    selectedCategory !== "all" || 
    minPrice > 0 || 
    maxPrice > 0 || 
    minRating > 0 ||
    locationFilter !== "";

  const totalPages = result ? Math.ceil(result.total / limit) : 0;

  // Trip filtering
  const filteredTrips = preResearchedTrips.filter((trip) => {
    const matchesSearch =
      tripSearchQuery === "" ||
      trip.title.toLowerCase().includes(tripSearchQuery.toLowerCase()) ||
      trip.destination.toLowerCase().includes(tripSearchQuery.toLowerCase());
    const matchesCategory =
      selectedTripCategory === "all" || trip.category === selectedTripCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleFavorite = (id: number) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        {/* Hero Section */}
        <section className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground py-16">
          <div className="container mx-auto px-4 max-w-6xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-8"
            >
              <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full text-sm mb-6">
                <Sparkles className="w-4 h-4" />
                Discover Your Perfect Experience
              </div>
              <h1 className="text-4xl md:text-5xl font-bold mb-4" data-testid="text-page-title">
                Explore Services & Trip Packages
              </h1>
              <p className="text-lg text-primary-foreground/90 max-w-2xl mx-auto">
                Browse expert services, curated trip packages, and get AI-powered recommendations
                for your next adventure.
              </p>
            </motion.div>

            {/* Search Bar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-card rounded-xl p-4 shadow-xl max-w-3xl mx-auto"
            >
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    placeholder="Search services, destinations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-12"
                    data-testid="input-search"
                  />
                </div>
                <Button
                  className="h-12 px-8"
                  onClick={getAIRecommendations}
                  disabled={recommendationsMutation.isPending}
                  data-testid="button-ai-suggestions"
                >
                  {recommendationsMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4 mr-2" />
                  )}
                  AI Suggestions
                </Button>
              </div>
            </motion.div>

            {/* Quick Actions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-wrap justify-center gap-3 mt-6"
            >
              <Link href="/experiences">
                <Button
                  variant="outline"
                  className="bg-white/10 backdrop-blur-sm border-white/30 text-primary-foreground font-medium"
                  data-testid="button-plan-experience"
                >
                  <Compass className="w-4 h-4 mr-2" />
                  Plan Experience
                </Button>
              </Link>
              <Link href="/spontaneous">
                <Button
                  variant="outline"
                  className="bg-amber-500/20 backdrop-blur-sm border-amber-400/50 text-primary-foreground font-medium"
                  data-testid="button-live-intel"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Live Intel
                </Button>
              </Link>
            </motion.div>
          </div>
        </section>

        {/* Main Content */}
        <section className="py-12">
          <div className="container mx-auto px-4 max-w-[1400px]">
            <Tabs defaultValue="services" className="w-full">
              <TabsList className="bg-card border p-1 mb-8 flex-wrap gap-1">
                <TabsTrigger
                  value="services"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  data-testid="tab-services"
                >
                  <Building2 className="w-4 h-4 mr-2" />
                  Browse Services
                </TabsTrigger>
                <TabsTrigger
                  value="packages"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  data-testid="tab-packages"
                >
                  <Globe className="w-4 h-4 mr-2" />
                  Trip Packages
                </TabsTrigger>
                <TabsTrigger
                  value="articles"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  data-testid="tab-articles"
                >
                  <BookOpen className="w-4 h-4 mr-2" />
                  Influencer Curated
                </TabsTrigger>
                <TabsTrigger
                  value="events"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  data-testid="tab-events"
                >
                  <Ticket className="w-4 h-4 mr-2" />
                  Upcoming Events
                </TabsTrigger>
                <TabsTrigger
                  value="travelpulse"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  data-testid="tab-travelpulse"
                >
                  <TrendingUp className="w-4 h-4 mr-2" />
                  TravelPulse
                </TabsTrigger>
              </TabsList>

              {/* Browse Services Tab */}
              <TabsContent value="services">
                {/* Cart Summary Bar */}
                {cart && cart.items.length > 0 && (
                  <div className="mb-6 p-4 bg-card border rounded-lg flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <ShoppingCart className="w-5 h-5 text-primary" />
                      <span className="font-medium">
                        {cart.itemCount} items in cart
                      </span>
                      <span className="text-muted-foreground">
                        Total: ${cart.total}
                      </span>
                    </div>
                    <div className="flex gap-3">
                      <Link href="/cart">
                        <Button variant="outline" data-testid="button-view-cart">
                          View Cart
                        </Button>
                      </Link>
                      <Button
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
                    </div>
                  </div>
                )}

                {/* AI Recommendations Panel */}
                {showRecommendations && recommendations && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border border-purple-200 dark:border-purple-800 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Wand2 className="w-5 h-5 text-purple-600" />
                        <span className="font-medium text-purple-900 dark:text-purple-100">AI Recommendations</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowRecommendations(false)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-purple-700 dark:text-purple-200 mb-3">
                      {recommendations.suggestions}
                    </p>
                    {recommendations.recommendedCategories.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {recommendations.recommendedCategories.map((cat) => (
                          <Badge
                            key={cat.slug}
                            variant="secondary"
                            className="cursor-pointer"
                            onClick={() => {
                              const found = categories?.find(c => c.slug === cat.slug);
                              if (found) setSelectedCategory(found.id);
                            }}
                          >
                            {cat.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}

                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Desktop Filters Sidebar */}
                  <aside className="hidden lg:block lg:w-72 flex-shrink-0">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Filter className="w-4 h-4" />
                          Filters
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {categories && (
                          <FilterPanel
                            categories={categories}
                            selectedCategory={selectedCategory}
                            setSelectedCategory={setSelectedCategory}
                            minPrice={minPrice}
                            setMinPrice={setMinPrice}
                            maxPrice={maxPrice}
                            setMaxPrice={setMaxPrice}
                            minRating={minRating}
                            setMinRating={setMinRating}
                            onClear={clearFilters}
                          />
                        )}
                      </CardContent>
                    </Card>
                  </aside>

                  <main className="flex-1">
                    {/* Search and Sort Row */}
                    <div className="flex flex-col sm:flex-row gap-4 mb-6">
                      <div className="relative sm:w-48">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Location"
                          value={locationFilter}
                          onChange={(e) => setLocationFilter(e.target.value)}
                          className="pl-10"
                          data-testid="input-location"
                        />
                      </div>
                      <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="sm:w-44" data-testid="select-sort">
                          <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rating">Top Rated</SelectItem>
                          <SelectItem value="reviews">Most Reviews</SelectItem>
                          <SelectItem value="price_low">Price: Low to High</SelectItem>
                          <SelectItem value="price_high">Price: High to Low</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Mobile Filter Button */}
                      <Sheet>
                        <SheetTrigger asChild>
                          <Button variant="outline" className="lg:hidden" data-testid="button-mobile-filters">
                            <SlidersHorizontal className="w-4 h-4 mr-2" />
                            Filters
                            {hasActiveFilters && (
                              <Badge variant="secondary" className="ml-2">
                                Active
                              </Badge>
                            )}
                          </Button>
                        </SheetTrigger>
                        <SheetContent side="left">
                          <SheetHeader>
                            <SheetTitle>Filters</SheetTitle>
                            <SheetDescription>
                              Refine your search results
                            </SheetDescription>
                          </SheetHeader>
                          <div className="mt-6">
                            {categories && (
                              <FilterPanel
                                categories={categories}
                                selectedCategory={selectedCategory}
                                setSelectedCategory={setSelectedCategory}
                                minPrice={minPrice}
                                setMinPrice={setMinPrice}
                                maxPrice={maxPrice}
                                setMaxPrice={setMaxPrice}
                                minRating={minRating}
                                setMinRating={setMinRating}
                                onClear={clearFilters}
                              />
                            )}
                          </div>
                        </SheetContent>
                      </Sheet>
                    </div>

                    {/* Active Filters */}
                    {hasActiveFilters && (
                      <div className="flex items-center gap-2 mb-4 flex-wrap">
                        <span className="text-sm text-muted-foreground">Active filters:</span>
                        {selectedCategory !== "all" && (
                          <Badge variant="secondary" className="gap-1">
                            {getCategoryById(selectedCategory)?.name}
                            <button
                              onClick={() => setSelectedCategory("all")}
                              data-testid="button-remove-category-filter"
                              className="ml-1"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        )}
                        {minPrice > 0 && (
                          <Badge variant="secondary" className="gap-1">
                            Min: ${minPrice}
                            <button onClick={() => setMinPrice(0)} className="ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        )}
                        {maxPrice > 0 && (
                          <Badge variant="secondary" className="gap-1">
                            Max: ${maxPrice}
                            <button onClick={() => setMaxPrice(0)} className="ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        )}
                        {minRating > 0 && (
                          <Badge variant="secondary" className="gap-1">
                            {minRating}+ stars
                            <button onClick={() => setMinRating(0)} className="ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        )}
                        {locationFilter && (
                          <Badge variant="secondary" className="gap-1">
                            {locationFilter}
                            <button onClick={() => setLocationFilter("")} className="ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        )}
                        <Button variant="ghost" size="sm" onClick={clearFilters}>
                          Clear all
                        </Button>
                      </div>
                    )}

                    {/* Services Grid */}
                    {servicesLoading ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                          <Skeleton key={i} className="h-48" />
                        ))}
                      </div>
                    ) : result?.services && result.services.length > 0 ? (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {result.services.map((service) => (
                            <ServiceCard
                              key={service.id}
                              service={service}
                              category={getCategoryById(service.categoryId)}
                              onAddToCart={handleAddToCart}
                              isAddingToCart={addingToCartId === service.id}
                              isAdded={addedServices.has(service.id)}
                            />
                          ))}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-center gap-2 mt-8">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={page === 0}
                              onClick={() => setPage(p => p - 1)}
                              data-testid="button-prev-page"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span className="text-sm text-muted-foreground">
                              Page {page + 1} of {totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={page >= totalPages - 1}
                              onClick={() => setPage(p => p + 1)}
                              data-testid="button-next-page"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-16">
                        <Building2 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No services found</h3>
                        <p className="text-muted-foreground mb-4">
                          Try adjusting your search or filters
                        </p>
                        <Button variant="outline" onClick={clearFilters}>
                          Clear Filters
                        </Button>
                      </div>
                    )}
                  </main>
                </div>
              </TabsContent>

              {/* Trip Packages Tab */}
              <TabsContent value="packages">
                {/* Expert Itinerary Templates Section */}
                {(expertTemplates && expertTemplates.length > 0) && (
                  <div className="mb-10">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="text-xl font-semibold flex items-center gap-2">
                          <Award className="w-5 h-5 text-primary" />
                          Expert Itinerary Templates
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                          Purchase ready-made travel plans crafted by verified local experts
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {expertTemplates.length} Available
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {expertTemplates.slice(0, 6).map((template, idx) => (
                        <motion.div
                          key={template.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                        >
                          <Card
                            className="hover-elevate overflow-hidden group h-full"
                            data-testid={`card-template-${template.id}`}
                          >
                            <CardContent className="p-0 flex flex-col h-full">
                              <div className="relative h-40 bg-gradient-to-br from-primary/10 to-primary/5">
                                {template.coverImage ? (
                                  <img 
                                    src={template.coverImage} 
                                    alt={template.title}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center text-primary/30">
                                    <BookOpen className="w-16 h-16" />
                                  </div>
                                )}
                                
                                {template.isFeatured && (
                                  <div className="absolute top-3 left-3">
                                    <Badge>
                                      <Star className="w-3 h-3 mr-1 fill-current" />
                                      Featured
                                    </Badge>
                                  </div>
                                )}

                                <div className="absolute bottom-3 right-3 bg-background px-3 py-1.5 rounded-lg shadow-sm">
                                  <span className="font-bold text-lg">
                                    ${template.price}
                                  </span>
                                </div>
                              </div>

                              <div className="p-4 flex-1 flex flex-col">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                                  <MapPin className="w-4 h-4" />
                                  <span>{template.destination}</span>
                                </div>

                                <h3 className="font-semibold mb-2 group-hover:text-primary transition-colors line-clamp-2">
                                  {template.title}
                                </h3>

                                <p className="text-sm text-muted-foreground line-clamp-2 mb-3 flex-1">
                                  {template.shortDescription || template.description}
                                </p>

                                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-3">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-4 h-4" />
                                    {template.duration} days
                                  </span>
                                  {template.averageRating && parseFloat(template.averageRating) > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                                      {parseFloat(template.averageRating).toFixed(1)} ({template.reviewCount || 0})
                                    </span>
                                  )}
                                  {template.salesCount && template.salesCount > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Users className="w-4 h-4" />
                                      {template.salesCount} sold
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap gap-1 mb-4">
                                  {template.highlights?.slice(0, 2).map((h) => (
                                    <Badge key={h} variant="secondary" className="text-xs">
                                      {h}
                                    </Badge>
                                  ))}
                                  {template.highlights && template.highlights.length > 2 && (
                                    <Badge variant="secondary" className="text-xs">
                                      +{template.highlights.length - 2} more
                                    </Badge>
                                  )}
                                </div>

                                <Link href={`/expert-templates/${template.id}`}>
                                  <Button className="w-full" data-testid={`button-view-template-${template.id}`}>
                                    View & Purchase
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                  </Button>
                                </Link>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </div>

                    {expertTemplates.length > 6 && (
                      <div className="text-center mt-6">
                        <Button variant="outline" data-testid="button-view-all-templates">
                          View All {expertTemplates.length} Templates
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    )}

                    <div className="border-t my-8" />
                  </div>
                )}

                {templatesLoading && (
                  <div className="mb-10">
                    <Skeleton className="h-6 w-48 mb-6" />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-72 rounded-lg" />
                      ))}
                    </div>
                    <div className="border-t my-8" />
                  </div>
                )}

                <h2 className="text-xl font-semibold mb-4">Pre-Researched Trip Packages</h2>
                
                {/* Category Filters */}
                <div className="flex flex-wrap gap-2 mb-8">
                  {tripCategories.map((cat) => (
                    <Button
                      key={cat.id}
                      variant={selectedTripCategory === cat.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedTripCategory(cat.id)}
                      data-testid={`button-category-${cat.id}`}
                    >
                      <cat.icon className="w-4 h-4 mr-1" />
                      {cat.label}
                    </Button>
                  ))}
                </div>

                {/* Trip Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredTrips.map((trip, idx) => (
                    <motion.div
                      key={trip.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <Card
                        className="hover-elevate overflow-hidden group"
                        data-testid={`card-trip-${trip.id}`}
                      >
                        <CardContent className="p-0">
                          <div className="relative h-48 bg-gradient-to-br from-muted to-muted/50">
                            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                              <MapPin className="w-12 h-12" />
                            </div>
                            
                            <button
                              onClick={() => toggleFavorite(trip.id)}
                              className="absolute top-3 right-3 p-2 bg-background/90 rounded-full shadow-sm"
                              data-testid={`button-favorite-${trip.id}`}
                            >
                              <Heart
                                className={cn(
                                  "w-5 h-5",
                                  favorites.includes(trip.id)
                                    ? "fill-primary text-primary"
                                    : "text-muted-foreground"
                                )}
                              />
                            </button>

                            {trip.expertPick && (
                              <div className="absolute top-3 left-3">
                                <Badge>
                                  <Star className="w-3 h-3 mr-1 fill-current" />
                                  Expert Pick
                                </Badge>
                              </div>
                            )}

                            <div className="absolute bottom-3 right-3 bg-background px-3 py-1 rounded-lg shadow-sm">
                              <span className="text-xs text-muted-foreground line-through">
                                ${trip.originalPrice}
                              </span>
                              <span className="ml-1 font-bold">
                                ${trip.price}
                              </span>
                            </div>
                          </div>

                          <div className="p-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                              <MapPin className="w-4 h-4" />
                              <span>{trip.destination}</span>
                            </div>

                            <h3 className="font-semibold mb-3 group-hover:text-primary transition-colors">
                              {trip.title}
                            </h3>

                            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-3">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {trip.duration}
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="w-4 h-4" />
                                {trip.travelers}
                              </span>
                              <span className="flex items-center gap-1">
                                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                                {trip.rating} ({trip.reviews})
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-1 mb-4">
                              {trip.highlights.slice(0, 2).map((h) => (
                                <Badge key={h} variant="secondary" className="text-xs">
                                  {h}
                                </Badge>
                              ))}
                              {trip.highlights.length > 2 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{trip.highlights.length - 2} more
                                </Badge>
                              )}
                            </div>

                            <Button className="w-full" data-testid={`button-view-trip-${trip.id}`}>
                              View Details
                              <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                {filteredTrips.length === 0 && (
                  <div className="text-center py-16">
                    <Search className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No trips found</h3>
                    <p className="text-muted-foreground mb-4">
                      Try adjusting your search or filters
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTripSearchQuery("");
                        setSelectedTripCategory("all");
                      }}
                    >
                      Clear Filters
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* Influencer Curated Content Tab */}
              <TabsContent value="articles">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold mb-2">Curated by Travel Creators</h2>
                  <p className="text-muted-foreground">Discover authentic recommendations from verified travel influencers and local experts.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {influencerContent.map((content, idx) => (
                    <motion.div
                      key={content.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <Card
                        className="hover-elevate overflow-hidden cursor-pointer group"
                        data-testid={`card-influencer-${content.id}`}
                      >
                        <CardContent className="p-0">
                          <div className="h-36 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center relative">
                            <div className="absolute top-2 right-2">
                              <Badge variant="secondary" className="text-xs bg-white/90">
                                {content.platform === "instagram" && "📸 Instagram"}
                                {content.platform === "youtube" && "🎬 YouTube"}
                                {content.platform === "tiktok" && "🎵 TikTok"}
                                {content.platform === "linkedin" && "💼 LinkedIn"}
                              </Badge>
                            </div>
                            <Users className="w-10 h-10 text-primary/40" />
                          </div>
                          <div className="p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="text-xs">
                                {content.category}
                              </Badge>
                              <Badge className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-200">
                                Verified Creator
                              </Badge>
                            </div>
                            <h3 className="font-semibold mb-2 group-hover:text-primary transition-colors line-clamp-2">
                              {content.title}
                            </h3>
                            <div className="flex items-center justify-between text-sm text-muted-foreground">
                              <span className="font-medium text-foreground">{content.creator}</span>
                              <span>{content.followers} followers</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                <div className="text-center mt-8">
                  <Button variant="outline" data-testid="button-view-all-creators">
                    View All Creators
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </TabsContent>

              {/* Events Tab - Global Calendar */}
              <TabsContent value="events">
                <GlobalCalendar 
                  onCityClick={(cityName) => {
                    setLocation(`/discover?tab=travelpulse&city=${encodeURIComponent(cityName)}`);
                  }}
                />
              </TabsContent>

              {/* TravelPulse Tab */}
              <TabsContent value="travelpulse">
                <CityGrid />
              </TabsContent>
            </Tabs>
          </div>
        </section>

        {/* Still Undecided CTA */}
        <section className="py-16 bg-card border-t">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <h2 className="text-3xl font-bold mb-4">
              Need Help Deciding?
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Talk to one of our travel experts. They'll help you find the perfect
              trip based on your preferences, budget, and travel style.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/experts">
                <Button size="lg" className="px-8" data-testid="button-talk-to-expert">
                  Talk to an Expert
                </Button>
              </Link>
              <Link href="/experiences">
                <Button size="lg" variant="outline" className="px-8" data-testid="button-plan-experience-cta">
                  Plan Your Experience
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
