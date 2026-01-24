import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Gem, 
  MapPin, 
  Clock, 
  Star, 
  Lightbulb, 
  Search, 
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
  Bookmark
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

export default function HiddenGemsPage() {
  const { toast } = useToast();
  const [searchDestination, setSearchDestination] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [discoverDestination, setDiscoverDestination] = useState("");

  const { data: categoriesData, isLoading: categoriesLoading } = useQuery<{ categories: Category[] }>({
    queryKey: ["/api/discovery/categories"],
  });

  const gemsQueryParams = new URLSearchParams();
  if (searchDestination) gemsQueryParams.append("destination", searchDestination);
  if (selectedCategory !== "all") gemsQueryParams.append("category", selectedCategory);
  gemsQueryParams.append("limit", "50");
  const gemsQueryString = `/api/discovery/gems?${gemsQueryParams.toString()}`;

  const { data: gemsData, isLoading: gemsLoading, error: gemsError } = useQuery<{ gems: DiscoveredGem[]; total: number }>({
    queryKey: [gemsQueryString],
  });

  const { data: destinationsData } = useQuery<{ destinations: { destination: string; gemCount: number }[] }>({
    queryKey: ["/api/discovery/destinations"],
  });

  const discoverMutation = useMutation({
    mutationFn: async (destination: string) => {
      return apiRequest("POST", "/api/discovery/scan", { destination });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Discovery Complete",
        description: data.message || `Discovered ${data.totalGems} hidden gems!`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/gems"] });
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
    <div className="container mx-auto py-8 px-4 space-y-8" data-testid="hidden-gems-page">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Gem className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Hidden Gems</h1>
        </div>
        <p className="text-muted-foreground">
          AI-discovered local secrets and authentic experiences that tourists rarely find
        </p>
      </div>

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
              Grok is researching local secrets... This may take a moment.
            </p>
          )}
        </CardContent>
      </Card>

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
                <Badge variant="secondary" className="ml-2">{d.gemCount}</Badge>
              </Button>
            ))}
          </div>
        </div>
      )}

      <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="all" data-testid="tab-all">
            <Gem className="h-4 w-4 mr-1" />
            All
          </TabsTrigger>
          {categoriesLoading ? (
            <Skeleton className="h-8 w-32" />
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
            <Card>
              <CardContent className="py-12 text-center">
                <div className="text-destructive mb-4">Failed to load hidden gems</div>
                <p className="text-muted-foreground">Please try again later</p>
              </CardContent>
            </Card>
          ) : gemsLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
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
            <Card>
              <CardContent className="py-12 text-center">
                <Gem className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No hidden gems yet</h3>
                <p className="text-muted-foreground mb-4">
                  {searchDestination 
                    ? `No gems found for ${searchDestination}. Try discovering new ones!`
                    : "Start by discovering gems for a destination above"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Best time:</span>
                        <span>{gem.bestTimeToVisit}</span>
                      </div>
                    )}
                    
                    {gem.tags && gem.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {gem.tags.map((tag, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground border-t">
                      <div className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {gem.viewCount || 0} views
                      </div>
                      <div className="flex items-center gap-1">
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
  );
}
