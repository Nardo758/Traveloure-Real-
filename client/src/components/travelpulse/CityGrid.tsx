import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Zap,
  MapPin,
  DollarSign,
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
  LogIn,
  ChevronRight,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CityDetailView } from "./CityDetailView";
import { useTripQueue, QueuedCity } from "@/contexts/TripQueueContext";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

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
  const { user, isAuthenticated } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  const priceChange = parseFloat(city.priceChange || "0");
  const vibeTags = Array.isArray(city.vibeTags) ? city.vibeTags : [];
  const inQueue = isInQueue(city.id);

  // Fetch user's trips when dialog is open and user is logged in
  const { data: userTrips, isLoading: tripsLoading } = useQuery<any[]>({
    queryKey: ["/api/trips"],
    enabled: dialogOpen && isAuthenticated,
  });

  const handlePlanNow = () => {
    setDialogOpen(false);
    navigate(`/quick-start?destination=${encodeURIComponent(city.cityName)}&country=${encodeURIComponent(city.country)}`);
  };

  const handleSelectTrip = (tripId: string) => {
    setDialogOpen(false);
    navigate(`/trip/${tripId}?addCity=${encodeURIComponent(city.cityName)}&country=${encodeURIComponent(city.country)}`);
  };

  const handleAddToQueue = () => {
    setDialogOpen(false);
    if (inQueue) {
      removeCity(city.id);
      toast({
        title: "Removed from trip queue",
        description: `${city.cityName} has been removed from your multi-city trip.`,
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
        title: "Added to trip queue",
        description: `${city.cityName} added. Open "My Trip" to plan your multi-city adventure.`,
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
          <Button
            className="w-full mt-3"
            size="sm"
            onClick={(e) => { e.stopPropagation(); setDialogOpen(true); }}
            data-testid={`button-take-me-here-${citySlug}`}
          >
            <Plane className="h-4 w-4 mr-2" />
            Take me Here
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-[#FF385C]" />
                  Take me to {city.cityName}
                </DialogTitle>
                <DialogDescription>
                  Add this destination to a trip or start planning from scratch.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 pt-2">
                {/* ── Existing trips ── */}
                {isAuthenticated ? (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Add to an existing trip
                    </p>
                    {tripsLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-14 w-full rounded-xl" />
                        <Skeleton className="h-14 w-full rounded-xl" />
                      </div>
                    ) : userTrips && userTrips.length > 0 ? (
                      <ScrollArea className="max-h-48">
                        <div className="space-y-2 pr-1">
                          {userTrips.map((trip: any) => (
                            <button
                              key={trip.id}
                              onClick={() => handleSelectTrip(trip.id)}
                              className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:border-[#FF385C] hover:bg-[#FF385C]/5 transition-all text-left group"
                              data-testid={`button-select-trip-${trip.id}`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <FolderOpen className="h-4 w-4 text-primary" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{trip.title || "Untitled Trip"}</p>
                                  <p className="text-xs text-muted-foreground truncate">{trip.destination}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Badge variant="outline" className="text-xs capitalize hidden sm:flex">
                                  {trip.status}
                                </Badge>
                                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-[#FF385C] transition-colors" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-3 bg-muted/50 rounded-xl">
                        No trips yet — start one below.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-4 bg-muted/50 rounded-xl">
                    <LogIn className="h-8 w-8 text-muted-foreground" />
                    <div className="text-center">
                      <p className="text-sm font-medium">Sign in to access your trips</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Save cities and plan across multiple destinations
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => { setDialogOpen(false); navigate("/auth"); }}
                      data-testid="button-sign-in-prompt"
                    >
                      <LogIn className="h-4 w-4 mr-2" />
                      Sign In
                    </Button>
                  </div>
                )}

                <div className="border-t pt-4 space-y-2">
                  {/* ── New AI trip ── */}
                  <Button
                    className="w-full justify-start"
                    onClick={handlePlanNow}
                    data-testid={`button-plan-now-${citySlug}`}
                  >
                    <Wand2 className="h-4 w-4 mr-2" />
                    Plan New Trip with AI
                  </Button>

                  {/* ── Multi-city queue ── */}
                  <Button
                    variant={inQueue ? "secondary" : "outline"}
                    className="w-full justify-start"
                    onClick={handleAddToQueue}
                    data-testid={`button-add-to-queue-${citySlug}`}
                  >
                    {inQueue ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Remove from Multi-City Queue
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Add to Multi-City Queue
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
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
  const [, navigate] = useLocation();

  const { data, isLoading, error } = useQuery<{ cities: TravelPulseCity[]; count: number }>({
    queryKey: ["/api/travelpulse/cities"],
  });

  // Phase B: auto-navigate when selectedCityName prop is set and data loads
  useEffect(() => {
    if (selectedCityName && data?.cities) {
      const matchedCity = data.cities.find(
        (city) => city.cityName.toLowerCase() === selectedCityName.toLowerCase()
      );
      if (matchedCity) {
        navigate(
          `/discover/location/${encodeURIComponent(matchedCity.cityName)}?country=${encodeURIComponent(matchedCity.country || "")}`
        );
      }
    }
  }, [selectedCityName, data?.cities, navigate]);

  const handleCityClick = (city: TravelPulseCity) => {
    onCitySelect?.(city);
    navigate(
      `/discover/location/${encodeURIComponent(city.cityName)}?country=${encodeURIComponent(city.country || "")}`
    );
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
