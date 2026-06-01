import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
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
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Search,
  ShoppingCart,
  Plus,
  X,
  Star,
  Calendar,
  MapPin,
  Sparkles,
  ChevronDown,
  Wand2,
  SlidersHorizontal,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UnifiedResultGrid, UnifiedResult } from "@/components/unified-result-card";

interface CatalogItem {
  id: string;
  type: string;
  provider: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  price: number | null;
  rating: number | null;
  reviewCount: number | null;
  destination: string | null;
  categories: string[];
  bookingUrl: string | null;
  affiliateUrl: string | null;
}

interface CatalogSearchResult {
  items: CatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  filters: {
    destinations: string[];
    priceRange: { min: number; max: number };
    providers: string[];
  };
}

interface CartItem {
  id: string;
  type: "activity" | "hotel" | "service" | "restaurant";
  name: string;
  price: number;
  quantity: number;
  date?: string;
  details?: string;
  provider?: string;
}

const preferenceFilters = [
  "Beach",
  "Adventure",
  "Culture",
  "Food",
  "Nightlife",
  "Wildlife",
  "Cruise",
  "Sightseeing",
  "Wellness",
];

function priceToLevel(price: number | null): string | null {
  if (price === null || price === undefined) return null;
  if (price < 30) return "$";
  if (price < 100) return "$$";
  if (price < 300) return "$$$";
  return "$$$$";
}

const PARTNER_PROVIDERS = new Set(["viator", "fever", "amadeus"]);

function providerToSource(p: string): UnifiedResult["source"] {
  switch (p.toLowerCase()) {
    case "viator": return "viator";
    case "fever": return "fever";
    case "amadeus": return "amadeus";
    default: return "native";
  }
}

function catalogItemToUnifiedResult(item: CatalogItem): UnifiedResult {
  const normalizedProvider = item.provider.toLowerCase();
  return {
    id: item.id,
    name: item.title,
    rating: item.rating ?? null,
    reviewCount: item.reviewCount ?? null,
    priceLevel: priceToLevel(item.price),
    description: item.description ?? null,
    imageUrl: item.imageUrl ?? null,
    source: providerToSource(item.provider),
    isPartner: PARTNER_PROVIDERS.has(normalizedProvider),
    // Store normalized provider name in category so chips can filter accurately
    category: normalizedProvider,
    bookingUrl: item.bookingUrl ?? item.affiliateUrl ?? null,
    address: item.destination ?? null,
  };
}

type SortOption = "popular" | "rating" | "price-low" | "price-high";

const SORT_MAP: Record<SortOption, string> = {
  popular: "popular",
  rating: "rating",
  "price-low": "price_low",
  "price-high": "price_high",
};

