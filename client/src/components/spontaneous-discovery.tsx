import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Zap, 
  MapPin, 
  Clock, 
  TrendingUp, 
  Star, 
  ExternalLink, 
  Calendar,
  DollarSign,
  Ticket,
  Hotel,
  Activity,
  Sparkles,
  Filter,
  RefreshCw,
  PartyPopper,
  Moon,
  Sun,
  CalendarDays
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";

interface ScoredOpportunity {
  id: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  type: "last_minute" | "trending" | "local_event" | "flash_deal";
  source: "viator" | "fever" | "amadeus";
  externalId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  affiliateUrl: string | null;
  originalPrice: number | null;
  currentPrice: number | null;
  currency: string;
  discountPercent: number | null;
  startTime: string | null;
  endTime: string | null;
  expirationTime: string;
  capacity: number | null;
  remainingSpots: number | null;
  urgencyScore: number;
  actionabilityScore: number;
  trendingScore: number;
  category: string | null;
  tags: string[];
  metadata: Record<string, any>;
  distance?: number;
  trendingOn?: string[];
  bookedRecently?: number;
}

interface SpontaneousDiscoveryProps {
  city?: string;
  lat?: number;
  lng?: number;
  showPreferencesButton?: boolean;
}

type TimeWindow = "tonight" | "tomorrow" | "weekend" | "surprise_me";

const timeWindowConfig: Record<TimeWindow, { label: string; icon: typeof Moon; description: string }> = {
  tonight: { 
    label: "Tonight", 
    icon: Moon, 
    description: "Things happening in the next few hours" 
  },
  tomorrow: { 
    label: "Tomorrow", 
    icon: Sun, 
    description: "Plan something for tomorrow" 
  },
  weekend: { 
    label: "This Weekend", 
    icon: CalendarDays, 
    description: "Weekend activities and events" 
  },
  surprise_me: { 
    label: "Surprise Me!", 
    icon: Sparkles, 
    description: "Random exciting opportunities" 
  },
};

const typeColors: Record<string, string> = {
  last_minute: "bg-orange-500/10 text-orange-600 border-orange-200",
  trending: "bg-blue-500/10 text-blue-600 border-blue-200",
  local_event: "bg-purple-500/10 text-purple-600 border-purple-200",
  flash_deal: "bg-green-500/10 text-green-600 border-green-200",
};

const sourceIcons: Record<string, typeof Activity> = {
  viator: Activity,
  fever: Ticket,
  amadeus: Hotel,
};

