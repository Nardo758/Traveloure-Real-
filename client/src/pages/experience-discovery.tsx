import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { 
  Search, Filter, MapPin, Star, Clock, DollarSign, 
  Building2, Calendar, Ticket, Plane, X, Sparkles
} from "lucide-react";

interface CatalogItem {
  id: string;
  type: "activity" | "hotel" | "event" | "flight";
  provider: string;
  externalId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string;
  rating: number | null;
  reviewCount: number | null;
  destination: string | null;
  location: { lat: number; lng: number } | null;
  duration: string | null;
  categories: string[];
  tags: string[];
  bookingUrl: string | null;
  lastUpdated: string | null;
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

const typeIcons = {
  activity: Ticket,
  hotel: Building2,
  event: Calendar,
  flight: Plane,
};

const typeColors = {
  activity: "#10B981",
  hotel: "#3B82F6",
  event: "#8B5CF6",
  flight: "#F59E0B",
};

const providerLabels: Record<string, string> = {
  viator: "Viator",
  fever: "Fever",
  amadeus: "Amadeus",
};

export default function ExperienceDiscovery() {
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [destination, setDestination] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("popular");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000]);
  const [rating, setRating] = useState<number>(0);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (destination) params.set("destination", destination);
    if (sortBy) params.set("sortBy", sortBy);
    if (priceRange[0] > 0) params.set("priceMin", priceRange[0].toString());
    if (priceRange[1] < 1000) params.set("priceMax", priceRange[1].toString());
    if (rating > 0) params.set("rating", rating.toString());
    if (selectedProviders.length > 0) params.set("providers", selectedProviders.join(","));
    params.set("limit", "20");
    return params.toString();
  }, [query, destination, sortBy, priceRange, rating, selectedProviders]);

  const { data: searchResult, isLoading } = useQuery<CatalogSearchResult>({
    queryKey: [`/api/catalog/search?${queryParams}`],
  });

  const { data: destinations } = useQuery<string[]>({
    queryKey: ["/api/catalog/destinations"],
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(searchInput);
  };

  const toggleProvider = (provider: string) => {
    setSelectedProviders(prev =>
      prev.includes(provider) 
        ? prev.filter(p => p !== provider)
        : [...prev, provider]
    );
  };

  const clearFilters = () => {
    setSearchInput("");
    setQuery("");
    setDestination("");
    setSortBy("popular");
    setPriceRange([0, 1000]);
    setRating(0);
    setSelectedProviders([]);
  };

  const activeFiltersCount = [
    destination,
    priceRange[0] > 0 || priceRange[1] < 1000,
    rating > 0,
    selectedProviders.length > 0,
  ].filter(Boolean).length;

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-primary/5 to-background py-12 sm:py-16">
          <div className="container mx-auto px-4">
            <motion.div 
              className="max-w-3xl mx-auto text-center"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Badge variant="secondary" className="mb-4" data-testid="badge-discovery-header">
                <Sparkles className="h-3 w-3 mr-1" />
                Discover Experiences
              </Badge>
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4" data-testid="text-page-title">
                Explore Activities, Events & Hotels
              </h1>
              <p className="text-muted-foreground mb-6" data-testid="text-page-description">
                Browse our curated catalog of experiences from top providers worldwide.
              </p>

              <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 max-w-xl mx-auto">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search experiences..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>
                <Button type="submit" data-testid="button-search">
                  Search
                </Button>
              </form>
            </motion.div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col lg:flex-row gap-6">
            <aside className="lg:w-64 flex-shrink-0">
              <div className="lg:sticky lg:top-4 space-y-4">
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className="lg:hidden"
                    data-testid="button-toggle-filters"
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Filters
                    {activeFiltersCount > 0 && (
                      <Badge variant="secondary" className="ml-2" data-testid="badge-filter-count">{activeFiltersCount}</Badge>
                    )}
                  </Button>
                </div>

                <Card className={`p-4 space-y-6 ${showFilters ? "block" : "hidden lg:block"}`} data-testid="card-filters">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2" data-testid="text-filters-title">
                      <Filter className="h-4 w-4" />
                      Filters
                    </h3>
                    {activeFiltersCount > 0 && (
                      <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                        <X className="h-3 w-3 mr-1" />
                        Clear
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium" data-testid="label-destination">Destination</label>
                    <Select value={destination || "_all"} onValueChange={(val) => setDestination(val === "_all" ? "" : val)}>
                      <SelectTrigger data-testid="select-destination">
                        <SelectValue placeholder="All destinations" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_all" data-testid="select-item-destination-all">All destinations</SelectItem>
                        {destinations?.slice(0, 20).map((d) => (
                          <SelectItem key={d} value={d} data-testid={`select-item-destination-${d}`}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium" data-testid="label-sort">Sort By</label>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger data-testid="select-sort">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="popular" data-testid="select-item-sort-popular">Most Popular</SelectItem>
                        <SelectItem value="price_low" data-testid="select-item-sort-price-low">Price: Low to High</SelectItem>
                        <SelectItem value="price_high" data-testid="select-item-sort-price-high">Price: High to Low</SelectItem>
                        <SelectItem value="rating" data-testid="select-item-sort-rating">Highest Rated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <label className="text-sm font-medium" data-testid="label-price">Price Range</label>
                    <Slider
                      value={priceRange}
                      onValueChange={(val) => setPriceRange(val as [number, number])}
                      min={0}
                      max={1000}
                      step={50}
                      data-testid="slider-price"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span data-testid="text-price-min">${priceRange[0]}</span>
                      <span data-testid="text-price-max">${priceRange[1]}+</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-sm font-medium" data-testid="label-rating">Minimum Rating</label>
                    <div className="flex gap-2">
                      {[0, 3, 3.5, 4, 4.5].map((r) => (
                        <Button
                          key={r}
                          variant={rating === r ? "default" : "outline"}
                          size="sm"
                          onClick={() => setRating(r)}
                          className="flex-1"
                          data-testid={`button-rating-${r}`}
                        >
                          {r === 0 ? "All" : `${r}+`}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium" data-testid="label-providers">Providers</label>
                    <div className="flex flex-wrap gap-2">
                      {["viator", "fever", "amadeus"].map((p) => (
                        <Badge
                          key={p}
                          variant={selectedProviders.includes(p) ? "default" : "outline"}
                          className="cursor-pointer hover-elevate"
                          onClick={() => toggleProvider(p)}
                          data-testid={`badge-provider-${p}`}
                        >
                          {providerLabels[p]}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </Card>
              </div>
            </aside>

            <main className="flex-1">
              <div className="flex items-center justify-between mb-6">
                <p className="text-sm text-muted-foreground" data-testid="text-results-count">
                  {isLoading ? "Searching..." : `${searchResult?.total || 0} experiences found`}
                </p>
              </div>

              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="grid-loading">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="overflow-hidden">
                      <Skeleton className="h-48 w-full" />
                      <div className="p-4 space-y-3">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </Card>
                  ))}
                </div>
              ) : searchResult?.items.length === 0 ? (
                <Card className="p-12 text-center" data-testid="card-no-results">
                  <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2" data-testid="text-no-results-title">No experiences found</h3>
                  <p className="text-muted-foreground mb-4" data-testid="text-no-results-description">
                    Try adjusting your filters or search terms.
                  </p>
                  <Button variant="outline" onClick={clearFilters} data-testid="button-clear-no-results">
                    Clear Filters
                  </Button>
                </Card>
              ) : (
                <motion.div 
                  className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  data-testid="grid-results"
                >
                  {searchResult?.items.map((item) => {
                    const TypeIcon = typeIcons[item.type] || Ticket;
                    const typeColor = typeColors[item.type] || "#666";
                    
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <Card 
                          className="overflow-hidden group hover-elevate cursor-pointer h-full flex flex-col"
                          data-testid={`card-item-${item.id}`}
                        >
                          <div className="relative h-48 bg-muted">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.title}
                                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                data-testid={`img-item-${item.id}`}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center" data-testid={`placeholder-item-${item.id}`}>
                                <TypeIcon className="h-16 w-16 text-muted-foreground/50" />
                              </div>
                            )}
                            <div className="absolute top-2 left-2 flex gap-1">
                              <Badge 
                                style={{ backgroundColor: typeColor }}
                                className="text-white text-xs"
                                data-testid={`badge-type-${item.id}`}
                              >
                                <TypeIcon className="h-3 w-3 mr-1" />
                                {item.type}
                              </Badge>
                            </div>
                            <Badge 
                              variant="secondary" 
                              className="absolute top-2 right-2 text-xs"
                              data-testid={`badge-provider-item-${item.id}`}
                            >
                              {providerLabels[item.provider] || item.provider}
                            </Badge>
                          </div>

                          <div className="p-4 flex-1 flex flex-col">
                            <h3 className="font-semibold text-foreground mb-1 line-clamp-2" data-testid={`text-title-${item.id}`}>
                              {item.title}
                            </h3>
                            
                            {item.destination && (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2" data-testid={`text-destination-${item.id}`}>
                                <MapPin className="h-3 w-3" />
                                <span className="capitalize">{item.destination}</span>
                              </div>
                            )}

                            {item.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2 mb-3 flex-1" data-testid={`text-description-${item.id}`}>
                                {item.description}
                              </p>
                            )}

                            <div className="flex items-center justify-between mt-auto pt-3 border-t">
                              <div className="flex items-center gap-3">
                                {item.rating && (
                                  <div className="flex items-center gap-1 text-sm" data-testid={`text-rating-${item.id}`}>
                                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                    <span className="font-medium">{item.rating.toFixed(1)}</span>
                                    {item.reviewCount && (
                                      <span className="text-muted-foreground">({item.reviewCount})</span>
                                    )}
                                  </div>
                                )}
                                {item.duration && (
                                  <div className="flex items-center gap-1 text-sm text-muted-foreground" data-testid={`text-duration-${item.id}`}>
                                    <Clock className="h-3 w-3" />
                                    <span>{item.duration}</span>
                                  </div>
                                )}
                              </div>
                              {item.price && (
                                <div className="flex items-center text-lg font-semibold text-primary" data-testid={`text-price-${item.id}`}>
                                  <DollarSign className="h-4 w-4" />
                                  {item.price.toFixed(0)}
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </main>
          </div>
        </div>
      </div>
    </Layout>
  );
}
