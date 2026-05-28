import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { 
  Gem, 
  MapPin, 
  Clock, 
  Star, 
  Lightbulb, 
  Sparkles,
  UtensilsCrossed,
  Mountain,
  Compass,
  PartyPopper,
  Palette,
  ShoppingBag,
  Sunset,
  Building,
  TreePine,
  Music,
  Eye,
  Bookmark,
  History,
  X,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

const CATEGORY_ICONS: Record<string, any> = {
  local_food_secrets: UtensilsCrossed,
  hidden_viewpoints: Mountain,
  off_tourist_path: Compass,
  seasonal_events: PartyPopper,
  cultural_experiences: Palette,
  secret_beaches: Sunset,
  street_art: Palette,
  local_markets: ShoppingBag,
  sunset_spots: Sunset,
  historic_gems: Building,
  nature_escapes: TreePine,
  nightlife_secrets: Music,
};

interface DiscoveredGem {
  id: string;
  destination: string;
  country?: string;
  category: string;
  name: string;
  description: string;
  whySpecial?: string;
  bestTimeToVisit?: string;
  insiderTip?: string;
  approximateLocation?: string;
  priceRange?: string;
  difficultyLevel?: string;
  tags?: string[];
  viewCount?: number;
  saveCount?: number;
}

interface Category {
  value: string;
  label: string;
}

interface RecentSearch {
  destination: string;
  gemCount: number;
  searchedAt: string;
}

const RECENT_SEARCHES_KEY = "traveloure:hidden-gems:recent-searches";
const MAX_RECENT = 10;

function useRecentSearches() {
  const [searches, setSearches] = useState<RecentSearch[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const save = useCallback((destination: string, gemCount: number) => {
    setSearches(prev => {
      const filtered = prev.filter(s => s.destination.toLowerCase() !== destination.toLowerCase());
      const updated = [
        { destination, gemCount, searchedAt: new Date().toISOString() },
        ...filtered,
      ].slice(0, MAX_RECENT);
      try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  const remove = useCallback((destination: string) => {
    setSearches(prev => {
      const updated = prev.filter(s => s.destination !== destination);
      try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  const clear = useCallback(() => {
    setSearches([]);
    try { localStorage.removeItem(RECENT_SEARCHES_KEY); } catch {}
  }, []);

  return { searches, save, remove, clear };
}

export default function HiddenGemsPage() {
  const { toast } = useToast();
  const [searchDestination, setSearchDestination] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [discoverDestination, setDiscoverDestination] = useState("");
  const { searches, save: saveSearch, remove: removeSearch, clear: clearSearches } = useRecentSearches();

  const { data: categoriesData, isLoading: categoriesLoading } = useQuery<{ categories: Category[] }>({
    queryKey: ["/api/discovery/categories"],
  });

  const gemsQueryParams = new URLSearchParams();
  if (searchDestination) gemsQueryParams.append("destination", searchDestination);
  if (selectedCategory !== "all") gemsQueryParams.append("category", selectedCategory);
  gemsQueryParams.append("limit", "50");
  const gemsQueryUrl = `/api/discovery/gems?${gemsQueryParams.toString()}`;

  const { data: gemsData, isLoading: gemsLoading, error: gemsError } = useQuery<{ gems: DiscoveredGem[]; total: number }>({
    queryKey: [gemsQueryUrl],
  });

  const { data: destinationsData } = useQuery<{ destinations: { destination: string; gemCount: number }[] }>({
    queryKey: ["/api/discovery/destinations"],
  });

  const discoverMutation = useMutation({
    mutationFn: async (destination: string) => {
      return apiRequest("POST", "/api/discovery/scan", { destination });
    },
    onSuccess: (data: any, destination: string) => {
      const count = data.totalGems ?? 0;
      toast({
        title: "Discovery Complete",
        description: data.message || `Discovered ${count} hidden gems!`,
      });
      saveSearch(destination, count);
      setSearchDestination(destination);
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/discovery/gems");
        }
      });
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/destinations"] });
      setDiscoverDestination("");
    },
    onError: (error: any) => {
      toast({
        title: "Discovery Failed",
        description: error.message || "Failed to discover hidden gems",
        variant: "destructive",
      });
    },
  });

  const categories = categoriesData?.categories || [];
  const gems = gemsData?.gems || [];
  const destinations = destinationsData?.destinations || [];

  const handleDiscover = () => {
    if (!discoverDestination.trim()) {
      toast({
        title: "Enter a destination",
        description: "Please enter a city or destination to discover hidden gems",
        variant: "destructive",
      });
      return;
    }
    discoverMutation.mutate(discoverDestination.trim());
  };

  const handleRecentSearchClick = (destination: string) => {
    setSearchDestination(destination);
    setSelectedCategory("all");
  };

  const getCategoryIcon = (category: string) => {
    const Icon = CATEGORY_ICONS[category] || Gem;
    return <Icon className="h-4 w-4" />;
  };

  const getPriceColor = (price?: string) => {
    switch (price) {
      case "free": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "budget": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "moderate": return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
      case "expensive": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      default: return "";
    }
  };

  return (
    <div className="container mx-auto py-8 px-4" data-testid="hidden-gems-page">
      <div className="space-y-2 mb-8">
        <div className="flex items-center gap-2">
          <Gem className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Hidden Gems</h1>
        </div>
        <p className="text-muted-foreground">
          AI-discovered local secrets and authentic experiences that tourists rarely find
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
        {/* ── Main content column ─────────────────────────────── */}
        <div className="space-y-6 min-w-0">
          {/* Discover card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Discover New Destinations
              </CardTitle>
              <CardDescription>
                Let AI scan a destination and uncover hidden gems across all categories
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter a city (e.g., Barcelona, Tokyo, Lisbon...)"
                  value={discoverDestination}
                  onChange={(e) => setDiscoverDestination(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleDiscover()}
                  className="flex-1"
                  data-testid="input-discover-destination"
                />
                <Button 
                  onClick={handleDiscover} 
                  disabled={discoverMutation.isPending}
                  data-testid="button-discover"
                >
                  {discoverMutation.isPending ? (
                    <>
                      <Sparkles className="h-4 w-4 mr-2 animate-pulse" />
                      Discovering...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Discover Gems
                    </>
                  )}
                </Button>
              </div>
              {discoverMutation.isPending && (
                <p className="text-sm text-muted-foreground mt-2">
                  AI is researching local secrets... This may take a moment.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Destination chips */}
          {destinations.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Explore Destinations</h3>
              <div className="flex flex-wrap gap-2">
                {destinations.map((d) => (
                  <Button
                    key={d.destination}
                    variant={searchDestination === d.destination ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSearchDestination(searchDestination === d.destination ? "" : d.destination)}
                    data-testid={`button-destination-${d.destination}`}
                  >
                    <MapPin className="h-3 w-3 mr-1" />
                    {d.destination}
                    <Badge variant="secondary" className="ml-2" data-testid={`badge-gem-count-${d.destination}`}>{d.gemCount}</Badge>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Category tabs + gem grid */}
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="all" data-testid="tab-all">
                <Gem className="h-4 w-4 mr-1" />
                All
              </TabsTrigger>
              {categoriesLoading ? (
                <Skeleton className="h-8 w-32" data-testid="skeleton-categories" />
              ) : (
                categories.map((cat) => (
                  <TabsTrigger key={cat.value} value={cat.value} data-testid={`tab-${cat.value}`}>
                    {getCategoryIcon(cat.value)}
                    <span className="ml-1">{cat.label}</span>
                  </TabsTrigger>
                ))
              )}
            </TabsList>

            <TabsContent value={selectedCategory} className="mt-6">
              {gemsError ? (
                <Card data-testid="card-gems-error">
                  <CardContent className="py-12 text-center">
                    <div className="text-destructive mb-4" data-testid="text-error-title">Failed to load hidden gems</div>
                    <p className="text-muted-foreground" data-testid="text-error-message">Please try again later</p>
                  </CardContent>
                </Card>
              ) : gemsLoading ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {[1, 2, 3, 4].map((i) => (
                    <Card key={i}>
                      <CardContent className="pt-6 space-y-4">
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-4 w-1/2" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : gems.length === 0 ? (
                <Card data-testid="card-gems-empty">
                  <CardContent className="py-12 text-center">
                    <Gem className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2" data-testid="text-empty-title">No hidden gems yet</h3>
                    <p className="text-muted-foreground mb-4" data-testid="text-empty-message">
                      {searchDestination 
                        ? `No gems found for ${searchDestination}. Try discovering new ones!`
                        : "Start by discovering gems for a destination above"}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {gems.map((gem) => (
                    <Card key={gem.id} className="hover-elevate" data-testid={`card-gem-${gem.id}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {getCategoryIcon(gem.category)}
                            <Badge variant="secondary" className="text-xs" data-testid={`badge-category-${gem.id}`}>
                              {categories.find(c => c.value === gem.category)?.label || gem.category}
                            </Badge>
                          </div>
                          {gem.priceRange && (
                            <Badge className={getPriceColor(gem.priceRange)} data-testid={`badge-price-${gem.id}`}>
                              {gem.priceRange}
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-lg mt-2" data-testid={`text-gem-name-${gem.id}`}>{gem.name}</CardTitle>
                        {gem.approximateLocation && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {gem.approximateLocation}, {gem.destination}
                          </div>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground" data-testid={`text-gem-description-${gem.id}`}>{gem.description}</p>
                        
                        {gem.whySpecial && (
                          <div className="bg-primary/5 p-3 rounded-md" data-testid={`section-special-${gem.id}`}>
                            <div className="flex items-center gap-1 text-xs font-medium text-primary mb-1">
                              <Star className="h-3 w-3" />
                              What makes it special
                            </div>
                            <p className="text-sm">{gem.whySpecial}</p>
                          </div>
                        )}
                        
                        {gem.insiderTip && (
                          <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-md" data-testid={`section-tip-${gem.id}`}>
                            <div className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">
                              <Lightbulb className="h-3 w-3" />
                              Insider Tip
                            </div>
                            <p className="text-sm">{gem.insiderTip}</p>
                          </div>
                        )}
                        
                        {gem.bestTimeToVisit && (
                          <div className="flex items-center gap-2 text-sm" data-testid={`section-best-time-${gem.id}`}>
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Best time:</span>
                            <span data-testid={`text-best-time-${gem.id}`}>{gem.bestTimeToVisit}</span>
                          </div>
                        )}
                        
                        {gem.tags && gem.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1" data-testid={`section-tags-${gem.id}`}>
                            {gem.tags.map((tag, i) => (
                              <Badge key={i} variant="outline" className="text-xs" data-testid={`badge-tag-${gem.id}-${i}`}>
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                        
                        <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground border-t" data-testid={`section-stats-${gem.id}`}>
                          <div className="flex items-center gap-1" data-testid={`text-views-${gem.id}`}>
                            <Eye className="h-3 w-3" />
                            {gem.viewCount || 0} views
                          </div>
                          <div className="flex items-center gap-1" data-testid={`text-saves-${gem.id}`}>
                            <Bookmark className="h-3 w-3" />
                            {gem.saveCount || 0} saves
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Recent Searches sidebar ──────────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-6" data-testid="sidebar-recent-searches">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Recent Searches
                </CardTitle>
                {searches.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-muted-foreground hover:text-destructive"
                    onClick={clearSearches}
                    data-testid="button-clear-all-searches"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Clear all
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {searches.length === 0 ? (
                <div className="py-6 text-center" data-testid="text-no-recent-searches">
                  <History className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Your discovered destinations will appear here
                  </p>
                </div>
              ) : (
                <ul className="space-y-1" data-testid="list-recent-searches">
                  {searches.map((s, idx) => (
                    <li key={s.destination}>
                      {idx > 0 && <Separator className="my-1" />}
                      <div
                        className={`group flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer transition-colors hover:bg-muted/60 ${
                          searchDestination === s.destination ? "bg-primary/8 text-primary" : ""
                        }`}
                        onClick={() => handleRecentSearchClick(s.destination)}
                        data-testid={`item-recent-search-${s.destination}`}
                      >
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" data-testid={`text-recent-destination-${idx}`}>
                            {s.destination}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {s.gemCount} gem{s.gemCount !== 1 ? "s" : ""} · {formatDistanceToNow(new Date(s.searchedAt), { addSuffix: true })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          <button
                            className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                            onClick={(e) => { e.stopPropagation(); removeSearch(s.destination); }}
                            data-testid={`button-remove-search-${s.destination}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Quick tip card */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-4 pb-4">
              <div className="flex gap-3">
                <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-primary">Discovery tip</p>
                  <p className="text-xs text-muted-foreground">
                    Each scan discovers gems across 3 categories. Search the same city multiple times to uncover more hidden spots.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