export function SpontaneousDiscovery({ 
  city: initialCity, 
  lat, 
  lng,
  showPreferencesButton = true 
}: SpontaneousDiscoveryProps) {
  const [selectedWindow, setSelectedWindow] = useState<TimeWindow>("tonight");
  const [searchCity, setSearchCity] = useState(initialCity || "");
  const [activeCity, setActiveCity] = useState(initialCity || "");
  
  const { data, isLoading, refetch, isFetching } = useQuery<{
    opportunities: ScoredOpportunity[];
    total: number;
    refreshedAt: string;
  }>({
    queryKey: ["/api/spontaneous/quick-search", selectedWindow, activeCity],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeCity) params.set("city", activeCity);
      if (lat) params.set("lat", lat.toString());
      if (lng) params.set("lng", lng.toString());
      
      const response = await fetch(`/api/spontaneous/quick-search/${selectedWindow}?${params}`);
      if (!response.ok) throw new Error("Failed to fetch opportunities");
      return response.json();
    },
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 10,
  });

  const bookMutation = useMutation({
    mutationFn: async (opportunityId: string) => {
      const response = await apiRequest("POST", `/api/spontaneous/${opportunityId}/book`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.redirectUrl) {
        window.open(data.redirectUrl, "_blank");
      }
    },
  });

  const handleSearch = () => {
    setActiveCity(searchCity);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const formatPrice = (price: number | null, currency: string) => {
    if (price === null) return "Price varies";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(price);
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", { 
      hour: "numeric", 
      minute: "2-digit",
      hour12: true 
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { 
      weekday: "short",
      month: "short", 
      day: "numeric" 
    });
  };

  const getUrgencyLabel = (score: number): { label: string; color: string } => {
    if (score >= 80) return { label: "Act Now!", color: "text-red-500" };
    if (score >= 60) return { label: "Limited Time", color: "text-orange-500" };
    if (score >= 40) return { label: "Good Deal", color: "text-yellow-500" };
    return { label: "Available", color: "text-green-500" };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Spontaneous Discovery</h2>
            <p className="text-sm text-muted-foreground">
              Real-time opportunities happening near you
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex gap-2">
            <Input
              placeholder="Enter city..."
              value={searchCity}
              onChange={(e) => setSearchCity(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-40 sm:w-48"
              data-testid="input-spontaneous-city"
            />
            <Button 
              size="sm" 
              onClick={handleSearch}
              data-testid="button-spontaneous-search"
            >
              <MapPin className="h-4 w-4 mr-1" />
              Search
            </Button>
          </div>
          
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-opportunities"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <Tabs 
        value={selectedWindow} 
        onValueChange={(v) => setSelectedWindow(v as TimeWindow)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-4 mb-4">
          {(Object.keys(timeWindowConfig) as TimeWindow[]).map((window) => {
            const config = timeWindowConfig[window];
            const IconComponent = config.icon;
            return (
              <TabsTrigger 
                key={window} 
                value={window}
                className="flex items-center gap-1.5"
                data-testid={`tab-${window}`}
              >
                <IconComponent className="h-4 w-4" />
                <span className="hidden sm:inline">{config.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="text-sm text-muted-foreground mb-4">
          {timeWindowConfig[selectedWindow].description}
          {activeCity && (
            <span className="ml-1">in <strong>{activeCity}</strong></span>
          )}
        </div>

        <TabsContent value={selectedWindow} className="mt-0">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="h-40 w-full" />
                  <CardContent className="p-4 space-y-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-8 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : data?.opportunities && data.opportunities.length > 0 ? (
            <AnimatePresence mode="popLayout">
              <motion.div 
                className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                {data.opportunities.map((opportunity, index) => {
                  const SourceIcon = sourceIcons[opportunity.source] || Activity;
                  const urgency = getUrgencyLabel(opportunity.urgencyScore);
                  
                  return (
                    <motion.div
                      key={opportunity.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card 
                        className="overflow-hidden hover-elevate h-full flex flex-col"
                        data-testid={`card-opportunity-${opportunity.id}`}
                      >
                        {opportunity.imageUrl ? (
                          <div className="relative h-40 overflow-hidden bg-muted">
                            <img
                              src={opportunity.imageUrl}
                              alt={opportunity.title}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                            <div className="absolute top-2 left-2 flex gap-1">
                              <Badge 
                                variant="secondary" 
                                className={`${typeColors[opportunity.type]} text-xs`}
                              >
                                {opportunity.type.replace("_", " ")}
                              </Badge>
                            </div>
                            <div className="absolute top-2 right-2">
                              <Badge variant="secondary" className="bg-white/90 text-xs">
                                <SourceIcon className="h-3 w-3 mr-1" />
                                {opportunity.source}
                              </Badge>
                            </div>
                            <div className="absolute bottom-2 left-2 right-2">
                              <h3 className="text-white font-semibold text-sm line-clamp-2">
                                {opportunity.title}
                              </h3>
                            </div>
                          </div>
                        ) : (
                          <div className="relative h-32 bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                            <SourceIcon className="h-12 w-12 text-muted-foreground/30" />
                            <div className="absolute top-2 left-2 flex gap-1">
                              <Badge 
                                variant="secondary" 
                                className={`${typeColors[opportunity.type]} text-xs`}
                              >
                                {opportunity.type.replace("_", " ")}
                              </Badge>
                            </div>
                          </div>
                        )}
                        
                        <CardContent className="p-4 flex-1 flex flex-col">
                          {!opportunity.imageUrl && (
                            <h3 className="font-semibold text-sm line-clamp-2 mb-2">
                              {opportunity.title}
                            </h3>
                          )}
                          
                          <div className="space-y-2 flex-1">
                            {opportunity.city && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3" />
                                <span>{opportunity.city}</span>
                                {opportunity.distance !== undefined && (
                                  <span>({opportunity.distance.toFixed(1)} km away)</span>
                                )}
                              </div>
                            )}
                            
                            {opportunity.startTime && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                <span>
                                  {formatDate(opportunity.startTime)} at {formatTime(opportunity.startTime)}
                                </span>
                              </div>
                            )}
                            
                            {opportunity.category && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Filter className="h-3 w-3" />
                                <span>{opportunity.category}</span>
                              </div>
                            )}
                            
                            {opportunity.trendingOn && opportunity.trendingOn.length > 0 && (
                              <div className="flex items-center gap-1.5 text-xs">
                                <TrendingUp className="h-3 w-3 text-blue-500" />
                                <span className="text-blue-600">
                                  Trending on {opportunity.trendingOn.join(", ")}
                                </span>
                              </div>
                            )}
                            
                            {opportunity.remainingSpots !== null && opportunity.remainingSpots > 0 && opportunity.remainingSpots < 10 && (
                              <div className="flex items-center gap-1.5 text-xs text-red-600">
                                <Clock className="h-3 w-3" />
                                <span>Only {opportunity.remainingSpots} spots left!</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center justify-between mt-4 pt-3 border-t">
                            <div>
                              {opportunity.currentPrice !== null ? (
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-lg">
                                    {formatPrice(opportunity.currentPrice, opportunity.currency)}
                                  </span>
                                  {opportunity.discountPercent && opportunity.discountPercent > 0 && (
                                    <Badge variant="secondary" className="bg-green-500/10 text-green-600 text-xs">
                                      {opportunity.discountPercent}% off
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">See details</span>
                              )}
                              <p className={`text-xs ${urgency.color}`}>
                                {urgency.label}
                              </p>
                            </div>
                            
                            <Button
                              size="sm"
                              onClick={() => {
                                if (opportunity.affiliateUrl) {
                                  window.open(opportunity.affiliateUrl, "_blank");
                                } else {
                                  bookMutation.mutate(opportunity.id);
                                }
                              }}
                              disabled={bookMutation.isPending}
                              data-testid={`button-book-${opportunity.id}`}
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              Book
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          ) : (
            <Card className="p-8 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 rounded-full bg-muted">
                  <PartyPopper className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-1">No opportunities found</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    {activeCity 
                      ? `We couldn't find any spontaneous activities in ${activeCity} for ${timeWindowConfig[selectedWindow].label.toLowerCase()}. Try a different time window or city.`
                      : "Enter a city to discover spontaneous activities and events happening near you."
                    }
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  onClick={() => refetch()}
                  className="mt-2"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {data?.refreshedAt && (
        <p className="text-xs text-muted-foreground text-center">
          Last updated: {new Date(data.refreshedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

export default SpontaneousDiscovery;
