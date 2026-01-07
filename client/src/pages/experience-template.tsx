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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  wedding: {
    heroImage: "https://images.unsplash.com/photo-1519741497674-611481863552?w=1600&q=80",
    tabs: [
      { id: "venue", label: "Venues", icon: Building2, category: "venue" },
      { id: "catering", label: "Catering", icon: Building2, category: "catering" },
      { id: "photography", label: "Photography", icon: Building2, category: "photography" },
      { id: "florist", label: "Florist", icon: Building2, category: "florist" },
      { id: "entertainment", label: "Entertainment", icon: Building2, category: "entertainment" },
      { id: "ai", label: "AI Optimization", icon: Wand2, category: null },
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
      { id: "ai", label: "AI Optimization", icon: Wand2, category: null },
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
      { id: "ai", label: "AI Optimization", icon: Wand2, category: null },
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
      { id: "ai", label: "AI Optimization", icon: Wand2, category: null },
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
      { id: "ai", label: "AI Optimization", icon: Wand2, category: null },
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
      { id: "ai", label: "AI Optimization", icon: Wand2, category: null },
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
      { id: "ai", label: "AI Optimization", icon: Wand2, category: null },
    ],
    filters: ["Spa", "Shopping", "Beach", "Wine", "Brunch", "Wellness", "Bachelorette", "Luxury"],
    locationLabel: "Destination:",
    dateLabel: "Trip Dates:",
  },
};

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
        <div className="relative h-[280px] md:h-[320px]">
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url('${config.heroImage}')` }}
          >
            <div className="absolute inset-0 bg-black/30" />
          </div>
          
          <div className="absolute right-4 md:right-12 top-1/2 -translate-y-1/2 w-[360px] md:w-[420px]">
            <Card className="bg-white/95 dark:bg-gray-800/95 backdrop-blur shadow-xl border-0">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {experienceType.name} Details
                  </h2>
                  <Sparkles className="w-5 h-5 text-[#FF385C]" />
                </div>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="location" className="text-sm text-gray-600 dark:text-gray-400">
                      {config.locationLabel}
                    </Label>
                    <div className="relative mt-1">
                      <Input
                        id="location"
                        placeholder="Enter location..."
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        className="pl-10"
                        data-testid="input-location"
                      />
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm text-gray-600 dark:text-gray-400">{config.dateLabel}</Label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "justify-start text-left font-normal",
                              !startDate && "text-muted-foreground"
                            )}
                            data-testid="button-start-date"
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            {startDate ? format(startDate, "MM/dd/yyyy") : "From"}
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
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "justify-start text-left font-normal",
                              !endDate && "text-muted-foreground"
                            )}
                            data-testid="button-end-date"
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            {endDate ? format(endDate, "MM/dd/yyyy") : "To"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <CalendarComponent
                            mode="single"
                            selected={endDate}
                            onSelect={setEndDate}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <Button 
                    className="w-full bg-[#FF385C] hover:bg-[#E23350] text-white"
                    data-testid="button-submit-details"
                  >
                    Submit {experienceType.name} Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

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
              </Tabs>

              <Sheet open={cartOpen} onOpenChange={setCartOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="gap-2" data-testid="button-cart">
                    <ShoppingCart className="w-4 h-4" />
                    ${cartTotal}
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Your Selection</SheetTitle>
                  </SheetHeader>
                  <ScrollArea className="h-[calc(100vh-200px)] mt-4">
                    {cart.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">Your cart is empty</p>
                    ) : (
                      <div className="space-y-4">
                        {cart.map((item) => (
                          <Card key={item.id}>
                            <CardContent className="p-4">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="font-medium">{item.name}</h4>
                                  <p className="text-sm text-muted-foreground">{item.provider}</p>
                                  <p className="text-sm font-medium mt-1">${item.price}</p>
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
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                  {cart.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex justify-between mb-4">
                        <span className="font-medium">Total</span>
                        <span className="font-bold">${cartTotal}</span>
                      </div>
                      <Button 
                        className="w-full bg-[#FF385C] hover:bg-[#E23350]"
                        onClick={() => setLocation("/cart")}
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

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
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

                    <div>
                      <Label className="text-sm font-medium">Minimum Rating</Label>
                      <div className="flex gap-2 mt-2">
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

                    <div>
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
            <Button variant="outline" size="sm" className="gap-2" data-testid="button-expert-help">
              <MessageCircle className="w-4 h-4" />
              Get Expert Help
            </Button>
          </div>

          {activeTab === "ai" ? (
            <Card className="p-8 text-center">
              <Wand2 className="w-12 h-12 text-[#FF385C] mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">AI Optimization</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Let our AI analyze your selections and optimize your {experienceType.name.toLowerCase()} plan
                for the best experience, timing, and value.
              </p>
              <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-optimize">
                <Sparkles className="w-4 h-4 mr-2" />
                Optimize My {experienceType.name}
              </Button>
            </Card>
          ) : (
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
          )}
        </div>
      </div>
    </Layout>
  );
}