const TAB_TYPES: Record<string, string> = {
  activities: "activity",
  hotels: "hotel",
  services: "event,poi,transfer",
};

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function BrowsePage() {
  const [, setLocation] = useLocation();
  const [destination, setDestination] = useState("Paris");
  const [startDate, setStartDate] = useState("2026-01-02");
  const [endDate, setEndDate] = useState("2026-01-09");
  const [travelers, setTravelers] = useState(2);
  const [activeTab, setActiveTab] = useState("activities");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [activeProviders, setActiveProviders] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);

  const [priceRange, setPriceRange] = useState<[number, number]>([0, 500]);
  const [minRating, setMinRating] = useState<number>(0);
  const [sortBy, setSortBy] = useState<SortOption>("popular");
  const [searchQuery, setSearchQuery] = useState("");

  const debouncedDestination = useDebouncedValue(destination, 500);
  const debouncedQuery = useDebouncedValue(searchQuery, 400);

  const nights = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));

  // Accumulated results for true "load more" (append) behaviour
  const [allResults, setAllResults] = useState<UnifiedResult[]>([]);
  const [totalFromApi, setTotalFromApi] = useState(0);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);

  // Fingerprint of search params (excludes offset so changing offset doesn't reset)
  const searchFingerprint = useMemo(
    () => JSON.stringify([debouncedDestination, debouncedQuery, priceRange, minRating, sortBy, activeTab, activeProviders]),
    [debouncedDestination, debouncedQuery, priceRange, minRating, sortBy, activeTab, activeProviders]
  );
  const prevFingerprintRef = useRef(searchFingerprint);
  // When the search fingerprint changes reset offset and accumulated results
  useEffect(() => {
    if (prevFingerprintRef.current !== searchFingerprint) {
      prevFingerprintRef.current = searchFingerprint;
      setOffset(0);
      setAllResults([]);
      setTotalFromApi(0);
    }
  }, [searchFingerprint]);

  // Build query params — providers sent to API for server-side narrowing
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedDestination) params.set("destination", debouncedDestination);
    if (debouncedQuery) params.set("query", debouncedQuery);
    if (priceRange[0] > 0) params.set("priceMin", priceRange[0].toString());
    if (priceRange[1] < 500) params.set("priceMax", priceRange[1].toString());
    if (minRating > 0) params.set("rating", minRating.toString());
    params.set("sortBy", SORT_MAP[sortBy]);
    params.set("type", TAB_TYPES[activeTab] ?? "activity");
    if (activeProviders.length > 0) params.set("providers", activeProviders.join(","));
    params.set("limit", "20");
    params.set("offset", offset.toString());
    return params.toString();
  }, [debouncedDestination, debouncedQuery, priceRange, minRating, sortBy, activeTab, activeProviders, offset]);

  const { data, isLoading, isFetching } = useQuery<CatalogSearchResult>({
    queryKey: ["/api/catalog/search", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/catalog/search?${queryParams}`);
      if (!res.ok) throw new Error("Failed to fetch catalog");
      return res.json();
    },
    staleTime: 60_000,
  });

  // Accumulate results: replace on first page, append on subsequent pages
  useEffect(() => {
    if (!data) return;
    const newItems = data.items.map(catalogItemToUnifiedResult);
    setAllResults(prev => offset === 0 ? newItems : [...prev, ...newItems]);
    setTotalFromApi(data.total);
    if (data.filters?.providers?.length) {
      setAvailableProviders(prev => {
        const merged = Array.from(new Set([...prev, ...data.filters.providers]));
        return merged;
      });
    }
  }, [data, offset]);

  // Secondary client-side filter (backup for immediate UX; API already server-filters)
  // Uses r.category which holds the normalized provider name from catalogItemToUnifiedResult
  const displayResults = useMemo(() => {
    if (activeProviders.length === 0) return allResults;
    const normalized = activeProviders.map(p => p.toLowerCase());
    return allResults.filter(r => normalized.includes(r.category ?? ""));
  }, [allResults, activeProviders]);

  const clearAllFilters = useCallback(() => {
    setPriceRange([0, 500]);
    setMinRating(0);
    setSortBy("popular");
    setSearchQuery("");
    setSelectedFilters([]);
    setActiveProviders([]);
    setOffset(0);
  }, []);

  const activeFiltersCount =
    (priceRange[0] > 0 || priceRange[1] < 500 ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (sortBy !== "popular" ? 1 : 0) +
    (searchQuery ? 1 : 0) +
    selectedFilters.length +
    activeProviders.length;

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

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const newQty = Math.max(1, item.quantity + delta);
          return { ...item, quantity: newQty };
        }
        return item;
      })
    );
  };

  const toggleFilter = (filter: string) => {
    setSelectedFilters((prev) =>
      prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter]
    );
  };

  const toggleProvider = (provider: string) => {
    setActiveProviders((prev) =>
      prev.includes(provider) ? prev.filter((p) => p !== provider) : [...prev, provider]
    );
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const platformFee = Math.round(cartTotal * 0.03);
  const grandTotal = cartTotal + platformFee;

  const handleSubmitDetails = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50">
        {/* Hero Section with Trip Details Form */}
        <div className="relative h-[280px] md:h-[320px]">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: "url('https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=1600&q=80')",
            }}
          >
            <div className="absolute inset-0 bg-black/30" />
          </div>

          {/* Trip Details Card */}
          <div className="absolute right-4 md:right-12 top-1/2 -translate-y-1/2 w-[360px] md:w-[420px]">
            <Card className="bg-white/95 backdrop-blur shadow-xl border-0">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Trip Details</h2>
                  <Sparkles className="w-5 h-5 text-[#FF385C]" />
                </div>

                <form onSubmit={handleSubmitDetails} className="space-y-4">
                  <div>
                    <Label htmlFor="trip-to" className="text-sm text-gray-600">Trip to:</Label>
                    <div className="relative mt-1">
                      <Input
                        id="trip-to"
                        placeholder="Eg: Paris, New York, Japan"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        className="pl-10"
                        data-testid="input-destination"
                      />
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm text-gray-600">Travel Dates:</Label>
                    <div className="grid grid-cols-2 gap-3 mt-1">
                      <div>
                        <Label htmlFor="from-date" className="text-xs text-gray-400">From</Label>
                        <div className="relative">
                          <Input
                            id="from-date"
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="pl-9"
                            data-testid="input-start-date"
                          />
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="to-date" className="text-xs text-gray-400">To</Label>
                        <div className="relative">
                          <Input
                            id="to-date"
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="pl-9"
                            data-testid="input-end-date"
                          />
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="travelers" className="text-sm text-gray-600">Travelers:</Label>
                    <Select value={travelers.toString()} onValueChange={(v) => setTravelers(parseInt(v))}>
                      <SelectTrigger id="travelers" className="mt-1" data-testid="select-travelers">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <SelectItem key={n} value={n.toString()}>{n} {n === 1 ? "traveler" : "travelers"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-[#FF385C] hover:bg-[#E23350] text-white"
                    data-testid="button-submit-trip"
                  >
                    Search
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Tabs and Content Section */}
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setOffset(0); }} className="flex-1">
              <div className="flex items-center justify-between gap-4">
                <TabsList className="bg-transparent p-0 h-auto gap-1">
                  <TabsTrigger
                    value="activities"
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium",
                      activeTab === "activities" ? "bg-[#FF385C] text-white" : "bg-gray-100 text-gray-700"
                    )}
                    data-testid="tab-activities"
                  >
                    Activities
                  </TabsTrigger>
                  <TabsTrigger
                    value="hotels"
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium",
                      activeTab === "hotels" ? "bg-[#FF385C] text-white" : "bg-gray-100 text-gray-700"
                    )}
                    data-testid="tab-hotels"
                  >
                    Hotels
                  </TabsTrigger>
                  <TabsTrigger
                    value="services"
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium",
                      activeTab === "services" ? "bg-[#FF385C] text-white" : "bg-gray-100 text-gray-700"
                    )}
                    data-testid="tab-services"
                  >
                    Events & More
                  </TabsTrigger>
                  <TabsTrigger
                    value="ai-optimization"
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium flex items-center gap-1",
                      activeTab === "ai-optimization" ? "bg-[#FF385C] text-white" : "bg-gray-100 text-gray-700"
                    )}
                    data-testid="tab-ai-optimization"
                  >
                    <Wand2 className="w-4 h-4" /> AI Optimization
                  </TabsTrigger>
                </TabsList>

                {/* Cart Button */}
                <Sheet open={cartOpen} onOpenChange={setCartOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" className="relative gap-2" data-testid="button-open-cart">
                      <ShoppingCart className="w-4 h-4" />
                      <span className="font-medium">${cartTotal.toLocaleString()}</span>
                      {cart.length > 0 && (
                        <span className="absolute -top-2 -right-2 w-5 h-5 bg-[#FF385C] text-white text-xs rounded-full flex items-center justify-center">
                          {cart.length}
                        </span>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent className="w-[400px] sm:w-[540px]">
                    <SheetHeader>
                      <SheetTitle>Your Cart</SheetTitle>
                    </SheetHeader>
                    <ScrollArea className="h-[calc(100vh-200px)] mt-4">
                      {cart.length === 0 ? (
                        <div className="text-center py-12">
                          <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                          <p className="text-gray-500">Your cart is empty</p>
                          <p className="text-sm text-gray-400 mt-2">
                            Browse and add items to see your total cost
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {["activity", "hotel", "service"].map((type) => {
                            const items = cart.filter((i) => i.type === type);
                            if (items.length === 0) return null;
                            const typeLabel = type === "activity" ? "Activities" : type === "hotel" ? "Accommodation" : "Services";
                            const typeTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
                            return (
                              <div key={type}>
                                <div className="flex items-center justify-between text-sm font-medium text-gray-500 mb-2">
                                  <span>{typeLabel.toUpperCase()} ({items.length})</span>
                                  <span>${typeTotal.toLocaleString()}</span>
                                </div>
                                {items.map((item) => (
                                  <Card key={item.id} className="mb-2" data-testid={`cart-item-${item.id}`}>
                                    <CardContent className="p-3">
                                      <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex-1 min-w-0">
                                          <p className="font-medium text-gray-900 text-sm truncate">{item.name}</p>
                                          {item.details && (
                                            <p className="text-xs text-gray-500">{item.details}</p>
                                          )}
                                          {item.provider && (
                                            <p className="text-xs text-gray-400">via {item.provider}</p>
                                          )}
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 text-gray-400 hover:text-red-500"
                                          onClick={() => removeFromCart(item.id)}
                                          data-testid={`button-remove-${item.id}`}
                                        >
                                          <X className="w-4 h-4" />
                                        </Button>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1">
                                          <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => updateQuantity(item.id, -1)}
                                            disabled={item.quantity <= 1}
                                            data-testid={`button-qty-minus-${item.id}`}
                                          >
                                            <span className="text-sm">-</span>
                                          </Button>
                                          <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                                          <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => updateQuantity(item.id, 1)}
                                            data-testid={`button-qty-plus-${item.id}`}
                                          >
                                            <span className="text-sm">+</span>
                                          </Button>
                                        </div>
                                        <span className="font-medium text-gray-900">${(item.price * item.quantity).toLocaleString()}</span>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            );
                          })}

                          <Separator />

                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Subtotal ({cart.length} items)</span>
                              <span className="font-medium">${cartTotal.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Platform Fee (3%)</span>
                              <span>${platformFee.toLocaleString()}</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between text-base font-semibold">
                              <span>Total</span>
                              <span>${grandTotal.toLocaleString()}</span>
                            </div>
                            <p className="text-xs text-gray-400 text-right">
                              (per person: ${Math.round(grandTotal / travelers).toLocaleString()})
                            </p>
                          </div>

                          {cart.length >= 3 && (
                            <Card className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-100">
                              <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                  <Sparkles className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                                  <div>
                                    <p className="font-semibold text-gray-900 mb-1">Unlock AI Optimization</p>
                                    <p className="text-sm text-gray-600 mb-3">
                                      Our AI can create optimized alternatives that could save you $200-400!
                                    </p>
                                    <Button
                                      className="bg-[#FF385C] hover:bg-[#E23350] text-white w-full"
                                      onClick={() => setLocation("/optimize")}
                                      data-testid="button-ai-optimize"
                                    >
                                      See AI Optimization - $19.99
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          )}

                          <div className="flex gap-2">
                            <Button variant="outline" className="flex-1" data-testid="button-save-cart">
                              Save Cart
                            </Button>
                            <Button variant="outline" className="flex-1" data-testid="button-share-cart">
                              Share Cart
                            </Button>
                          </div>

                          <Button
                            className="w-full bg-[#FF385C] hover:bg-[#E23350] text-white"
                            data-testid="button-checkout"
                          >
                            Proceed to Checkout
                          </Button>
                        </div>
                      )}
                    </ScrollArea>
                  </SheetContent>
                </Sheet>
              </div>

              {/* Filters Section */}
              <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="mt-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 text-gray-700" data-testid="button-toggle-filters">
                      <SlidersHorizontal className="w-4 h-4" />
                      Filters & Sort
                      {activeFiltersCount > 0 && (
                        <Badge className="bg-[#FF385C] text-white ml-1">{activeFiltersCount}</Badge>
                      )}
                      <ChevronDown className={cn("w-4 h-4 transition-transform", filtersOpen && "rotate-180")} />
                    </Button>
                  </CollapsibleTrigger>
                  {activeFiltersCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAllFilters}
                      className="text-[#FF385C] hover:text-[#E23350]"
                      data-testid="button-clear-filters"
                    >
                      <X className="w-3 h-3 mr-1" /> Clear all
                    </Button>
                  )}
                </div>

                <CollapsibleContent>
                  <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                    <CardContent className="p-4 space-y-5">
                      {/* Search Input */}
                      <div>
                        <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                          Search
                        </Label>
                        <div className="relative">
                          <Input
                            placeholder="Search by name or description..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                            data-testid="input-search-filter"
                          />
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Price Range */}
                        <div>
                          <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">
                            Price Range: ${priceRange[0]} - ${priceRange[1]}+
                          </Label>
                          <Slider
                            value={priceRange}
                            onValueChange={(value) => setPriceRange(value as [number, number])}
                            max={500}
                            min={0}
                            step={10}
                            className="w-full"
                            data-testid="slider-price-range"
                          />
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>$0</span>
                            <span>$500+</span>
                          </div>
                        </div>

                        {/* Minimum Rating */}
                        <div>
                          <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">
                            Minimum Rating
                          </Label>
                          <div className="flex gap-1">
                            {[0, 3, 3.5, 4, 4.5].map((rating) => (
                              <Button
                                key={rating}
                                variant="outline"
                                size="sm"
                                onClick={() => setMinRating(rating)}
                                className={cn(
                                  "flex-1",
                                  minRating === rating
                                    ? "bg-[#FF385C] text-white border-[#FF385C]"
                                    : "bg-white text-gray-700"
                                )}
                                data-testid={`button-rating-${rating}`}
                              >
                                {rating === 0 ? "All" : (
                                  <span className="flex items-center gap-0.5">
                                    <Star className="w-3 h-3 fill-current" />
                                    {rating}+
                                  </span>
                                )}
                              </Button>
                            ))}
                          </div>
                        </div>

                        {/* Sort By */}
                        <div>
                          <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">
                            Sort By
                          </Label>
                          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                            <SelectTrigger className="w-full" data-testid="select-sort">
                              <SelectValue placeholder="Sort by..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="popular">Most Popular</SelectItem>
                              <SelectItem value="rating">Highest Rated</SelectItem>
                              <SelectItem value="price-low">Price: Low to High</SelectItem>
                              <SelectItem value="price-high">Price: High to Low</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Preference Filters */}
                      <div>
                        <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                          Activity Preferences
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {preferenceFilters.map((filter) => (
                            <Button
                              key={filter}
                              variant="outline"
                              size="sm"
                              onClick={() => toggleFilter(filter)}
                              className={cn(
                                "rounded-full",
                                selectedFilters.includes(filter)
                                  ? "bg-[#FF385C] text-white border-[#FF385C]"
                                  : "bg-white text-gray-700"
                              )}
                              data-testid={`filter-${filter.toLowerCase()}`}
                            >
                              {filter}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>

              {/* Provider Filter Chips */}
              {availableProviders.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4" data-testid="provider-filter-chips">
                  <span className="text-sm text-gray-500 self-center mr-1">Providers:</span>
                  {availableProviders.map((provider) => (
                    <Button
                      key={provider}
                      variant="outline"
                      size="sm"
                      onClick={() => toggleProvider(provider)}
                      className={cn(
                        "rounded-full capitalize text-xs h-7",
                        activeProviders.includes(provider)
                          ? "bg-[#FF385C] text-white border-[#FF385C]"
                          : "bg-white text-gray-700"
                      )}
                      data-testid={`chip-provider-${provider}`}
                    >
                      {provider}
                    </Button>
                  ))}
                </div>
              )}

              {/* Two Column Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Catalog Results */}
                <div>
                  {/* Results count */}
                  {activeTab !== "ai-optimization" && (
                    <p className="text-gray-600 text-sm mb-4" data-testid="results-count">
                      {isLoading || (isFetching && offset === 0)
                        ? "Loading..."
                        : `Showing ${displayResults.length}${activeProviders.length > 0 ? ` (filtered from ${allResults.length})` : ""} of ${totalFromApi} results in ${destination || "all destinations"}`}
                    </p>
                  )}

                  <TabsContent value="activities" className="mt-0">
                    <UnifiedResultGrid
                      results={displayResults}
                      destination={destination}
                      isLoading={isLoading || (isFetching && offset === 0)}
                    />
                    {!isLoading && displayResults.length === 0 && !isFetching && (
                      <div className="text-center py-10">
                        <Filter className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-600 font-medium">No activities found</p>
                        <p className="text-sm text-gray-500 mt-1">Try a different destination or adjust your filters</p>
                        <Button variant="outline" size="sm" onClick={clearAllFilters} className="mt-3" data-testid="button-clear-activity-filters">
                          Clear filters
                        </Button>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="hotels" className="mt-0">
                    <UnifiedResultGrid
                      results={displayResults}
                      destination={destination}
                      isLoading={isLoading || (isFetching && offset === 0)}
                    />
                    {!isLoading && displayResults.length === 0 && !isFetching && (
                      <div className="text-center py-10">
                        <Filter className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-600 font-medium">No hotels found</p>
                        <p className="text-sm text-gray-500 mt-1">Try a different destination or adjust your filters</p>
                        <Button variant="outline" size="sm" onClick={clearAllFilters} className="mt-3" data-testid="button-clear-hotel-filters">
                          Clear filters
                        </Button>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="services" className="mt-0">
                    <UnifiedResultGrid
                      results={displayResults}
                      destination={destination}
                      isLoading={isLoading || (isFetching && offset === 0)}
                    />
                    {!isLoading && displayResults.length === 0 && !isFetching && (
                      <div className="text-center py-10">
                        <Filter className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-600 font-medium">No events or services found</p>
                        <p className="text-sm text-gray-500 mt-1">Try a different destination or adjust your filters</p>
                        <Button variant="outline" size="sm" onClick={clearAllFilters} className="mt-3" data-testid="button-clear-service-filters">
                          Clear filters
                        </Button>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="ai-optimization" className="mt-0">
                    <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-100">
                      <CardContent className="p-6 text-center">
                        <Wand2 className="w-12 h-12 text-purple-600 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">AI-Powered Trip Optimization</h3>
                        <p className="text-gray-600 mb-4">
                          Add at least 3 items to your cart to unlock AI optimization.
                          Our AI will analyze your selections and suggest alternatives that could save you money and time.
                        </p>
                        {cart.length >= 3 ? (
                          <Button
                            className="bg-[#FF385C] hover:bg-[#E23350] text-white"
                            onClick={() => setLocation("/optimize")}
                            data-testid="button-view-optimization"
                          >
                            View AI Optimization Options
                          </Button>
                        ) : (
                          <p className="text-sm text-gray-500">
                            Add {3 - cart.length} more item{3 - cart.length !== 1 ? "s" : ""} to unlock
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Load More */}
                  {activeTab !== "ai-optimization" && !isLoading && allResults.length > 0 && allResults.length < totalFromApi && (
                    <div className="mt-6 text-center">
                      <Button
                        variant="outline"
                        onClick={() => setOffset((prev) => prev + 20)}
                        disabled={isFetching}
                        data-testid="button-load-more"
                      >
                        {isFetching ? "Loading..." : "Load more"}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Right Column - Map */}
                <div className="hidden lg:block">
                  <div className="sticky top-4">
                    <Card className="overflow-hidden h-[600px]">
                      <CardContent className="p-0 h-full">
                        <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                          <div className="text-center">
                            <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                            <p className="text-gray-500 font-medium">Interactive Map</p>
                            <p className="text-sm text-gray-400">Showing locations in {destination || "your destination"}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </Tabs>
          </div>
        </div>
      </div>
    </Layout>
  );
}
