import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Zap,
  MapPin,
  DollarSign,
  Cloud,
  Sparkles,
  ArrowLeft,
  Gem,
  Bell,
  Activity,
  Calendar,
  Plane,
  Plus,
  Check,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CityDetailView } from "./CityDetailView";
import { useTripQueue, QueuedCity } from "@/contexts/TripQueueContext";
import { useToast } from "@/hooks/use-toast";

interface TravelPulseCity {
  id: string;
  cityName: string;
  country: string;
  countryCode?: string | null;
  region?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  pulseScore: number;
  activeTravelers: number;
  trendingScore: number;
  crowdLevel: string;
  vibeTags: string[];
  currentHighlight?: string | null;
  highlightEmoji?: string | null;
  weatherScore?: number | null;
  avgHotelPrice?: string | null;
  priceChange?: string | null;
  priceTrend?: string | null;
  dealAlert?: string | null;
  totalTrendingSpots: number;
  totalHiddenGems: number;
  totalAlerts: number;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
}

interface CityGridProps {
  onCitySelect?: (city: TravelPulseCity) => void;
  selectedCityName?: string;
}

const vibeTagColors: Record<string, string> = {
  romantic: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  adventure: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  foodie: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  nightlife: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  cultural: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  relaxation: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  family: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  budget: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  luxury: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  nature: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
};

function getCrowdLevelColor(level: string) {
  switch ((level || "").toLowerCase()) {
    case "quiet": return "text-green-500 dark:text-green-400 bg-green-50 dark:bg-green-900/20";
    case "moderate": return "text-yellow-500 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20";
    case "busy": return "text-orange-500 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20";
    case "packed": return "text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20";
    default: return "text-muted-foreground bg-muted";
  }
}

function getPulseColor(score: number) {
  if (score >= 90) return "text-[#FF385C]";
  if (score >= 80) return "text-orange-500 dark:text-orange-400";
  return "text-amber-500 dark:text-amber-400";
}

