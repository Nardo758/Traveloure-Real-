import { useState, useEffect } from "react";
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
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useSearch } from "wouter";
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
  Lightbulb,
  ShoppingCart,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

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

function ServiceCard({ 
  service, 
  category,
  onAddToCart,
  isAddingToCart 
}: { 
  service: Service; 
  category?: ServiceCategory;
  onAddToCart?: (serviceId: string) => void;
  isAddingToCart?: boolean;
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
            className="w-full mt-3"
            onClick={() => onAddToCart(service.id)}
            disabled={isAddingToCart}
            data-testid={`button-add-to-cart-${service.id}`}
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            {isAddingToCart ? "Adding..." : "Add to Cart"}
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

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: categories } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
  });

  const { data: result, isLoading } = useQuery<DiscoverResult>({
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

  const { toast } = useToast();
  const { user } = useAuth();
  const [addingToCartId, setAddingToCartId] = useState<string | null>(null);

  const addToCartMutation = useMutation({
    mutationFn: async (serviceId: string) => {
      setAddingToCartId(serviceId);
      return apiRequest("POST", "/api/cart", { serviceId, quantity: 1 });
    },
    onSuccess: () => {
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
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 1500);
      return;
    }
    addToCartMutation.mutate(serviceId);
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

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 
            className="text-3xl font-bold text-foreground"
            data-testid="text-page-title"
          >
            Discover Services
          </h1>
          <p className="text-muted-foreground mt-2">
            Find the perfect service for your travel needs
          </p>
        </div>

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
            {/* Search Bar */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search services..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
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

              {/* AI Recommendations Button */}
              <Button 
                onClick={getAIRecommendations}
                disabled={recommendationsMutation.isPending}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                data-testid="button-ai-recommendations"
              >
                {recommendationsMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4 mr-2" />
                )}
                AI Suggestions
              </Button>

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
                    <button
                      onClick={() => setMinPrice(0)}
                      data-testid="button-remove-min-price-filter"
                      className="ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                {maxPrice > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    Max: ${maxPrice}
                    <button
                      onClick={() => setMaxPrice(0)}
                      data-testid="button-remove-max-price-filter"
                      className="ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                {minRating > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    {minRating}+ stars
                    <button
                      onClick={() => setMinRating(0)}
                      data-testid="button-remove-rating-filter"
                      className="ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                {locationFilter && (
                  <Badge variant="secondary" className="gap-1">
                    {locationFilter}
                    <button
                      onClick={() => setLocationFilter("")}
                      data-testid="button-remove-location-filter"
                      className="ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearFilters}
                  data-testid="button-clear-all"
                >
                  Clear all
                </Button>
              </div>
            )}

            {/* AI Recommendations Panel */}
            {showRecommendations && recommendations && (
              <Card className="mb-6 border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Lightbulb className="w-5 h-5 text-purple-500" />
                      AI Recommendations
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowRecommendations(false)}
                      data-testid="button-close-recommendations"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recommendations.suggestions && (
                    <p className="text-muted-foreground text-sm" data-testid="text-ai-suggestion">
                      {recommendations.suggestions}
                    </p>
                  )}
                  
                  {recommendations.recommendedCategories.length > 0 && (
                    <div data-testid="section-recommended-categories">
                      <p className="text-sm font-medium mb-2">Suggested Categories:</p>
                      <div className="flex flex-wrap gap-2">
                        {recommendations.recommendedCategories
                          .filter(cat => cat.slug)
                          .map((cat, idx) => {
                            const Icon = categoryIcons[cat.slug] || Compass;
                            return (
                              <Button
                                key={idx}
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const category = categories?.find(c => c.slug === cat.slug);
                                  if (category) setSelectedCategory(category.id);
                                }}
                                className="gap-2"
                                data-testid={`button-rec-category-${cat.slug}`}
                              >
                                <Icon className="w-4 h-4" />
                                {cat.name}
                              </Button>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {recommendations.recommendedServices.length > 0 && (
                    <div data-testid="section-recommended-services">
                      <p className="text-sm font-medium mb-2">Recommended Services:</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {recommendations.recommendedServices.slice(0, 4).map((service) => (
                          <Link 
                            key={service.id} 
                            href={`/services/${service.id}`}
                            data-testid={`link-rec-service-${service.id}`}
                          >
                            <div 
                              className="p-3 bg-background rounded-md border hover-elevate cursor-pointer"
                              data-testid={`card-rec-service-${service.id}`}
                            >
                              <div 
                                className="font-medium text-sm"
                                data-testid={`text-rec-service-name-${service.id}`}
                              >
                                {service.serviceName}
                              </div>
                              <div 
                                className="text-xs text-muted-foreground mt-1"
                                data-testid={`text-rec-reason-${service.id}`}
                              >
                                {service.recommendationReason}
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Results */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        <Skeleton className="w-16 h-16 rounded-md" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-5 w-3/4" />
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-1/2" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : result && result.services.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {result.services.map((service) => (
                    <ServiceCard 
                      key={service.id} 
                      service={service} 
                      category={getCategoryById(service.categoryId)}
                      onAddToCart={handleAddToCart}
                      isAddingToCart={addingToCartId === service.id}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-8">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground px-4">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      data-testid="button-next-page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                <div className="mt-4 text-center text-sm text-muted-foreground">
                  Showing {page * limit + 1}-{Math.min((page + 1) * limit, result.total)} of {result.total} services
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Compass className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-semibold text-lg mb-2">No services found</h3>
                  <p className="text-muted-foreground mb-4">
                    Try adjusting your search or filters to find what you're looking for.
                  </p>
                  <Button onClick={clearFilters} data-testid="button-clear-search">
                    Clear all filters
                  </Button>
                </CardContent>
              </Card>
            )}
          </main>
        </div>
      </div>
    </Layout>
  );
}