function CityCard({ city, onClick }: { city: TravelPulseCity; onClick: () => void }) {
  const [, navigate] = useLocation();
  const { addCity, removeCity, isInQueue } = useTripQueue();
  const { toast } = useToast();
  const [popoverOpen, setPopoverOpen] = useState(false);
  
  const priceChange = parseFloat(city.priceChange || "0");
  const vibeTags = Array.isArray(city.vibeTags) ? city.vibeTags : [];
  const inQueue = isInQueue(city.id);

  const handlePlanNow = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPopoverOpen(false);
    // Navigate to AI Quick Start Itinerary page with city context
    navigate(`/quick-start?destination=${encodeURIComponent(city.cityName)}&country=${encodeURIComponent(city.country)}`);
  };

  const handleAddToTrip = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPopoverOpen(false);
    
    if (inQueue) {
      removeCity(city.id);
      toast({
        title: "Removed from trip",
        description: `${city.cityName} has been removed from your trip queue.`,
      });
    } else {
      const queuedCity: QueuedCity = {
        id: city.id,
        cityName: city.cityName,
        country: city.country,
        imageUrl: city.imageUrl,
        pulseScore: city.pulseScore,
        vibeTags: city.vibeTags,
        totalHiddenGems: city.totalHiddenGems,
        avgHotelPrice: city.avgHotelPrice,
      };
      addCity(queuedCity);
      toast({
        title: "Added to trip",
        description: `${city.cityName} has been added to your trip queue.`,
      });
    }
  };

  const isHot = city.trendingScore > 70;
  const citySlug = city.cityName.toLowerCase().replace(/\s+/g, "-");

  return (
    <motion.div
      layoutId={`city-${city.id}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="group"
    >
      <div
        className="bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-500 cursor-pointer border border-border"
        onClick={onClick}
        data-testid={`card-city-${citySlug}`}
      >
        {/* ── Photo ── */}
        <div className="relative h-48 overflow-hidden">
          {city.imageUrl ? (
            <img
              src={city.imageUrl}
              alt={city.cityName}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <MapPin className="h-12 w-12 text-primary/30" />
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

          {/* Pulse score — white pill, top-right (matches landing page) */}
          <div
            className="absolute top-3 right-3 w-11 h-11 rounded-xl bg-white/95 dark:bg-white/90 shadow-lg flex items-center justify-center"
            data-testid={`pulse-score-${citySlug}`}
          >
            <span className={cn("text-lg font-bold", getPulseColor(city.pulseScore))}>
              {city.pulseScore}
            </span>
          </div>

          {/* Hot / Trending badge + travelers + alerts — top-left */}
          <div className="absolute top-3 left-3 flex items-center gap-2 flex-wrap">
            {isHot ? (
              <span
                className="px-2.5 py-1 rounded-lg bg-[#FF385C] text-white text-xs font-bold flex items-center gap-1 shadow-lg"
                data-testid={`badge-hot-${citySlug}`}
              >
                <Zap className="w-3 h-3 fill-white" />
                Hot
              </span>
            ) : (
              <span
                className="px-2.5 py-1 rounded-lg bg-amber-500 dark:bg-amber-600 text-white text-xs font-bold flex items-center gap-1 shadow-lg"
                data-testid={`badge-trending-${citySlug}`}
              >
                <TrendingUp className="w-3 h-3" />
                Trending
              </span>
            )}
            {city.activeTravelers > 0 && (
              <span
                className="px-2 py-1 rounded-lg bg-white/90 dark:bg-white/80 text-gray-700 text-xs font-medium flex items-center gap-1 shadow-sm"
                data-testid={`badge-travelers-${citySlug}`}
              >
                <Users className="w-3 h-3" />
                {city.activeTravelers.toLocaleString()}
              </span>
            )}
            {city.totalAlerts > 0 && (
              <span
                className="px-2 py-1 rounded-lg bg-red-500 text-white text-xs font-medium flex items-center gap-1 shadow-sm"
                data-testid={`alert-count-${citySlug}`}
              >
                <Bell className="w-3 h-3" />
                {city.totalAlerts}
              </span>
            )}
          </div>

          {/* In-trip indicator — top-right (only when pulse badge shifts it) */}
          {inQueue && (
            <div className="absolute bottom-3 right-3">
              <span className="px-2.5 py-1 rounded-lg bg-green-500 text-white text-xs font-bold flex items-center gap-1 shadow-lg">
                <Check className="w-3 h-3" />
                In Trip
              </span>
            </div>
          )}

          {/* City name overlay */}
          <div className="absolute bottom-3 left-3 right-14">
            <h3
              className="text-2xl font-bold text-white"
              data-testid={`city-name-${citySlug}`}
            >
              {city.cityName}
            </h3>
            <div className="flex items-center gap-2 text-white/80 text-sm">
              <MapPin className="h-3 w-3" />
              <span>{city.country}</span>
            </div>
          </div>
        </div>

        {/* ── Card body ── */}
        <div className="p-4">
          {/* Current highlight */}
          {city.currentHighlight && (
            <div className="flex items-start gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-[#FF385C] mt-0.5 flex-shrink-0" />
              <span className="text-sm font-semibold text-[#FF385C] line-clamp-2">
                {city.currentHighlight}
              </span>
            </div>
          )}

          {/* Vibe tags */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {vibeTags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium capitalize",
                  vibeTagColors[tag] || "bg-muted text-muted-foreground"
                )}
              >
                {tag}
              </span>
            ))}
            {vibeTags.length > 3 && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                +{vibeTags.length - 3}
              </span>
            )}
          </div>

          {/* Price + crowd level */}
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-lg font-bold text-foreground">
                ${city.avgHotelPrice || "N/A"}
              </span>
              {priceChange !== 0 && (
                <span className={cn(
                  "text-xs flex items-center gap-0.5",
                  priceChange < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                )}>
                  {priceChange < 0 ? (
                    <TrendingDown className="h-3 w-3" />
                  ) : (
                    <TrendingUp className="h-3 w-3" />
                  )}
                  {Math.abs(priceChange)}%
                </span>
              )}
            </div>
            <span className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full capitalize",
              getCrowdLevelColor(city.crowdLevel)
            )}>
              {city.crowdLevel || "Unknown"}
            </span>
          </div>

          {/* Deal alert */}
          {city.dealAlert && (
            <div
              className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 mb-3"
              data-testid={`deal-alert-${citySlug}`}
            >
              <DollarSign className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium line-clamp-2">
                {city.dealAlert}
              </span>
            </div>
          )}

          {/* Footer stats — 3-col matching landing page */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border">
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Pulse {city.pulseScore}
            </div>
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {city.totalTrendingSpots} trending (7d)
            </div>
            <div className="flex items-center gap-1">
              <Gem className="h-3 w-3 text-purple-500 dark:text-purple-400" />
              {city.totalHiddenGems} gems
            </div>
          </div>

          {/* Take me Here CTA */}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                className="w-full mt-3"
                size="sm"
                data-testid={`button-take-me-here-${citySlug}`}
              >
                <Plane className="h-4 w-4 mr-2" />
                Take me Here
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="center" onClick={(e) => e.stopPropagation()}>
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Plan your trip to {city.cityName}</h4>
                <div className="space-y-2">
                  <Button
                    variant="default"
                    className="w-full justify-start"
                    size="sm"
                    onClick={handlePlanNow}
                    data-testid={`button-plan-now-${citySlug}`}
                  >
                    <Wand2 className="h-4 w-4 mr-2" />
                    Plan Now with AI
                  </Button>
                  <Button
                    variant={inQueue ? "secondary" : "outline"}
                    className="w-full justify-start"
                    size="sm"
                    onClick={handleAddToTrip}
                    data-testid={`button-add-to-trip-${citySlug}`}
                  >
                    {inQueue ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Remove from Trip
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Add to Multi-City Trip
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {inQueue
                    ? "This city is in your trip queue"
                    : "Add multiple cities and plan them together"}
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </motion.div>
  );
}

function CityGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="bg-card rounded-2xl overflow-hidden border border-border shadow-card">
          <Skeleton className="h-48 w-full" />
          <div className="p-4 space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-1.5">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-border">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CityGrid({ onCitySelect, selectedCityName }: CityGridProps) {
  const [selectedCity, setSelectedCity] = useState<TravelPulseCity | null>(null);
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  const { data, isLoading, error } = useQuery<{ cities: TravelPulseCity[]; count: number }>({
    queryKey: ["/api/travelpulse/cities"],
  });

  // Auto-select city from URL param when data loads
  useEffect(() => {
    if (selectedCityName && data?.cities && !hasAutoSelected) {
      const matchedCity = data.cities.find(
        (city) => city.cityName.toLowerCase() === selectedCityName.toLowerCase()
      );
      if (matchedCity) {
        setSelectedCity(matchedCity);
        setHasAutoSelected(true);
      }
    }
  }, [selectedCityName, data?.cities, hasAutoSelected]);

  const handleCityClick = (city: TravelPulseCity) => {
    setSelectedCity(city);
    onCitySelect?.(city);
  };

  const handleBack = () => {
    setSelectedCity(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <CityGridSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">Failed to load cities. Please try again.</p>
      </Card>
    );
  }

  const cities = data?.cities || [];

  if (selectedCity) {
    return (
      <CityDetailView
        cityName={selectedCity.cityName}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Trending Cities
          </h2>
          <p className="text-muted-foreground mt-1">
            Real-time intelligence from {cities.reduce((acc, c) => acc + c.activeTravelers, 0).toLocaleString()} travelers worldwide
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          <Calendar className="h-3 w-3 mr-1" />
          Live Updates
        </Badge>
      </div>

      {cities.length === 0 ? (
        <Card className="p-8 text-center">
          <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium mb-2">No cities available yet</p>
          <p className="text-muted-foreground">Check back soon for trending destinations!</p>
        </Card>
      ) : (
        <AnimatePresence mode="popLayout">
          <motion.div 
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            layout
          >
            {cities.map((city) => (
              <CityCard
                key={city.id}
                city={city}
                onClick={() => handleCityClick(city)}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
